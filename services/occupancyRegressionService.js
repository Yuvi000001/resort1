/**
 * Occupancy Forecasting - REAL supervised ML (Simple Linear Regression)
 * Uses `ml-regression` to fit occupancy% (y) against day index (x)
 * over the trailing historical window, then predicts tomorrow.
 */
const { SimpleLinearRegression } = require('ml-regression');
const OccupancyRecord = require('../models/OccupancyRecord');

async function forecastOccupancy() {
  const records = await OccupancyRecord.find().sort({ date: 1 });

  if (records.length < 5) {
    return {
      predictedOccupancy: null,
      demandLevel: 'Unknown',
      rSquared: null,
      explanation: 'Not enough historical data yet (need 5+ days) to fit a regression model.',
      history: records,
    };
  }

  const x = records.map((_, i) => i);
  const y = records.map((r) => r.occupancyPercentage);

  const model = new SimpleLinearRegression(x, y);
  const nextIndex = records.length;
  let predicted = model.predict(nextIndex);
  predicted = Math.max(0, Math.min(100, predicted));

  const rSquared = model.score(x, y).r2 ?? model.score(x, y);

  const recentSlope = model.slope;
  const trend = recentSlope > 0.15 ? 'upward' : recentSlope < -0.15 ? 'downward' : 'flat';

  let demandLevel = 'Medium';
  if (predicted >= 75) demandLevel = 'High';
  else if (predicted <= 40) demandLevel = 'Low';

  const explanation =
    `Linear regression fitted on the last ${records.length} days (R\u00b2 = ${rSquared.toFixed(2)}). ` +
    `Trend is ${trend} (slope ${recentSlope.toFixed(2)} pts/day), so tomorrow's occupancy is predicted at ${predicted.toFixed(1)}%.`;

  return {
    predictedOccupancy: Number(predicted.toFixed(1)),
    demandLevel,
    rSquared: Number(rSquared.toFixed(3)),
    trend,
    slope: Number(recentSlope.toFixed(3)),
    explanation,
    history: records.map((r) => ({ date: r.date, occupancyPercentage: r.occupancyPercentage, revenue: r.revenue })),
    regressionLine: x.map((xi) => ({ x: xi, y: Number(model.predict(xi).toFixed(1)) })),
  };
}

module.exports = { forecastOccupancy };
