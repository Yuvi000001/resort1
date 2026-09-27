const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const { getDigitalTwinSnapshot, simulateWeatherImpacts } = require('../services/weatherDigitalTwinService');

const router = express.Router();
router.use(protect, authorize('manager'));

router.get('/snapshot', async (req, res, next) => {
  try {
    res.json(await getDigitalTwinSnapshot());
  } catch (error) {
    next(error);
  }
});

router.post('/simulate', [
  body('rainfallMm24h').isFloat({ min: 0, max: 500 }),
  body('temperatureC').isFloat({ min: -20, max: 55 }),
  body('stormDurationHours').isFloat({ min: 0, max: 24 }),
  body('windKph').isFloat({ min: 0, max: 250 }),
  body('floodDepthCm').isFloat({ min: 0, max: 300 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Scenario values are outside supported limits.', errors: errors.array() });
  try {
    const snapshot = await getDigitalTwinSnapshot();
    res.json({ simulation: simulateWeatherImpacts(req.body, snapshot.context), context: snapshot.context, safetyNote: snapshot.safetyNote });
  } catch (error) {
    next(error);
  }
});

module.exports = router;