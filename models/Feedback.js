const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: '' },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    issues: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);