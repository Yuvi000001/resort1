const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  razorpayOrderId: { type: String, required: true, unique: true },
  razorpayPaymentId: { type: String, default: null },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: { type: String, enum: ['created', 'pending', 'paid', 'failed', 'cancelled', 'expired'], default: 'created' },
  signature: { type: String, default: null },
  verifiedBy: { type: String, enum: ['checkout_signature', 'webhook'], default: null },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: '' },
  webhookEventIds: [{ type: String }],
}, { timestamps: true });

paymentTransactionSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
