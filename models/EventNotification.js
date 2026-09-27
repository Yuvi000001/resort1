const mongoose = require('mongoose');

const eventNotificationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

eventNotificationSchema.index({ recipient: 1, createdAt: -1 });
eventNotificationSchema.index({ event: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('EventNotification', eventNotificationSchema);
