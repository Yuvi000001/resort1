const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    time: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    category: { type: String, default: 'General', trim: true },
    tags: [{ type: String, trim: true }],
    registrationDetails: { type: String, default: 'Register your interest in the app.' },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft' },
    publishedAt: { type: Date, default: null },
    registrations: [{ guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, status: { type: String, enum: ['interested', 'registered'], default: 'registered' }, createdAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

eventSchema.index({ status:  1, date: 1 });

module.exports = mongoose.model('Event', eventSchema);
