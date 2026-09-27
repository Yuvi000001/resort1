const express = require('express');
const Room = require('../models/Room');
const GuestRequest = require('../models/GuestRequest');
const Task = require('../models/Task');
const InventoryItem = require('../models/InventoryItem');
const OccupancyRecord = require('../models/OccupancyRecord');
const Alert = require('../models/Alert');
const { protect } = require('../middleware/auth');
const { forecastOccupancy } = require('../services/occupancyRegressionService');

const router = express.Router();

router.get('/summary', protect, async (req, res, next) => {
  try {
    const totalRooms = await Room.countDocuments();
    const occupiedRooms = await Room.countDocuments({ status: 'occupied' });
    const availableRooms = totalRooms - occupiedRooms;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRecord = await OccupancyRecord.findOne({ date: { $gte: today } }).sort({ date: -1 });

    const activeRequests = await GuestRequest.countDocuments({ status: { $ne: 'resolved' } });
    const pendingMaintenance = await Task.countDocuments({ department: 'Maintenance', status: { $ne: 'completed' } });
    const lowInventory = await InventoryItem.countDocuments({ $expr: { $lt: ['$currentStock', '$minimumStock'] } });
    const recentAlerts = await Alert.find({ status: 'active' }).sort({ createdAt: -1 }).limit(5);

    const occupancyHistory = await OccupancyRecord.find().sort({ date: 1 });
    const forecast = await forecastOccupancy();

    res.json({
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancyPercentage: todayRecord ? todayRecord.occupancyPercentage : occupancyHistory.at(-1)?.occupancyPercentage || 0,
      todayRevenue: todayRecord ? todayRecord.revenue : occupancyHistory.at(-1)?.revenue || 0,
      activeRequests,
      pendingMaintenance,
      lowInventory,
      recentAlerts,
      occupancyHistory,
      forecast,
    });
  } catch (err) { next(err); }
});

module.exports = router;
