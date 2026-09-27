const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateWeatherImpacts } = require('../services/weatherDigitalTwinService');

const context = {
  baselineOccupancy: 78,
  inHouseGuests: 100,
  availableStaff: 12,
  inventoryAtRisk: ['Bottled Water'],
};

test('ordinary weather keeps impacts low and preserves the resort baseline', () => {
  const result = simulateWeatherImpacts({
    rainfallMm24h: 0,
    temperatureC: 24,
    stormDurationHours: 0,
    windKph: 8,
    floodDepthCm: 0,
  }, context);

  assert.ok(result.riskIndex < 0.03);
  assert.equal(result.occupancy.baselinePercent, 78);
  assert.deepEqual(result.resources.inventoryAtRisk, ['Bottled Water']);
});

test('extreme weather propagates to staffing, movement, and resource estimates', () => {
  const result = simulateWeatherImpacts({
    rainfallMm24h: 300,
    temperatureC: 43,
    stormDurationHours: 24,
    windKph: 180,
    floodDepthCm: 200,
  }, context);

  assert.ok(result.riskIndex > 0.9);
  assert.ok(result.occupancy.projectedPercent >= 0 && result.occupancy.projectedPercent <= 100);
  assert.ok(result.staffing.additionalStaffRecommended > 0);
  assert.ok(result.staffing.commuteAvailabilityRiskPercent > 0);
  assert.ok(result.guestMovement.indoorShiftPercent > 0);
  assert.ok(result.resources.energyUseChangePercent > 0);
  assert.ok(result.occupancy.uncertaintyRangePercent[0] <= result.occupancy.projectedPercent);
  assert.ok(result.occupancy.uncertaintyRangePercent[1] >= result.occupancy.projectedPercent);
});

test('scenario extremes are clamped without mutating live operational context', () => {
  const originalContext = structuredClone(context);
  const result = simulateWeatherImpacts({
    rainfallMm24h: 900,
    temperatureC: 90,
    stormDurationHours: 40,
    windKph: 400,
    floodDepthCm: 900,
  }, context);

  assert.deepEqual(result.scenario, {
    rainfallMm24h: 500,
    temperatureC: 55,
    stormDurationHours: 24,
    windKph: 250,
    floodDepthCm: 300,
  });
  assert.deepEqual(context, originalContext);
});