const express = require('express');
const Staff = require('../models/Staff');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const staff = await Staff.find().populate('user', 'name email phone');
    res.json(staff);
  } catch (err) { next(err); }
});

// Manager creates a staff member: makes the login (User, role=staff) + the Staff record together.
router.post('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    const { name, email, password, phone, department, shift, availability } = req.body;
    if (!name || !email || !password || !department) {
      return res.status(400).json({ message: 'name, email, password and department are required' });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password, phone, role: 'staff' });
    const staff = await Staff.create({
      user: user._id,
      department,
      shift: shift || 'morning',
      availability: availability !== undefined ? availability : true,
    });
    const populated = await staff.populate('user', 'name email phone');
    res.status(201).json(populated);
  } catch (err) { next(err); }
});

router.put('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const { name, phone, department, shift, availability, currentWorkload } = req.body;
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    if (department !== undefined) staff.department = department;
    if (shift !== undefined) staff.shift = shift;
    if (availability !== undefined) staff.availability = availability;
    if (currentWorkload !== undefined) staff.currentWorkload = currentWorkload;
    await staff.save();

    if (name !== undefined || phone !== undefined) {
      await User.findByIdAndUpdate(staff.user, {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
      });
    }

    const populated = await staff.populate('user', 'name email phone');
    res.json(populated);
  } catch (err) { next(err); }
});

router.delete('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    await User.findByIdAndDelete(staff.user);
    res.json({ message: 'Staff removed' });
  } catch (err) { next(err); }
});

module.exports = router;