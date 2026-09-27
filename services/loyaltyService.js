const Booking = require('../models/Booking');
const LoyaltyOffer = require('../models/LoyaltyOffer');

const DEFAULT_OFFERS = [
  { title: 'Welcome back', description: 'Enjoy 5% off on your second visit.', minVisits: 2, discountPercent: 5, premium: false },
  { title: 'Returning guest reward', description: 'Enjoy 10% off on your third visit.', minVisits: 3, discountPercent: 10, premium: false },
  { title: 'Staylix premium guest', description: 'Unlock a special 15% premium offer after five visits.', minVisits: 5, discountPercent: 15, premium: true },
];

async function ensureDefaultOffers() {
  if (await LoyaltyOffer.countDocuments()) return;
  await LoyaltyOffer.insertMany(DEFAULT_OFFERS);
}

async function getVisitCount(guestId) {
  return Booking.countDocuments({ guest: guestId, status: { $in: ['checked-in', 'checked-out'] } });
}

async function getEligibleOffer(guestId) {
  await ensureDefaultOffers();
  const visitCount = await getVisitCount(guestId);
  const offers = await LoyaltyOffer.find({ active: true, minVisits: { $lte: visitCount } }).sort({ minVisits: -1, discountPercent: -1 });
  return { visitCount, offer: offers[0] || null };
}

async function getGuestOffers(guestId) {
  await ensureDefaultOffers();
  const visitCount = await getVisitCount(guestId);
  const offers = await LoyaltyOffer.find({ active: true }).sort({ minVisits: 1 });
  const eligible = offers.filter((offer) => offer.minVisits <= visitCount).sort((a, b) => b.discountPercent - a.discountPercent);
  const nextOffer = offers.find((offer) => offer.minVisits > visitCount) || null;
  return { visitCount, offers, eligibleOffer: eligible[0] || null, nextOffer };
}

async function calculateBookingPrice(guestId, basePrice) {
  await ensureDefaultOffers();
  const previousVisitCount = await getVisitCount(guestId);
  const visitCount = previousVisitCount + 1;
  const offers = await LoyaltyOffer.find({ active: true, minVisits: { $lte: visitCount } }).sort({ minVisits: -1, discountPercent: -1 });
  const offer = offers[0] || null;
  const originalPrice = Number(basePrice) || 0;
  const discountAmount = offer ? Number((originalPrice * offer.discountPercent / 100).toFixed(2)) : 0;
  return {
    originalPrice,
    discountAmount,
    totalPrice: Number((originalPrice - discountAmount).toFixed(2)),
    discountPercent: offer?.discountPercent || 0,
    appliedOffer: offer ? { id: offer._id, title: offer.title } : null,
    visitCount,
  };
}

module.exports = { ensureDefaultOffers, getVisitCount, getEligibleOffer, getGuestOffers, calculateBookingPrice };
