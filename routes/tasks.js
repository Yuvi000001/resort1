const express = require('express');
const Task = require('../models/Task');
const Staff = require('../models/Staff');
const { protect, authorize } = require('../middleware/auth');
const { emitEvent } = require('../sockets/socketHandler');
const { sendFeedbackRequest, notifyManagers } = require('../services/emailService');

const router = express.Router();

// Manager sees every task (read-only). Staff only sees tasks assigned to them.
router.get('/', protect, async (req, res, next) => {
  try {
    let filter = {};
    if (req.user.role === 'staff') {
      const staffDoc = await Staff.findOne({ user: req.user._id });
      filter = { assignedStaff: staffDoc ? staffDoc._id : null };
    }
    const tasks = await Task.find(filter)
      .populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name' } })
      .populate({ path: 'request', populate: { path: 'guest', select: 'name phone' } })
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) { next(err); }
});

// Only the staff member a task is assigned to can change its status.
router.put('/:id/status', protect, authorize('staff'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const staffDoc = await Staff.findOne({ user: req.user._id });
    if (!staffDoc || String(task.assignedStaff) !== String(staffDoc._id)) {
      return res.status(403).json({ message: 'You are not assigned to this task' });
    }

    task.status = status;
    if (status === 'in-progress') task.startedAt = new Date();
    if (status === 'completed') task.completedAt = new Date();
    await task.save();

    if (status === 'completed') {
      const completedTask = await Task.findById(task._id)
        .populate({ path: 'request', populate: { path: 'guest', select: 'name email' } })
        .populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name email' } });
      if (completedTask?.request?.guest) sendFeedbackRequest({ guest: completedTask.request.guest, task: completedTask });
      notifyManagers({ subject: 'Guest task completed', title: 'Task completed', intro: 'A staff member completed a guest task.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${task.title}</p>` });
    }

    if (status === 'completed' && staffDoc.currentWorkload > 0) {
      staffDoc.currentWorkload -= 1;
      await staffDoc.save();
    }

    emitEvent('task:update', task);
    res.json(task);
  } catch (err) { next(err); }
});

// Staff scans the room's QR (same one used for check-in/out) to mark whichever
// of their own tasks belongs to that room as completed — no need to find it
// in the list once the work is done.
router.post('/complete-by-room', protect, authorize('staff'), async (req, res, next) => {
  try {
    const { room } = req.body;
    if (!room) return res.status(400).json({ message: 'Room is required' });

    const staffDoc = await Staff.findOne({ user: req.user._id });
    if (!staffDoc) return res.status(404).json({ message: 'Staff profile not found' });

    const tasks = await Task.find({ assignedStaff: staffDoc._id, status: { $ne: 'completed' } })
      .populate('request')
      .sort({ createdAt: 1 });
    const task = tasks.find((t) => t.request && String(t.request.room) === room);
    if (!task) return res.status(404).json({ message: 'No pending task for this room assigned to you' });

    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();

    const completedTask = await Task.findById(task._id)
      .populate({ path: 'request', populate: { path: 'guest', select: 'name email' } })
      .populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name email' } });
    if (completedTask?.request?.guest) sendFeedbackRequest({ guest: completedTask.request.guest, task: completedTask });
    notifyManagers({ subject: 'Guest task completed', title: 'Task completed', intro: 'A staff member completed a guest task from the room QR workflow.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${task.title}</p>` });

    if (staffDoc.currentWorkload > 0) {
      staffDoc.currentWorkload -= 1;
      await staffDoc.save();
    }

    emitEvent('task:update', task);
    res.json(task);
  } catch (err) { next(err); }
});

module.exports = router;