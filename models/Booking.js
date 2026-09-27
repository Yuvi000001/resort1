const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guestCount: { type: Number, default: 1 },
    totalPrice: { type: Number, required: true },
    originalPrice: { type: Number, default: null },
    discountAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    appliedOffer: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'LoyaltyOffer', default: null },
      title: { type: String, default: '' },
    },
    status: { type: String, enum: ['pending-payment', 'payment-failed', 'payment-cancelled', 'confirmed', 'checked-in', 'checked-out', 'cancelled'], default: 'confirmed' },
    paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'failed', 'cancelled'], default: 'not_required' },
    paymentCurrency: { type: String, default: 'USD' },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    paymentVerifiedBy: { type: String, enum: ['checkout_signature', 'webhook'], default: null },
    paymentTimestamp: { type: Date, default: null },
    paymentExpiresAt: { type: Date, default: null },
    idempotencyKey: { type: String, default: null },
    paymentFailureReason: { type: String, default: '' },
  },
  { timestamps: true }
);

bookingSchema.index({ razorpayOrderId: 1 }, { unique: true, partialFilterExpression: { razorpayOrderId: { $type: 'string' } } });
bookingSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });
bookingSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

module.exports = mongoose.model('Booking', bookingSchema);
