const express = require('express');
const Event = require('../models/Event');
const EventNotification = require('../models/EventNotification');
const GuestRequest = require('../models/GuestRequest');
const Feedback = require('../models/Feedback');
const upload = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');
const { emitEvent } = require('../sockets/socketHandler');
const { sendEventAnnouncement } = require('../services/emailService');

const router = express.Router();

async function eventRelevance(event, guestId, requests, feedback) {
  const history = [...requests.map((item) => `${item.category} ${item.message}`), ...feedback.map((item) => `${item.comment} ${(item.issues || []).join(' ')}`)].join(' ').toLowerCase();
  const interests = [...(event.tags || []), event.category].filter(Boolean).map((value) => value.toLowerCase());
  const matches = interests.filter((interest) => interest && history.includes(interest));
  const isRegistered = event.registrations.some((registration) => String(registration.guest) === String(guestId));
  return { relevanceScore: Math.min(100, matches.length * 25), matchedInterests: matches, registrationStatus: isRegistered ? event.registrations.find((registration) => String(registration.guest) === String(guestId)).status : null };
}

router.get('/', protect, async (req, res, next) => {
  try {
    const filter = req.user.role === 'manager' ? {} : { status: 'published', date: { $gte: new Date() } };
    let eventQuery = Event.find(filter).sort({ date: 1 });
    if (req.user.role === 'manager') eventQuery = eventQuery.populate('registrations.guest', 'name email phone');
    const events = await eventQuery;
    if (req.user.role !== 'guest') return res.json(events);

    const [requests, feedback] = await Promise.all([
      GuestRequest.find({ guest: req.user._id }).select('category message'),
      Feedback.find({ guest: req.user._id }).select('comment issues'),
    ]);
    const enriched = await Promise.all(events.map(async (event) => ({ ...event.toObject(), ...(await eventRelevance(event, req.user._id, requests, feedback)) })));
    enriched.sort((a, b) => (b.relevanceScore - a.relevanceScore) || (new Date(a.date) - new Date(b.date)));
    res.json(enriched);
  } catch (err) { next(err); }
});

router.get('/notifications', protect, authorize('guest'), async (req, res, next) => {
  try {
    const notifications = await EventNotification.find({ recipient: req.user._id }).populate('event', 'name date time location image').sort({ createdAt: -1 }).limit(30);
    res.json(notifications);
  } catch (err) { next(err); }
});

router.put('/notifications/:id/read', protect, authorize('guest'), async (req, res, next) => {
  try {
    const notification = await EventNotification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { readAt: new Date() }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) { next(err); }
});

router.post('/upload-image', protect, authorize('manager'), upload.single('image'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please select an event image' });
    res.status(201).json({ url: `/uploads/rooms/${req.file.filename}` });
  } catch (err) { next(err); }
});

router.post('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    const event = await Event.create(req.body);
    res.status(201).json(event);
  } catch (err) { next(err); }
});

router.put('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) { next(err); }
});

router.post('/:id/publish', protect, authorize('manager'), async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const wasPublished = event.status === 'published';
    event.status = 'published';
    event.publishedAt = event.publishedAt || new Date();
    await event.save();
    if (!wasPublished) {
      const guests = await require('../models/User').find({ role: 'guest' }).select('_id');
      await EventNotification.insertMany(guests.map((guest) => ({ event: event._id, recipient: guest._id, title: `New event: ${event.name}`, message: `${event.name} is happening on ${new Date(event.date).toLocaleDateString()} at ${event.location}.` })), { ordered: false }).catch((err) => { if (err.code !== 11000) throw err; });
      await sendEventAnnouncement(event);
      emitEvent('event:published', { eventId: event._id, name: event.name });
    }
    res.json(event);
  } catch (err) { next(err); }
});

router.post('/:id/register', protect, authorize('guest'), async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, status: 'published', date: { $gte: new Date() } });
    if (!event) return res.status(404).json({ message: 'Upcoming event not found' });
    const status = req.body.status === 'interested' ? 'interested' : 'registered';
    const existing = event.registrations.find((registration) => String(registration.guest) === String(req.user._id));
    if (existing) existing.status = status;
    else event.registrations.push({ guest: req.user._id, status });
    await event.save();
    res.json({ message: status === 'interested' ? 'Added to your interests' : 'You are registered for this event', status, eventId: event._id });
  } catch (err) { next(err); }
});

router.delete('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    await EventNotification.deleteMany({ event: event._id });
    res.json({ message: 'Event deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
