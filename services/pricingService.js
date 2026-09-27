/**
 * Dynamic Pricing - explainable rule-based formula, fed by the
 * regression occupancy forecast (see occupancyRegressionService).
 */
function isWeekend(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getSeason(date = new Date()) {
  const month = date.getMonth();
  if ([11, 0, 1].includes(month)) return 'peak';
  if ([5, 6, 7].includes(month)) return 'normal';
  return 'low';
}

function calculatePrice({ basePrice, predictedOccupancy = 50, bookingTrend = 'flat', date = new Date() }) {
  let occupancyAdjustment = 0;
  if (predictedOccupancy >= 80) occupancyAdjustment = basePrice * 0.25;
  else if (predictedOccupancy >= 60) occupancyAdjustment = basePrice * 0.12;
  else if (predictedOccupancy <= 30) occupancyAdjustment = -basePrice * 0.1;

  const weekend = isWeekend(date);
  const weekendAdjustment = weekend ? basePrice * 0.1 : 0;

  const season = getSeason(date);
  const seasonAdjustment = season === 'peak' ? basePrice * 0.15 : season === 'low' ? -basePrice * 0.05 : 0;

  const trendAdjustment = bookingTrend === 'upward' ? basePrice * 0.05 : bookingTrend === 'downward' ? -basePrice * 0.03 : 0;

  const recommendedPrice = Math.round(basePrice + occupancyAdjustment + weekendAdjustment + seasonAdjustment + trendAdjustment);

  const reasons = [];
  if (occupancyAdjustment !== 0) reasons.push(`${occupancyAdjustment > 0 ? '+' : ''}${Math.round(occupancyAdjustment)} for ${predictedOccupancy}% predicted occupancy`);
  if (weekendAdjustment) reasons.push(`+${Math.round(weekendAdjustment)} weekend surcharge`);
  if (seasonAdjustment) reasons.push(`${seasonAdjustment > 0 ? '+' : ''}${Math.round(seasonAdjustment)} for ${season} season`);
  if (trendAdjustment) reasons.push(`${trendAdjustment > 0 ? '+' : ''}${Math.round(trendAdjustment)} for ${bookingTrend} booking trend`);

  return {
    basePrice,
    recommendedPrice,
    breakdown: { occupancyAdjustment, weekendAdjustment, seasonAdjustment, trendAdjustment },
    season,
    weekend,
    explanation: reasons.length
      ? `Price adjusted from base ${basePrice}: ${reasons.join(', ')}.`
      : `Base price held at ${basePrice}; no strong pricing signals today.`,
  };
}

module.exports = { calculatePrice, isWeekend, getSeason };
