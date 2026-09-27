const express = require('express');
const MaintenanceTask = require('../models/MaintenanceTask');
const Staff = require('../models/Staff');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { ensureMaintenanceTasks } = require('../services/maintenanceService');
const { notifyManagers } = require('../services/emailService');
const Booking = require('../models/Booking');
const { sendMaintenanceCompletion } = require('../services/emailService');

const router = express.Router();

async function getTasks(req) {
  await ensureMaintenanceTasks();
  let filter = {};
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ user: req.user._id });
    filter = { assignedStaff: staff?._id || null, status: { $ne: 'completed' } };
  }
  return MaintenanceTask.find(filter)
    .populate('room', 'roomNumber type status image')
    .populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name phone' } })
    .sort({ needScore: -1, dueAt: 1 });
}

router.get('/', protect, authorize('manager', 'staff'), async (req, res, next) => {
  try {
    res.json(await getTasks(req));
  } catch (err) { next(err); }
});

router.post('/:id/start', protect, authorize('staff'), async (req, res, next) => {
  try {
    const staff = await Staff.findOne({ user: req.user._id });
    const task = await MaintenanceTask.findOne({ _id: req.params.id, assignedStaff: staff?._id, status: { $ne: 'completed' } });
    if (!task) return res.status(404).json({ message: 'Assigned maintenance task not found' });
    task.status = 'in-progress';
    await task.save();
    res.json(task);
  } catch (err) { next(err); }
});

router.post('/:id/photo', protect, authorize('staff'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'After-maintenance photo is required' });
    const staff = await Staff.findOne({ user: req.user._id });
    const task = await MaintenanceTask.findOne({ _id: req.params.id, assignedStaff: staff?._id, status: { $ne: 'completed' } });
    if (!task) return res.status(404).json({ message: 'Assigned maintenance task not found' });
    task.afterPhoto = `/uploads/rooms/${req.file.filename}`;
    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();
    if (staff.currentWorkload > 0) {
      staff.currentWorkload -= 1;
      await staff.save();
    }
    const activeBooking = await Booking.findOne({ room: task.room, status: 'checked-in' }).populate('guest', 'name email');
    const completedTask = await task.populate('room', 'roomNumber type');
    if (activeBooking?.guest) sendMaintenanceCompletion({ guest: activeBooking.guest, task: completedTask });
    notifyManagers({
      subject: `Maintenance completed - Room ${task.room || ''}`,
      title: 'Maintenance completed',
      intro: 'A maintenance task was completed with an after-maintenance photo.',
      body: `<p style="font-size:15px;line-height:1.7;color:#60716d">Task <strong>${task.title}</strong> is complete. The after-maintenance photo has been uploaded to the workspace.</p>`,
    });
    res.json(task);
  } catch (err) { next(err); }
});

module.exports = router;
