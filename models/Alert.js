const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
