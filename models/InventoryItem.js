const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, enum: ['linen', 'toiletries', 'food', 'beverage', 'other'], default: 'other' },
    currentStock: { type: Number, required: true },
    unit: { type: String, default: 'units' },
    minimumStock: { type: Number, required: true },
    usagePerGuest: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
