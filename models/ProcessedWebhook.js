const mongoose = require('mongoose');

const processedWebhookSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  status: { type: String, enum: ['processing', 'processed'], default: 'processing' },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ProcessedWebhook', processedWebhookSchema);
