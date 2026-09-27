const express = require('express');
const InventoryItem = require('../models/InventoryItem');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    res.json(await InventoryItem.find());
  } catch (err) { next(err); }
});

router.post('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    res.status(201).json(await InventoryItem.create(req.body));
  } catch (err) { next(err); }
});

router.put('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) { next(err); }
});

router.delete('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const item = await InventoryItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

module.exports = router;