/**
 * Guest Segmentation - REAL unsupervised ML (K-Means clustering)
 * Uses `ml-kmeans` on min-max normalized guest features:
 * [totalSpend, avgStayLength, requestCount, sentimentScore]
 */
const { kmeans } = require('ml-kmeans');
const User = require('../models/User');
const Booking = require('../models/Booking');
const GuestRequest = require('../models/GuestRequest');
const Feedback = require('../models/Feedback');
const GuestSegment = require('../models/GuestSegment');

const K = 4;

function sentimentToScore(sentiment) {
  if (sentiment === 'positive') return 1;
  if (sentiment === 'negative') return -1;
  return 0;
}

function minMaxNormalize(matrix) {
  const cols = matrix[0].length;
  const mins = new Array(cols).fill(Infinity);
  const maxs = new Array(cols).fill(-Infinity);
  matrix.forEach((row) => row.forEach((v, i) => {
    if (v < mins[i]) mins[i] = v;
    if (v > maxs[i]) maxs[i] = v;
  }));
  return matrix.map((row) => row.map((v, i) => {
    const range = maxs[i] - mins[i];
    return range === 0 ? 0 : (v - mins[i]) / range;
  }));
}

function labelCluster(centroid) {
  const [spend, stay, requests, sentiment] = centroid;
  if (spend > 0.6 && stay < 0.4) return 'Premium Short-Stay';
  if (spend > 0.55 && requests > 0.4) return 'Frequent High-Spender';
  if (stay > 0.6 && spend < 0.5) return 'Long-Stay Guest';
  if (spend < 0.35 && requests < 0.35) return 'Budget Traveler';
  return 'Family Guest';
}

async function segmentGuests() {
  const guests = await User.find({ role: 'guest' });
  if (guests.length < K) {
    return { clusters: [], guests: [], explanation: 'Guest data is still being collected for clustering.' };
  }

  const features = [];
  for (const guest of guests) {
    const bookings = await Booking.find({ guest: guest._id });
    const totalSpend = bookings.reduce((s, b) => s + (b.totalPrice || 0), 0);
    const avgStayLength = bookings.length
      ? bookings.reduce((s, b) => s + Math.max(1, (new Date(b.checkOut) - new Date(b.checkIn)) / 86400000), 0) / bookings.length
      : 0;
    const requestCount = await GuestRequest.countDocuments({ guest: guest._id });
    const feedbacks = await Feedback.find({ guest: guest._id });
    const sentimentScore = feedbacks.length
      ? feedbacks.reduce((s, f) => s + sentimentToScore(f.sentiment), 0) / feedbacks.length
      : 0;

    features.push({ guestId: guest._id, name: guest.name, raw: [totalSpend, avgStayLength, requestCount, sentimentScore] });
  }

  const matrix = features.map((f) => f.raw);
  const normalized = minMaxNormalize(matrix);

  const result = kmeans(normalized, K, { seed: 42 });

  const clusterMeta = Array.from({ length: K }, (_, id) => {
    const centroid = result.centroids[id];
    return { clusterId: id, label: labelCluster(centroid), centroid, size: 0 };
  });

  const assignments = [];
  for (let i = 0; i < features.length; i++) {
    const clusterId = result.clusters[i];
    clusterMeta[clusterId].size += 1;
    const [spend, avgStayLength, requestCount, sentimentScore] = features[i].raw;

    const doc = await GuestSegment.findOneAndUpdate(
      { guest: features[i].guestId },
      {
        guest: features[i].guestId,
        clusterId,
        clusterLabel: clusterMeta[clusterId].label,
        features: { spend, avgStayLength, requestCount, sentimentScore },
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    assignments.push({
      guestId: features[i].guestId,
      name: features[i].name,
      clusterId,
      clusterLabel: clusterMeta[clusterId].label,
      x: normalized[i][0],
      y: normalized[i][1],
      raw: { spend, avgStayLength, requestCount, sentimentScore },
    });
  }

  return {
    clusters: clusterMeta.map((c) => ({ clusterId: c.clusterId, label: c.label, size: c.size })),
    guests: assignments,
    explanation: `K-Means (k=${K}) trained on ${features.length} guests using min-max normalized spend, stay length, request count and sentiment. Each cluster is labeled from its centroid's dominant traits.`,
  };
}

module.exports = { segmentGuests };
