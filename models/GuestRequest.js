const mongoose = require('mongoose');

const guestRequestSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    message: { type: String, required: true },
    category: {
      type: String,
      enum: ['Housekeeping', 'Maintenance', 'RoomService', 'Restaurant', 'Spa', 'Other'],
      default: 'Other',
    },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['open', 'assigned', 'in-progress', 'resolved'], default: 'open' },
    read: { type: Boolean, default: false },
    managerReply: { type: String, default: '' },
    replyAt: { type: Date, default: null },
    conversation: [
      {
        sender: { type: String, enum: ['guest', 'manager', 'staff'], required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('GuestRequest', guestRequestSchema);
