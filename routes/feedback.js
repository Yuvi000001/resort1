const express = require('express');
const Feedback = require('../models/Feedback');
const Task = require('../models/Task');
const Staff = require('../models/Staff');
const { analyzeSentiment } = require('../services/sentimentService');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Guest submits feedback — either general (resort) or tied to a completed task/staff member.
router.post('/', protect, authorize('guest'), async (req, res, next) => {
  try {
    const { booking, task, rating, comment } = req.body;
    const { sentiment, issues } = analyzeSentiment(comment, rating);

    let staff = null;
    if (task) {
      const taskDoc = await Task.findById(task);
      if (taskDoc) staff = taskDoc.assignedStaff;
    }

    const feedback = await Feedback.create({
      guest: req.user._id, booking, task: task || undefined, staff: staff || undefined, rating, comment, sentiment, issues,
    });
    res.status(201).json(feedback);
  } catch (err) { next(err); }
});

// Overall resort feedback — manager only.
router.get('/analytics', protect, authorize('manager'), async (req, res, next) => {
  try {
    const all = await Feedback.find();
    const total = all.length || 1;
    const counts = { positive: 0, neutral: 0, negative: 0 };
    all.forEach((f) => counts[f.sentiment]++);
    const avgRating = all.length ? all.reduce((s, f) => s + f.rating, 0) / all.length : 0;
    res.json({
      total: all.length,
      avgRating: Number(avgRating.toFixed(2)),
      distribution: counts,
      positivePct: Number(((counts.positive / total) * 100).toFixed(1)),
      negativePct: Number(((counts.negative / total) * 100).toFixed(1)),
      recent: all.slice(-10).reverse(),
    });
  } catch (err) { next(err); }
});

// Per-staff averages for every staff member at once — manager's staff cards use this.
router.get('/staff-summary', protect, authorize('manager'), async (req, res, next) => {
  try {
    const rows = await Feedback.aggregate([
      { $match: { staff: { $ne: null } } },
      { $group: { _id: '$staff', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const summary = {};
    rows.forEach((r) => { summary[r._id] = { avgRating: Number(r.avgRating.toFixed(2)), count: r.count }; });
    res.json(summary);
  } catch (err) { next(err); }
});

// Feedback left for one staff member — manager (staff card detail) or that staff member themselves.
router.get('/staff/:staffId', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'staff') {
      const own = await Staff.findOne({ user: req.user._id });
      if (!own || String(own._id) !== req.params.staffId) {
        return res.status(403).json({ message: 'Not authorized to view this staff feedback' });
      }
    } else if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const feedback = await Feedback.find({ staff: req.params.staffId })
      .populate('guest', 'name')
      .populate('task', 'title department')
      .sort({ createdAt: -1 });
    const avgRating = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;
    res.json({ avgRating: Number(avgRating.toFixed(2)), count: feedback.length, feedback });
  } catch (err) { next(err); }
});

// Shortcut for the logged-in staff member's own feedback (used by the staff dashboard/feedback tab).
router.get('/mine', protect, authorize('staff'), async (req, res, next) => {
  try {
    const own = await Staff.findOne({ user: req.user._id });
    if (!own) return res.json({ avgRating: 0, count: 0, feedback: [] });

    const feedback = await Feedback.find({ staff: own._id })
      .populate('guest', 'name')
      .populate('task', 'title department')
      .sort({ createdAt: -1 });
    const avgRating = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;
    res.json({ avgRating: Number(avgRating.toFixed(2)), count: feedback.length, feedback });
  } catch (err) { next(err); }
});

module.exports = router;