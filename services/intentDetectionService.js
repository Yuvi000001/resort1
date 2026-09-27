/**
 * Guest request intent detection - rule/keyword based (no LLM).
 */
const RULES = [
  { category: 'Maintenance', priority: 'high', keywords: ['ac', 'air condition', 'air conditioner', 'cooling', 'not cooling', 'leak', 'broken', 'not working', 'repair', 'fix', 'electric', 'electrical', 'plumbing', 'wifi down', 'power cut', 'fan'] },
  { category: 'Housekeeping', priority: 'normal', keywords: ['towel', 'clean', 'housekeeping', 'sheets', 'bed made', 'vacuum', 'trash', 'toiletries'] },
  { category: 'RoomService', priority: 'normal', keywords: ['room service', 'food to room', 'order food', 'breakfast in room', 'deliver'] },
  { category: 'Restaurant', priority: 'low', keywords: ['restaurant', 'reservation', 'table', 'dinner', 'menu'] },
  { category: 'Spa', priority: 'low', keywords: ['spa', 'massage', 'activity', 'excursion', 'pool', 'yoga'] },
];

function detectIntent(message) {
  const text = message.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      const urgent = /urgent|asap|immediately|emergency/.test(text);
      return {
        category: rule.category,
        priority: urgent ? 'urgent' : rule.priority,
        matchedKeyword: rule.keywords.find((k) => text.includes(k)),
        explanation: `Matched keyword "${rule.keywords.find((k) => text.includes(k))}" \u2192 categorized as ${rule.category}.`,
      };
    }
  }
  return { category: 'Other', priority: 'normal', matchedKeyword: null, explanation: 'No keyword matched; routed to general/Other queue.' };
}

module.exports = { detectIntent };
