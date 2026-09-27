const Booking = require('../models/Booking');
const BookingSlot = require('../models/BookingSlot');
const PaymentTransaction = require('../models/PaymentTransaction');
const { createOrder, getCurrency, getRazorpay, fetchAndCapturePayment } = require('./razorpayService');

const HOLD_MINUTES = 15;

function stayDates(checkIn, checkOut) {
  const dates = [];
  const cursor = new Date(Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate()));
  const end = new Date(Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate()));
  while (cursor < end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function reserveBookingSlots(booking, expiresAt) {
  const dates = stayDates(booking.checkIn, booking.checkOut);
  await BookingSlot.deleteMany({ room: booking.room, stayDate: { $in: dates }, expiresAt: { $lte: new Date() } });
  const existing = await BookingSlot.find({ booking: booking._id }).select('stayDate');
  const existingKeys = new Set(existing.map((slot) => slot.stayDate.toISOString().slice(0, 10)));
  const missing = dates.filter((date) => !existingKeys.has(date.toISOString().slice(0, 10)));
  try {
    if (missing.length) await BookingSlot.insertMany(missing.map((stayDate) => ({ room: booking.room, stayDate, booking: booking._id, expiresAt })));
    else await BookingSlot.updateMany({ booking: booking._id }, { expiresAt });
  } catch (error) {
    await BookingSlot.deleteMany({ booking: booking._id, expiresAt });
    if (error.code === 11000 || error.writeErrors?.some((entry) => entry.code === 11000)) {
      const conflict = new Error('This room was just reserved for those dates. Choose another room or dates.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function releaseBookingSlots(bookingId) {
  await BookingSlot.deleteMany({ booking: bookingId });
}

async function expireStalePaymentHolds() {
  const expired = await Booking.find({ status: 'pending-payment', paymentExpiresAt: { $lte: new Date() } }).select('_id');
  if (!expired.length) return;
  const ids = expired.map((booking) => booking._id);
  await Booking.updateMany({ _id: { $in: ids }, status: 'pending-payment' }, { $set: { status: 'payment-failed', paymentStatus: 'failed', paymentFailureReason: 'Payment hold expired' } });
  await PaymentTransaction.updateMany({ booking: { $in: ids }, status: { $in: ['created', 'pending'] } }, { $set: { status: 'expired', failureReason: 'Payment hold expired' } });
  await BookingSlot.deleteMany({ booking: { $in: ids } });
}

async function createOrderForBooking(booking, guest) {
  const amount = Math.round(Number(booking.totalPrice) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) {
    const error = new Error('Booking amount must be at least 1.00 in the configured currency');
    error.statusCode = 400;
    throw error;
  }
  const currency = getCurrency();
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
  await reserveBookingSlots(booking, expiresAt);
  const order = await createOrder({
    amount,
    currency,
    receipt: `stay-${String(booking._id).slice(-24)}`,
    notes: { bookingId: String(booking._id), guestId: String(guest._id), roomId: String(booking.room) },
  });
  const transaction = await PaymentTransaction.create({
    booking: booking._id,
    guest: guest._id,
    razorpayOrderId: order.id,
    amount,
    currency,
    status: 'created',
  });
  booking.status = 'pending-payment';
  booking.paymentStatus = 'pending';
  booking.paymentCurrency = currency;
  booking.razorpayOrderId = order.id;
  booking.paymentExpiresAt = expiresAt;
  booking.paymentFailureReason = '';
  await booking.save();
  transaction.status = 'pending';
  await transaction.save();
  return { order, transaction, expiresAt, amount, currency };
}

async function captureAndConfirm({ transaction, paymentId, signature }) {
  const booking = await Booking.findById(transaction.booking);
  if (!booking) throw new Error('Booking not found for this payment');
  if (transaction.status === 'paid' && transaction.razorpayPaymentId === paymentId) {
    if (signature && !booking.razorpaySignature) {
      booking.razorpaySignature = signature;
      booking.paymentVerifiedBy = 'checkout_signature';
      await booking.save();
      transaction.signature = signature;
      transaction.verifiedBy = 'checkout_signature';
      await transaction.save();
    }
    return { booking, alreadyPaid: true };
  }
  if (booking.paymentStatus === 'paid') {
    if (booking.razorpayPaymentId === paymentId) {
      await PaymentTransaction.updateOne({ _id: transaction._id }, { $set: { status: 'paid', razorpayPaymentId: paymentId, signature: signature || transaction.signature, verifiedBy: signature ? 'checkout_signature' : (transaction.verifiedBy || 'webhook'), paidAt: transaction.paidAt || booking.paymentTimestamp, failureReason: '' } });
      if (signature && !booking.razorpaySignature) {
        booking.razorpaySignature = signature;
        booking.paymentVerifiedBy = 'checkout_signature';
        await booking.save();
      }
      await BookingSlot.updateMany({ booking: booking._id }, { $set: { expiresAt: null } });
      return { booking, alreadyPaid: true };
    }
    try { await getRazorpay().payments.refund(paymentId); } catch (error) { console.error('Duplicate payment refund requires review:', error.message); }
    throw new Error('This booking is already paid. A duplicate payment, if captured, has been sent for refund review.');
  }
  if (booking.razorpayOrderId !== transaction.razorpayOrderId) {
    try {
      const oldPayment = await fetchAndCapturePayment(paymentId, { orderId: transaction.razorpayOrderId, amount: transaction.amount, currency: transaction.currency });
      await getRazorpay().payments.refund(oldPayment.id);
    } catch (error) { console.error('Obsolete order payment requires refund review:', error.message); }
    throw new Error('This payment order is no longer active. Any late captured payment is being reviewed for refund.');
  }
  if (booking.paymentExpiresAt && booking.paymentExpiresAt <= new Date()) {
    try { await getRazorpay().payments.refund(paymentId); } catch (error) { console.error('Late payment refund requires review:', error.message); }
    throw new Error('The reservation hold expired. Any captured payment is being reviewed for refund. Please retry booking.');
  }

  const payment = await fetchAndCapturePayment(paymentId, {
    orderId: transaction.razorpayOrderId,
    amount: transaction.amount,
    currency: transaction.currency,
  });
  const update = await Booking.updateOne(
    { _id: booking._id, paymentStatus: { $ne: 'paid' }, status: { $in: ['pending-payment', 'payment-cancelled', 'payment-failed'] }, razorpayOrderId: transaction.razorpayOrderId },
    { $set: { status: 'confirmed', paymentStatus: 'paid', razorpayPaymentId: paymentId, razorpaySignature: signature || null, paymentVerifiedBy: signature ? 'checkout_signature' : 'webhook', paymentTimestamp: new Date(), paymentFailureReason: '', paymentExpiresAt: null } },
  );
  if (update.modifiedCount) {
    await PaymentTransaction.updateOne({ _id: transaction._id, status: { $ne: 'paid' } }, { $set: { status: 'paid', razorpayPaymentId: paymentId, signature: signature || null, verifiedBy: signature ? 'checkout_signature' : 'webhook', paidAt: new Date(), failureReason: '' } });
    await BookingSlot.updateMany({ booking: booking._id }, { $set: { expiresAt: null } });
    return { booking: await Booking.findById(booking._id).populate([{ path: 'guest', select: 'name email phone' }, { path: 'room' }]), payment, alreadyPaid: false };
  }
  const latest = await Booking.findById(booking._id);
  if (latest?.paymentStatus === 'paid' && latest.razorpayPaymentId === paymentId) return { booking: latest, payment, alreadyPaid: true };
  throw new Error('Booking could not be confirmed for this payment');
}

module.exports = { HOLD_MINUTES, stayDates, reserveBookingSlots, releaseBookingSlots, expireStalePaymentHolds, createOrderForBooking, captureAndConfirm };
