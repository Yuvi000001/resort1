const express = require('express');
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');
const { forecastOccupancy } = require('../services/occupancyRegressionService');
const { segmentGuests } = require('../services/guestSegmentationService');
const { recommendStaffing } = require('../services/staffRecommendationService');
const { predictInventoryNeeds } = require('../services/inventoryPredictionService');
const { calculatePrice } = require('../services/pricingService');

const router = express.Router();

router.get('/occupancy-prediction', protect, async (req, res, next) => {
  try {
    res.json(await forecastOccupancy());
  } catch (err) { next(err); }
});

router.get('/guest-segmentation', protect, async (req, res, next) => {
  try {
    res.json(await segmentGuests());
  } catch (err) { next(err); }
});

router.get('/staff-recommendations', protect, async (req, res, next) => {
  try {
    const forecast = await forecastOccupancy();
    const totalRooms = await Room.countDocuments();
    res.json(await recommendStaffing(forecast.predictedOccupancy || 50, totalRooms || 1));
  } catch (err) { next(err); }
});

router.get('/inventory-predictions', protect, async (req, res, next) => {
  try {
    const forecast = await forecastOccupancy();
    const totalRooms = await Room.countDocuments();
    const predictedGuests = Math.round(((forecast.predictedOccupancy || 50) / 100) * (totalRooms || 1) * 1.8);
    res.json(await predictInventoryNeeds(predictedGuests));
  } catch (err) { next(err); }
});

router.get('/pricing-recommendation', protect, async (req, res, next) => {
  try {
    const forecast = await forecastOccupancy();
    const { roomId } = req.query;
    const room = roomId ? await Room.findById(roomId) : await Room.findOne();
    const basePrice = room ? room.basePrice : 100;
    const bookingTrend = forecast.trend === 'upward' ? 'upward' : forecast.trend === 'downward' ? 'downward' : 'flat';
    res.json(calculatePrice({ basePrice, predictedOccupancy: forecast.predictedOccupancy || 50, bookingTrend }));
  } catch (err) { next(err); }
});

module.exports = router;
