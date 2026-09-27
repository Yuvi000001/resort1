const mongoose = require('mongoose');

const bookingSlotSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  stayDate: { type: Date, required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

bookingSlotSchema.index({ room: 1, stayDate: 1 }, { unique: true });
bookingSlotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BookingSlot', bookingSlotSchema);
