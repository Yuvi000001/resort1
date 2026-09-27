const mongoose = require('mongoose');

const occupancyRecordSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    totalRooms: { type: Number, required: true },
    occupiedRooms: { type: Number, required: true },
    occupancyPercentage: { type: Number, required: true },
    revenue: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OccupancyRecord', occupancyRecordSchema);
