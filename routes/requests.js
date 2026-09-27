const express = require('express');
const GuestRequest = require('../models/GuestRequest');
const Task = require('../models/Task');
const Staff = require('../models/Staff');
const Feedback = require('../models/Feedback');
const { detectIntent } = require('../services/intentDetectionService');
const { assignTaskForRequest } = require('../services/taskAssignmentService');
const { protect, authorize } = require('../middleware/auth');
const { emitEvent } = require('../sockets/socketHandler');
const { sendGuestMessage, sendGuestAssignment, sendStaffMessage, notifyManagers } = require('../services/emailService');

const router = express.Router();

// Manager can only view guest requests; guests are the ones who submit them.
// Guest's phone comes along too, so a manager can call them to confirm the request was fulfilled.
router.get('/', protect, async (req, res, next) => {
  try {
    let filter = req.user.role === 'guest' ? { guest: req.user._id } : {};
    if (req.user.role === 'staff') {
      const staffDoc = await Staff.findOne({ user: req.user._id });
      const assignedTasks = staffDoc ? await Task.find({ assignedStaff: staffDoc._id }).select('request') : [];
      filter = { _id: { $in: assignedTasks.map((task) => task.request) } };
    }
    const requests = await GuestRequest.find(filter)
      .populate('guest', 'name phone')
      .populate('room', 'roomNumber')
      .sort({ createdAt: -1 });

    // Attach each request's task (status + who it's assigned to) so a guest can rate
    // the staff member once it's completed, and whether they already left feedback for it.
    const tasks = await Task.find({ request: { $in: requests.map((r) => r._id) } })
      .populate({
        path: 'assignedStaff',
        select: 'user department currentWorkload availability',
        populate: { path: 'user', select: 'name phone email' },
      })
      .sort({ createdAt: -1 });
    const taskByRequest = {};
    tasks.forEach((t) => {
      if (!taskByRequest[String(t.request)]) taskByRequest[String(t.request)] = t;
    });

    let feedbackedTaskIds = new Set();
    if (req.user.role === 'guest') {
      const feedbacks = await Feedback.find({ guest: req.user._id, task: { $ne: null } }, 'task');
      feedbackedTaskIds = new Set(feedbacks.map((f) => String(f.task)));
    }

    const withTask = requests.map((r) => {
      const task = taskByRequest[String(r._id)];
      return {
        ...r.toObject(),
        task: task ? {
          _id: task._id,
          title: task.title,
          status: task.status,
          department: task.department,
          priority: task.priority,
          assignedStaff: task.assignedStaff,
        } : null,
        feedbackGiven: task ? feedbackedTaskIds.has(String(task._id)) : false,
      };
    });

    res.json(withTask);
  } catch (err) { next(err); }
});

router.post('/', protect, authorize('guest'), async (req, res, next) => {
  try {
    const { message, room } = req.body;
    const intent = detectIntent(message);

    const existingRequest = await GuestRequest.findOne({ guest: req.user._id }).sort({ createdAt: -1 });
    if (existingRequest) {
      const latestMessage = String(message).trim();
      existingRequest.conversation.push({ sender: 'guest', message: latestMessage });
      existingRequest.read = false;
      existingRequest.message = latestMessage;
      existingRequest.category = intent.category;
      existingRequest.priority = intent.priority;
      existingRequest.status = 'assigned';
      if (room) existingRequest.room = room;
      await existingRequest.save();
      const expectedDepartment = intent.category === 'Other' ? 'Front Desk' : intent.category;
      let task = await Task.findOne({ request: existingRequest._id, status: { $ne: 'completed' }, department: expectedDepartment });
      if (!task) task = await assignTaskForRequest(existingRequest);
      if (task) {
        const assignedTask = await task.populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name email' } });
        const populatedRequest = await existingRequest.populate([{ path: 'guest', select: 'name email phone' }, { path: 'room', select: 'roomNumber' }]);
        sendGuestAssignment({ request: populatedRequest, task: assignedTask });
      }
      notifyManagers({
        subject: `${intent.priority === 'urgent' ? 'URGENT ' : ''}${intent.category} guest request update`,
        title: intent.priority === 'urgent' ? 'Urgent guest complaint' : 'Guest request update',
        intro: 'A guest request was updated and needs attention in the resort workspace.',
        body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${existingRequest.message}</p>`,
      });
      emitEvent('request:update', { request: existingRequest, task, intent });
      return res.status(201).json({ request: existingRequest, task, intent });
    }

    const request = await GuestRequest.create({
      guest: req.user._id,
      room: room || undefined,
      message,
      category: intent.category,
      priority: intent.priority,
      status: 'assigned',
      read: false,
      conversation: [{ sender: 'guest', message }],
    });

    const task = await assignTaskForRequest(request);

    const assignedTask = task && await task.populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name email' } });
    const populatedRequest = await request.populate([{ path: 'guest', select: 'name email phone' }, { path: 'room', select: 'roomNumber' }]);
    if (assignedTask) sendGuestAssignment({ request: populatedRequest, task: assignedTask });
    notifyManagers({ subject: `${request.priority === 'urgent' ? 'URGENT ' : ''}${request.category} guest request`, title: request.priority === 'urgent' ? 'Urgent guest complaint' : 'New guest request', intro: 'A new guest request needs attention in the resort workspace.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${request.message}</p>` });

    emitEvent('request:new', { request, task, intent });

    res.status(201).json({ request, task, intent });
  } catch (err) { next(err); }
});

router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const request = await GuestRequest.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    emitEvent('request:update', request);
    res.json(request);
  } catch (err) { next(err); }
});

router.put('/:id/read', protect, async (req, res, next) => {
  try {
    const request = await GuestRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.read = true;
    await request.save();
    emitEvent('request:update', request);
    res.json({ message: 'Request marked as read', request });
  } catch (err) { next(err); }
});

router.post('/:id/reply', protect, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: 'Reply message is required' });
    }

    const request = await GuestRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const replyMessage = String(message).trim();
    request.managerReply = replyMessage;
    request.replyAt = new Date();
    request.read = true;
    request.conversation.push({ sender: 'manager', message: replyMessage });
    await request.save();
    const populatedRequest = await request.populate('guest', 'name email phone');
    sendGuestMessage({ guest: populatedRequest.guest, sender: 'Manager', message: replyMessage });
    emitEvent('request:update', request);
    res.json({ message: 'Reply sent', request });
  } catch (err) { next(err); }
});

router.post('/:id/message', protect, async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const request = await GuestRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (req.user.role === 'guest' && String(request.guest) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You cannot message this request' });
    }

    if (req.user.role === 'staff') {
      const staffDoc = await Staff.findOne({ user: req.user._id });
      const assignedTask = staffDoc && await Task.findOne({ request: request._id, assignedStaff: staffDoc._id, status: { $ne: 'completed' } });
      if (!assignedTask) return res.status(403).json({ message: 'You are not assigned to this request' });
    }

    const sender = req.user.role === 'manager' ? 'manager' : req.user.role === 'staff' ? 'staff' : 'guest';
    request.conversation.push({ sender, message });
    if (sender === 'manager') {
      request.managerReply = message;
      request.replyAt = new Date();
      request.read = true;
    } else if (sender === 'guest') {
      request.read = false;
    }
    await request.save();
    if (sender !== 'guest') {
      const populatedRequest = await request.populate('guest', 'name email phone');
      sendGuestMessage({ guest: populatedRequest.guest, sender: sender === 'staff' ? 'Assigned staff' : 'Manager', message });
      if (sender === 'staff') {
        const assignedTask = await Task.findOne({ request: request._id, assignedStaff: (await Staff.findOne({ user: req.user._id }))?._id })
          .populate({ path: 'assignedStaff', populate: { path: 'user', select: 'name email' } });
        if (assignedTask) sendStaffMessage({ staff: assignedTask.assignedStaff, request: populatedRequest, message });
      }
    } else {
      const populatedRequest = await request.populate([{ path: 'guest', select: 'name email phone' }, { path: 'room', select: 'roomNumber' }]);
      notifyManagers({ subject: `Guest message - ${populatedRequest.category}`, title: 'Guest request update', intro: 'A guest sent a new message in the Help Desk.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">${populatedRequest.message}</p>` });
    }
    emitEvent('request:update', request);
    res.json({ message: 'Message sent', request });
  } catch (err) { next(err); }
});

module.exports = router;