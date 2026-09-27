const express = require('express');
const Room = require('../models/Room');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const rooms = await Room.find().populate('currentBooking');
    res.json(rooms);
  } catch (err) { next(err); }
});

router.post('/upload-image', protect, authorize('manager'), upload.single('image'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
    res.status(201).json({ url: `/uploads/rooms/${req.file.filename}` });
  } catch (err) { next(err); }
});

router.post('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      roomNumber: String(req.body.roomNumber || '').trim(),
    };
    const room = await Room.create(payload);
    res.status(201).json(room);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A room with this room number already exists.' });
    next(err);
  }
});

router.put('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const payload = req.body.roomNumber === undefined
      ? req.body
      : { ...req.body, roomNumber: String(req.body.roomNumber).trim() };
    const room = await Room.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A room with this room number already exists.' });
    next(err);
  }
});

router.delete('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Room deleted' });
  } catch (err) { next(err); }
});

module.exports = router;