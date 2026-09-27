const express = require('express');
const Booking = require('../models/Booking');
const LoyaltyOffer = require('../models/LoyaltyOffer');
const { protect, authorize } = require('../middleware/auth');
const { ensureDefaultOffers, getGuestOffers } = require('../services/loyaltyService');

const router = express.Router();

router.get('/my', protect, authorize('guest'), async (req, res, next) => {
  try {
    res.json(await getGuestOffers(req.user._id));
  } catch (err) { next(err); }
});

router.get('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    await ensureDefaultOffers();
    res.json(await LoyaltyOffer.find().sort({ minVisits: 1 }));
  } catch (err) { next(err); }
});

router.get('/guests', protect, authorize('manager'), async (req, res, next) => {
  try {
    const bookings = await Booking.find({ status: { $in: ['checked-in', 'checked-out'] } })
      .populate('guest', 'name email phone')
      .populate('room', 'roomNumber')
      .sort({ checkIn: -1 });
    const groups = new Map();
    bookings.forEach((booking) => {
      if (!booking.guest) return;
      const key = String(booking.guest._id);
      if (!groups.has(key)) groups.set(key, { guest: booking.guest, visits: 0, latestBooking: booking });
      groups.get(key).visits += 1;
    });
    await ensureDefaultOffers();
    const offers = await LoyaltyOffer.find({ active: true }).sort({ minVisits: -1 });
    res.json([...groups.values()].map((entry) => ({
      ...entry,
      offer: offers.find((offer) => offer.minVisits <= entry.visits) || null,
    })));
  } catch (err) { next(err); }
});

router.post('/', protect, authorize('manager'), async (req, res, next) => {
  try {
    const { title, description, minVisits, discountPercent, premium, active } = req.body;
    if (!title || !description || !Number(minVisits) || discountPercent === undefined) {
      return res.status(400).json({ message: 'Title, description, minimum visits and discount are required' });
    }
    const offer = await LoyaltyOffer.create({ title, description, minVisits: Number(minVisits), discountPercent: Number(discountPercent), premium: Boolean(premium), active: active !== false });
    res.status(201).json(offer);
  } catch (err) { next(err); }
});

router.put('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const offer = await LoyaltyOffer.findByIdAndUpdate(req.params.id, {
      ...req.body,
      ...(req.body.minVisits !== undefined && { minVisits: Number(req.body.minVisits) }),
      ...(req.body.discountPercent !== undefined && { discountPercent: Number(req.body.discountPercent) }),
    }, { new: true, runValidators: true });
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    res.json(offer);
  } catch (err) { next(err); }
});

router.delete('/:id', protect, authorize('manager'), async (req, res, next) => {
  try {
    const offer = await LoyaltyOffer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    res.json({ message: 'Offer removed' });
  } catch (err) { next(err); }
});

module.exports = router;
