const express = require('express');
const crypto = require('node:crypto');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendBookingConfirmation, sendRoomAccessEmail, sendCheckoutConfirmation, sendInvoiceReceipt, notifyManagers } = require('../services/emailService');
const { calculateBookingPrice } = require('../services/loyaltyService');
const { emitEvent } = require('../sockets/socketHandler');
const PaymentTransaction = require('../models/PaymentTransaction');
const ProcessedWebhook = require('../models/ProcessedWebhook');
const BookingSlot = require('../models/BookingSlot');
const { verifyCheckoutSignature, verifyWebhookSignature, getCurrency } = require('../services/razorpayService');
const { HOLD_MINUTES, stayDates, expireStalePaymentHolds, releaseBookingSlots, createOrderForBooking, captureAndConfirm } = require('../services/bookingPaymentService');

const router = express.Router();

router.get('/available', protect, authorize('guest'), async (req, res, next) => {
  try {
    await expireStalePaymentHolds();
    const checkIn = new Date(req.query.checkIn);
    const checkOut = new Date(req.query.checkOut);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      return res.status(400).json({ message: 'Select valid check-in and check-out dates' });
    }
    const conflicts = await Booking.find({
      $or: [
        { status: { $in: ['confirmed', 'checked-in'] } },
        { status: 'pending-payment', paymentExpiresAt: { $gt: new Date() } },
      ],
      checkIn: { $lt: checkOut },
      checkOut: { $gt: checkIn },
    }).select('room');
    const heldRooms = await BookingSlot.distinct('room', { stayDate: { $in: stayDates(checkIn, checkOut) }, expiresAt: { $gt: new Date() } });
    const unavailableIds = [...new Set([...conflicts.map((booking) => String(booking.room)), ...heldRooms.map(String)])];
    const guestCount = Math.max(1, Number(req.query.guests) || 1);
    const rooms = await Room.find({ status: { $nin: ['maintenance', 'cleaning'] }, capacity: { $gte: guestCount }, _id: { $nin: unavailableIds } }).sort({ basePrice: 1 });
    const nights = Math.ceil((checkOut - checkIn) / 86400000);
    const offers = await Promise.all(rooms.map(async (room) => {
      const pricing = await calculateBookingPrice(req.user._id, Number(room.basePrice) * nights);
      return { ...room.toObject(), nights, currency: getCurrency(), pricing };
    }));
    res.json(offers);
  } catch (err) { next(err); }
});

function paymentOrderResponse(booking, transaction, guest) {
  return {
    bookingId: booking._id,
    bookingStatus: booking.status,
    paymentStatus: booking.paymentStatus,
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: transaction.razorpayOrderId,
    amount: transaction.amount,
    currency: transaction.currency,
    expiresAt: booking.paymentExpiresAt,
    guest: { name: guest.name, email: guest.email || '', phone: guest.phone || '' },
    booking: { room: booking.room, checkIn: booking.checkIn, checkOut: booking.checkOut, totalPrice: booking.totalPrice, originalPrice: booking.originalPrice, discountAmount: booking.discountAmount, discountPercent: booking.discountPercent },
  };
}

async function findDateConflict(roomId, checkIn, checkOut, excludeBookingId) {
  const conflict = await Booking.findOne({
    room: roomId,
    ...(excludeBookingId && { _id: { $ne: excludeBookingId } }),
    $or: [
      { status: { $in: ['confirmed', 'checked-in'] } },
      { status: 'pending-payment', paymentExpiresAt: { $gt: new Date() } },
    ],
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  });
  if (conflict) return conflict;
  const heldSlot = await BookingSlot.exists({
    room: roomId,
    stayDate: { $in: stayDates(checkIn, checkOut) },
    expiresAt: { $gt: new Date() },
    ...(excludeBookingId && { booking: { $ne: excludeBookingId } }),
  });
  return heldSlot;
}

async function createNewOrderForBooking(booking, guest) {
  const oldAttempts = await PaymentTransaction.find({ booking: booking._id, status: { $in: ['created', 'pending', 'cancelled', 'failed'] } });
  await PaymentTransaction.updateMany({ _id: { $in: oldAttempts.map((attempt) => attempt._id) } }, { $set: { status: 'expired', failureReason: 'Replaced by a new payment attempt' } });
  try {
    const result = await createOrderForBooking(booking, guest);
    return paymentOrderResponse(booking, result.transaction, guest);
  } catch (error) {
    await releaseBookingSlots(booking._id).catch(() => {});
    await Booking.updateOne({ _id: booking._id, paymentStatus: { $ne: 'paid' } }, { $set: { status: 'payment-failed', paymentStatus: 'failed', paymentExpiresAt: new Date(), paymentFailureReason: error.message } }).catch(() => {});
    throw error;
  }
}

router.post('/payment/order', protect, authorize('guest'), async (req, res, next) => {
  let booking;
  let requestIdempotencyKey = '';
  try {
    await expireStalePaymentHolds();
    const idempotencyKey = requestIdempotencyKey = String(req.get('Idempotency-Key') || req.body.idempotencyKey || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 120) return res.status(400).json({ message: 'A valid idempotency key is required' });

    const existingBooking = await Booking.findOne({ guest: req.user._id, idempotencyKey });
    if (existingBooking?.paymentStatus === 'paid') return res.status(409).json({ message: 'This booking has already been paid', bookingId: existingBooking._id });
    if (existingBooking) {
      booking = existingBooking;
      const currentAttempt = await PaymentTransaction.findOne({ booking: booking._id, razorpayOrderId: booking.razorpayOrderId });
      if (currentAttempt && booking.paymentExpiresAt > new Date()) {
        currentAttempt.status = 'pending';
        await currentAttempt.save();
        booking.status = 'pending-payment';
        booking.paymentStatus = 'pending';
        await booking.save();
        return res.json(paymentOrderResponse(booking, currentAttempt, req.user));
      }
      const conflict = await findDateConflict(booking.room, booking.checkIn, booking.checkOut, booking._id);
      if (conflict) return res.status(409).json({ message: 'The room is no longer available for this reservation. Please choose another room or dates.' });
      return res.json(await createNewOrderForBooking(booking, req.user));
    }

    const checkIn = new Date(req.body.checkIn);
    const checkOut = new Date(req.body.checkOut);
    const guestCount = Number(req.body.guestCount);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn || checkIn < new Date(new Date().setHours(0, 0, 0, 0))) {
      return res.status(400).json({ message: 'Select valid future check-in and check-out dates' });
    }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) return res.status(400).json({ message: 'Guest count must be between 1 and 20' });
    const room = await Room.findById(req.body.room);
    if (!room || room.status === 'maintenance' || room.status === 'cleaning') return res.status(404).json({ message: 'Selected room is unavailable' });
    if (guestCount > room.capacity) return res.status(400).json({ message: 'This room does not have enough capacity for your guest count' });
    if (await findDateConflict(room._id, checkIn, checkOut)) return res.status(409).json({ message: 'This room is already booked for those dates. Choose another room or dates.' });

    const nights = Math.ceil((checkOut - checkIn) / 86400000);
    const pricing = await calculateBookingPrice(req.user._id, Number(room.basePrice) * nights);
    booking = await Booking.create({
      guest: req.user._id,
      room: room._id,
      checkIn,
      checkOut,
      guestCount,
      ...pricing,
      status: 'pending-payment',
      paymentStatus: 'pending',
      paymentCurrency: getCurrency(),
      idempotencyKey,
      paymentExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
    });
    const response = await createNewOrderForBooking(booking, req.user);
    res.status(201).json(response);
  } catch (err) {
    if (booking?._id) {
      await releaseBookingSlots(booking._id).catch(() => {});
      await Booking.updateOne({ _id: booking._id, paymentStatus: { $ne: 'paid' } }, { $set: { status: 'payment-failed', paymentStatus: 'failed', paymentFailureReason: err.message, paymentExpiresAt: new Date() } }).catch(() => {});
    }
    if (err.code === 11000) {
      if (!booking) {
        const existing = requestIdempotencyKey && await Booking.findOne({ guest: req.user._id, idempotencyKey: requestIdempotencyKey });
        const attempt = existing && await PaymentTransaction.findOne({ booking: existing._id, razorpayOrderId: existing.razorpayOrderId });
        if (existing && attempt && existing.paymentStatus !== 'paid') return res.status(200).json(paymentOrderResponse(existing, attempt, req.user));
        return res.status(409).json({ message: 'This booking request was already received. Refresh your bookings and retry payment from the existing reservation.' });
      }
      return res.status(409).json({ message: 'This room was just reserved for those dates. Choose another room or dates.' });
    }
    next(err);
  }
});

router.post('/payment/:bookingId/retry', protect, authorize('guest'), async (req, res, next) => {
  try {
    await expireStalePaymentHolds();
    const booking = await Booking.findOne({ _id: req.params.bookingId, guest: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.paymentStatus === 'paid') return res.status(409).json({ message: 'This booking is already paid' });
    const conflict = await findDateConflict(booking.room, booking.checkIn, booking.checkOut, booking._id);
    if (conflict) return res.status(409).json({ message: 'Room dates have since been booked. Contact the resort before retrying.' });
    const currentAttempt = await PaymentTransaction.findOne({ booking: booking._id, razorpayOrderId: booking.razorpayOrderId });
    if (currentAttempt && booking.paymentExpiresAt > new Date()) {
      currentAttempt.status = 'pending';
      currentAttempt.failureReason = '';
      await currentAttempt.save();
      booking.status = 'pending-payment';
      booking.paymentStatus = 'pending';
      booking.paymentFailureReason = '';
      await booking.save();
      return res.json(paymentOrderResponse(booking, currentAttempt, req.user));
    }
    res.json(await createNewOrderForBooking(booking, req.user));
  } catch (err) { next(err); }
});

async function notifySuccessfulPayment(booking, payment, alreadyPaid) {
  if (alreadyPaid) return;
  const populated = await Booking.findById(booking._id).populate([{ path: 'guest', select: 'name email phone' }, { path: 'room' }]);
  sendBookingConfirmation(populated);
  sendInvoiceReceipt(populated);
  notifyManagers({ subject: 'Paid online booking confirmed', title: 'Booking paid and confirmed', intro: 'A guest completed Razorpay payment and their room dates are confirmed.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">Guest <strong>${populated.guest?.name || 'Guest'}</strong> booked Room <strong>${populated.room?.roomNumber || '—'}</strong>. Payment ID: ${payment.id}</p>` });
  emitEvent('booking:update', { booking: populated, action: 'paid' });
}

router.post('/payment/verify', protect, authorize('guest'), async (req, res, next) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!orderId || !paymentId || !signature || !verifyCheckoutSignature(orderId, paymentId, signature)) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }
    const transaction = await PaymentTransaction.findOne({ razorpayOrderId: orderId, guest: req.user._id });
    if (!transaction) return res.status(404).json({ message: 'Payment order not found' });
    const result = await captureAndConfirm({ transaction, paymentId, signature });
    await notifySuccessfulPayment(result.booking, result.payment, result.alreadyPaid);
    res.json({ booking: result.booking, paymentId: result.booking.razorpayPaymentId || paymentId, paymentStatus: 'paid' });
  } catch (err) {
    const status = err.message.includes('already paid') ? 409 : 400;
    res.status(status).json({ message: err.message || 'Payment verification failed' });
  }
});

router.post('/payment/:bookingId/cancel', protect, authorize('guest'), async (req, res, next) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, guest: req.user._id, paymentStatus: { $ne: 'paid' }, status: { $in: ['pending-payment', 'payment-failed', 'payment-cancelled'] } },
      { $set: { status: 'payment-cancelled', paymentStatus: 'cancelled', paymentFailureReason: 'Customer cancelled checkout' } },
      { new: true },
    );
    if (!booking) return res.status(409).json({ message: 'Booking is already paid or is no longer pending' });
    await PaymentTransaction.updateOne({ booking: booking._id, razorpayOrderId: booking.razorpayOrderId, status: { $ne: 'paid' } }, { $set: { status: 'cancelled', failureReason: 'Customer cancelled checkout' } });
    res.json({ bookingId: booking._id, paymentStatus: booking.paymentStatus, message: 'Payment cancelled. You can retry before the reservation hold expires.' });
  } catch (err) { next(err); }
});

router.post('/payment/:bookingId/failure', protect, authorize('guest'), async (req, res, next) => {
  try {
    const reason = String(req.body.reason || 'Payment failed').slice(0, 300);
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, guest: req.user._id, paymentStatus: { $ne: 'paid' }, status: { $in: ['pending-payment', 'payment-failed', 'payment-cancelled'] } },
      { $set: { status: 'payment-failed', paymentStatus: 'failed', paymentFailureReason: reason } },
      { new: true },
    );
    if (!booking) return res.status(409).json({ message: 'Booking is already paid or is no longer pending' });
    const transaction = await PaymentTransaction.findOne({ booking: booking._id, razorpayOrderId: booking.razorpayOrderId, status: { $ne: 'paid' } });
    if (transaction) {
      transaction.status = 'failed';
      transaction.failureReason = reason;
      await transaction.save();
    }
    res.json({ bookingId: booking._id, paymentStatus: booking.paymentStatus, message: 'Payment failure recorded; the unpaid booking can be retried.' });
  } catch (err) { next(err); }
});

router.get('/payment/:bookingId/status', protect, authorize('guest'), async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.bookingId, guest: req.user._id }).populate('room', 'roomNumber type');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) { next(err); }
});

router.get('/', protect, async (req, res, next) => {
  try {
    await expireStalePaymentHolds();
    const filter = req.user.role === 'guest' ? { guest: req.user._id } : {};
    const bookings = await Booking.find(filter).populate('guest', 'name email phone').populate('room');
    res.json(bookings);
  } catch (err) { next(err); }
});

router.post('/', protect, async (req, res, next) => {
  try {
    if (!['guest', 'manager'].includes(req.user.role)) return res.status(403).json({ message: 'Only guests and managers can create bookings' });
    if (req.user.role === 'guest') return res.status(402).json({ message: 'Online guest bookings require Razorpay payment. Use /bookings/payment/order.' });
    const guest = req.user.role === 'guest' ? req.user._id : req.body.guest;
    const room = await Room.findById(req.body.room);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    let bookingData;
    if (req.user.role === 'guest') {
      const checkIn = new Date(req.body.checkIn);
      const checkOut = new Date(req.body.checkOut);
      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn || checkIn < new Date(new Date().setHours(0, 0, 0, 0))) {
        return res.status(400).json({ message: 'Select valid future check-in and check-out dates' });
      }
      if (Number(req.body.guestCount) > room.capacity) return res.status(400).json({ message: 'This room does not have enough capacity for your guest count' });
      if (room.status === 'maintenance' || room.status === 'cleaning') return res.status(409).json({ message: 'This room is currently unavailable' });
      const conflict = await Booking.findOne({ room: room._id, status: { $in: ['confirmed', 'checked-in'] }, checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } });
      if (conflict) return res.status(409).json({ message: 'This room was just booked for those dates. Please choose another room or dates.' });
      const nights = Math.ceil((checkOut - checkIn) / 86400000);
      const pricing = await calculateBookingPrice(guest, Number(room.basePrice) * nights);
      bookingData = { guest, room: room._id, checkIn, checkOut, guestCount: Math.max(1, Number(req.body.guestCount) || 1), ...pricing, status: 'confirmed' };
    } else {
      const pricing = await calculateBookingPrice(guest, req.body.totalPrice || room.basePrice);
      bookingData = { ...req.body, guest, ...pricing };
    }
    const booking = await Booking.create(bookingData);
    if (booking.status === 'checked-in' || req.user.role !== 'guest') await Room.findByIdAndUpdate(booking.room, { status: 'occupied', currentBooking: booking._id });
    const populated = await booking.populate([{ path: 'guest', select: 'name email phone' }, { path: 'room' }]);
    emitEvent('booking:update', { booking: populated, action: 'created' });
    sendBookingConfirmation(populated);
    sendInvoiceReceipt(populated);
    notifyManagers({ subject: 'New Staylix booking', title: 'New booking received', intro: 'A new booking has been created in the resort workspace.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">Guest <strong>${populated.guest?.name || 'Guest'}</strong> booked Room <strong>${populated.room?.roomNumber || '—'}</strong>.</p>` });
    res.status(201).json(populated);
  } catch (err) { next(err); }
});

// Manager scans the room QR -> fills guest details -> Check in.
// Creates (or reuses) the guest's User by phone and opens a checked-in booking.
// The guest's phone number IS their temporary login for the length of the stay.
router.post(
  '/checkin',
  protect,
  authorize('manager'),
  [
    body('room').notEmpty().withMessage('Room is required'),
    body('name').notEmpty().withMessage('Guest name is required'),
    body('phone').notEmpty().withMessage('Guest phone is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { room, name, phone, email, checkOut, guestCount, totalPrice } = req.body;

      const roomDoc = await Room.findById(room);
      if (!roomDoc) return res.status(404).json({ message: 'Room not found' });
      if (roomDoc.status === 'occupied') {
        return res.status(400).json({ message: 'Room is already occupied' });
      }

      let guest = await User.findOne({ phone, role: 'guest' });
      if (!guest) {
        guest = await User.create({ name, phone, email, role: 'guest' });
      } else if (name || email) {
        guest.name = name || guest.name;
        guest.email = email || guest.email;
        await guest.save();
      }

      const pricing = await calculateBookingPrice(guest._id, totalPrice || roomDoc.basePrice);
      let booking = await Booking.findOne({ guest: guest._id, room: roomDoc._id, status: 'confirmed' }).sort({ createdAt: -1 });
      const onlineReservation = Boolean(booking);
      if (booking) {
        booking.status = 'checked-in';
        booking.checkIn = new Date();
        if (checkOut) booking.checkOut = new Date(checkOut);
        await booking.save();
      } else {
        booking = await Booking.create({
          guest: guest._id,
          room: roomDoc._id,
          checkIn: new Date(),
          checkOut: checkOut ? new Date(checkOut) : new Date(Date.now() + 24 * 60 * 60 * 1000),
          guestCount: guestCount || 1,
          totalPrice: pricing.totalPrice,
          originalPrice: pricing.originalPrice,
          discountAmount: pricing.discountAmount,
          discountPercent: pricing.discountPercent,
          appliedOffer: pricing.appliedOffer || undefined,
          status: 'checked-in',
        });
      }

      roomDoc.status = 'occupied';
      roomDoc.currentBooking = booking._id;
      await roomDoc.save();

      const populated = await booking.populate([{ path: 'guest', select: 'name phone email' }, { path: 'room' }]);
      emitEvent('booking:update', { booking: populated, action: onlineReservation ? 'checked-in' : 'created' });
      if (!onlineReservation) sendBookingConfirmation(populated);
      sendRoomAccessEmail(populated);
      if (!onlineReservation) sendInvoiceReceipt(populated);
      notifyManagers({ subject: 'New guest checked in', title: 'Guest check-in completed', intro: 'A guest has checked in through the room access workflow.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${populated.guest?.name || 'Guest'} is checked in to Room ${populated.room?.roomNumber || '—'}.</p>` });
      res.status(201).json(populated);
    } catch (err) { next(err); }
  }
);

// Manager scans the same room QR while occupied -> Check out.
// Ends the booking, frees the room, and kills the guest's temporary login.
router.post('/checkout', protect, authorize('manager'), async (req, res, next) => {
  try {
    const { room, bookingId } = req.body;
    let booking;

    if (bookingId) {
      booking = await Booking.findById(bookingId);
    } else if (room) {
      booking = await Booking.findOne({ room, status: 'checked-in' });
    }
    if (!booking) return res.status(404).json({ message: 'Active booking not found' });

    booking.status = 'checked-out';
    await booking.save();

    await Room.findByIdAndUpdate(booking.room, { status: 'available', currentBooking: null });
    const populated = await booking.populate([{ path: 'guest', select: 'name email phone' }, { path: 'room' }]);
    emitEvent('booking:update', { booking: populated, action: 'checked-out' });
    sendCheckoutConfirmation(populated);

    res.json({ message: 'Guest checked out', booking });
  } catch (err) { next(err); }
});

async function handleRazorpayWebhook(req, res) {
  const rawBody = req.body;
  const signature = req.get('X-Razorpay-Signature');
  if (!verifyWebhookSignature(rawBody, signature)) return res.status(400).json({ message: 'Invalid Razorpay webhook signature' });

  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).json({ message: 'Invalid webhook JSON' }); }

  const eventId = req.get('X-Razorpay-Event-Id') || crypto.createHash('sha256').update(rawBody).digest('hex');
  const priorEvent = await ProcessedWebhook.findOne({ eventId });
  if (priorEvent?.status === 'processed') return res.status(200).json({ received: true, duplicate: true });
  if (priorEvent && Date.now() - priorEvent.createdAt.getTime() < 2 * 60 * 1000) {
    return res.status(503).json({ message: 'Webhook event is already being processed; Razorpay may retry' });
  }
  if (priorEvent) await ProcessedWebhook.deleteOne({ _id: priorEvent._id });
  try {
    await ProcessedWebhook.create({ eventId, eventType: event.event });
  } catch (error) {
    if (error.code === 11000) return res.status(503).json({ message: 'Webhook event is being processed; Razorpay may retry' });
    return res.status(500).json({ message: 'Could not reserve webhook event for processing' });
  }

  try {
    if (['payment.captured', 'payment.authorized'].includes(event.event)) {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) {
        const error = new Error('Webhook payment data is incomplete');
        error.statusCode = 400;
        throw error;
      }
      const transaction = await PaymentTransaction.findOne({ razorpayOrderId: payment.order_id });
      if (!transaction) {
        const error = new Error('Payment order is not ready for webhook processing');
        error.statusCode = 503;
        throw error;
      }
      const result = await captureAndConfirm({ transaction, paymentId: payment.id, signature: null });
      await notifySuccessfulPayment(result.booking, result.payment, result.alreadyPaid);
    } else if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        const transaction = await PaymentTransaction.findOne({ razorpayOrderId: payment.order_id });
        if (transaction && transaction.status !== 'paid') {
          transaction.status = 'failed';
          transaction.failureReason = payment.error_description || payment.error_reason || 'Payment failed';
          await transaction.save();
          await Booking.updateOne(
            { _id: transaction.booking, razorpayOrderId: transaction.razorpayOrderId, paymentStatus: { $ne: 'paid' } },
            { $set: { status: 'payment-failed', paymentStatus: 'failed', paymentFailureReason: transaction.failureReason } },
          );
          emitEvent('booking:update', { bookingId: transaction.booking, action: 'payment-failed' });
          emitEvent('booking:update', { bookingId: transaction.booking, action: 'payment-failed' });
        }
      }
    }

    await ProcessedWebhook.updateOne({ eventId }, { $set: { status: 'processed', processedAt: new Date() } });
    return res.status(200).json({ received: true });
  } catch (error) {
    await ProcessedWebhook.deleteOne({ eventId }).catch(() => {});
    console.error('Razorpay webhook processing failed:', error.message);
    return res.status(error.statusCode === 400 ? 400 : 500).json({ message: error.statusCode === 400 ? error.message : 'Webhook processing failed; Razorpay may retry' });
  }
}

router.handleRazorpayWebhook = handleRazorpayWebhook;

module.exports = router;