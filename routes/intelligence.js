const express = require('express');
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');
const { forecastOccupancy } = require('../services/occupancyRegressionService');
const { segmentGuests } = require('../services/guestSegmentationService');
const { recommendStaffing } = require('../services/staffRecommendationService');
const { predictInventoryNeeds } = require('../services/inventoryPredictionService');
const { calculatePrice } = require('../services/pricingService');
const { generateRecommendations } = require('../services/recommendationService');

const router = express.Router();

router.get('/overview', protect, async (req, res, next) => {
  try {
    const totalRooms = await Room.countDocuments();
    const forecast = await forecastOccupancy();
    const segmentation = await segmentGuests();
    const staffing = await recommendStaffing(forecast.predictedOccupancy || 50, totalRooms || 1);
    const inventory = await predictInventoryNeeds(staffing.predictedGuests || 0);
    const room = await Room.findOne();
    const pricing = calculatePrice({
      basePrice: room ? room.basePrice : 100,
      predictedOccupancy: forecast.predictedOccupancy || 50,
      bookingTrend: forecast.trend === 'upward' ? 'upward' : forecast.trend === 'downward' ? 'downward' : 'flat',
    });

    const recommendations = await generateRecommendations({ forecast, staffing, inventory, pricing, segmentation });

    res.json({ forecast, segmentation, staffing, inventory, pricing, recommendations });
  } catch (err) { next(err); }
});

module.exports = router;
