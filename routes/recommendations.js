const express = require('express');
const Recommendation = require('../models/Recommendation');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    res.json(await Recommendation.find().sort({ createdAt: -1 }).limit(50));
  } catch (err) { next(err); }
});

router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const rec = await Recommendation.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(rec);
  } catch (err) { next(err); }
});

module.exports = router;
