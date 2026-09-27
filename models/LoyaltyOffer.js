const mongoose = require('mongoose');

const loyaltyOfferSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    minVisits: { type: Number, required: true, min: 1 },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    premium: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

loyaltyOfferSchema.index({ minVisits: 1, active: 1 });

module.exports = mongoose.model('LoyaltyOffer', loyaltyOfferSchema);
