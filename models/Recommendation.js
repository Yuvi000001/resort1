const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['pending', 'accepted', 'dismissed'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recommendation', recommendationSchema);
