const express = require('express');
const Alert = require('../models/Alert');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    res.json(await Alert.find().sort({ createdAt: -1 }).limit(50));
  } catch (err) { next(err); }
});

router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(alert);
  } catch (err) { next(err); }
});

module.exports = router;
