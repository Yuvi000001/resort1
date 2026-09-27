/**
 * Inventory reorder prediction - rule-based, driven by predicted guests.
 */
const InventoryItem = require('../models/InventoryItem');

async function predictInventoryNeeds(predictedGuests) {
  const items = await InventoryItem.find();
  return items.map((item) => {
    const required = Math.ceil(predictedGuests * item.usagePerGuest);
    const shortfall = Math.max(0, required - item.currentStock);
    const reorderQty = shortfall > 0 ? Math.ceil(shortfall * 1.2) : 0;
    return {
      itemId: item._id,
      name: item.name,
      currentStock: item.currentStock,
      requiredForTomorrow: required,
      reorderQuantity: reorderQty,
      belowMinimum: item.currentStock < item.minimumStock,
      explanation: reorderQty > 0
        ? `Predicted ${predictedGuests} guests need ${required} ${item.unit} of ${item.name}; only ${item.currentStock} in stock \u2014 reorder ${reorderQty}.`
        : `${item.name} stock (${item.currentStock}) covers predicted demand (${required}).`,
    };
  });
}

module.exports = { predictInventoryNeeds };
