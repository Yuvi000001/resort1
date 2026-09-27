const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['Standard', 'Deluxe', 'Suite', 'Villa'], default: 'Standard' },
    basePrice: { type: Number, required: true },
    capacity: { type: Number, default: 2 },
    status: { type: String, enum: ['available', 'occupied', 'maintenance', 'cleaning'], default: 'available' },
    image: { type: String, default: null },
    currentBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);