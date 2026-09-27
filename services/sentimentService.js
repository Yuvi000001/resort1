/**
 * Basic keyword-based sentiment analysis for guest feedback (rule-based).
 */
const POSITIVE = ['great', 'excellent', 'amazing', 'love', 'wonderful', 'clean', 'friendly', 'perfect', 'fantastic', 'good', 'enjoyed'];
const NEGATIVE = ['bad', 'dirty', 'rude', 'slow', 'broken', 'terrible', 'worst', 'noisy', 'disappointed', 'poor', 'awful'];

function analyzeSentiment(comment = '', rating = 3) {
  const text = comment.toLowerCase();
  let score = 0;
  POSITIVE.forEach((w) => { if (text.includes(w)) score += 1; });
  NEGATIVE.forEach((w) => { if (text.includes(w)) score -= 1; });

  if (rating >= 4) score += 1;
  if (rating <= 2) score -= 1;

  const issues = NEGATIVE.filter((w) => text.includes(w));

  let sentiment = 'neutral';
  if (score > 0) sentiment = 'positive';
  if (score < 0) sentiment = 'negative';

  return { sentiment, score, issues };
}

module.exports = { analyzeSentiment };
