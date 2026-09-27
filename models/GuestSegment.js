const mongoose = require('mongoose');

const guestSegmentSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    clusterId: { type: Number, required: true },
    clusterLabel: { type: String, required: true },
    features: {
      spend: Number,
      avgStayLength: Number,
      requestCount: Number,
      sentimentScore: Number,
    },
    updatedAt: { type: Date, default: Date.now },
  }
);

module.exports = mongoose.model('GuestSegment', guestSegmentSchema);
