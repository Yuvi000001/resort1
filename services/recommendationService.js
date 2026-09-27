/**
 * Central recommendation engine - aggregates rule outputs from every
 * service (regression, kmeans, pricing, inventory, staffing, feedback)
 * into actionable Recommendation + Alert documents.
 */
const Recommendation = require('../models/Recommendation');
const Alert = require('../models/Alert');
const Feedback = require('../models/Feedback');

async function generateRecommendations({ forecast, staffing, inventory, pricing, segmentation }) {
  const created = [];

  if (forecast.demandLevel === 'High') {
    created.push(await Recommendation.create({
      type: 'staffing',
      title: 'Increase housekeeping coverage',
      description: `Predicted occupancy is ${forecast.predictedOccupancy}% (High demand). ${forecast.explanation}`,
      priority: 'high',
      data: { predictedOccupancy: forecast.predictedOccupancy },
    }));
  }

  for (const item of inventory.filter((i) => i.reorderQuantity > 0)) {
    created.push(await Recommendation.create({
      type: 'inventory',
      title: `Reorder ${item.name}`,
      description: item.explanation,
      priority: item.belowMinimum ? 'high' : 'normal',
      data: { itemId: item.itemId, reorderQuantity: item.reorderQuantity },
    }));
  }

  if (forecast.demandLevel === 'High' && pricing.recommendedPrice > pricing.basePrice) {
    created.push(await Recommendation.create({
      type: 'pricing',
      title: 'Raise room rates',
      description: `High demand + high occupancy: ${pricing.explanation}`,
      priority: 'normal',
      data: { recommendedPrice: pricing.recommendedPrice },
    }));
  }

  for (const staffRec of staffing.recommendations.filter((r) => r.shortfall > 0)) {
    created.push(await Recommendation.create({
      type: 'staffing',
      title: `Understaffed: ${staffRec.department}`,
      description: staffRec.recommendation,
      priority: 'high',
      data: staffRec,
    }));
  }

  const recentFeedback = await Feedback.find().sort({ createdAt: -1 }).limit(10);
  const negativeCount = recentFeedback.filter((f) => f.sentiment === 'negative').length;
  if (recentFeedback.length && negativeCount / recentFeedback.length >= 0.4) {
    await Alert.create({
      type: 'feedback',
      severity: 'warning',
      title: 'Negative feedback trend detected',
      message: `${negativeCount} of the last ${recentFeedback.length} reviews are negative. Investigate recurring issues.`,
    });
  }

  for (const seg of segmentation.clusters || []) {
    if (seg.label === 'Frequent High-Spender') {
      created.push(await Recommendation.create({
        type: 'segment-offer',
        title: `Targeted offer: ${seg.label}`,
        description: `${seg.size} guests fall in the "${seg.label}" segment. Suggest a loyalty upgrade or VIP perk to drive retention.`,
        priority: 'normal',
        data: seg,
      }));
    }
  }

  return created;
}

module.exports = { generateRecommendations };
