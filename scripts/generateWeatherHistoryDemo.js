const fs = require('node:fs');
const path = require('node:path');

const dailyExamples = [
  { rain: 0, temp: 27, storm: 0, wind: 8, flood: 0, occupancy: 72, newBookings: 8, cancellations: 1, outdoorGuests: 84, covers: 126, requests: 19, staffPlanned: 24, staffPresent: 23, travelDelays: 0, energyKwh: 890, waterLitres: 4820 },
  { rain: 5, temp: 29, storm: 0, wind: 11, flood: 0, occupancy: 74, newBookings: 10, cancellations: 1, outdoorGuests: 79, covers: 131, requests: 21, staffPlanned: 24, staffPresent: 24, travelDelays: 1, energyKwh: 930, waterLitres: 4960 },
  { rain: 18, temp: 28, storm: 1, wind: 22, flood: 0, occupancy: 71, newBookings: 7, cancellations: 2, outdoorGuests: 66, covers: 135, requests: 25, staffPlanned: 25, staffPresent: 23, travelDelays: 2, energyKwh: 970, waterLitres: 5010 },
  { rain: 42, temp: 26, storm: 3, wind: 35, flood: 2, occupancy: 68, newBookings: 6, cancellations: 3, outdoorGuests: 41, covers: 143, requests: 31, staffPlanned: 25, staffPresent: 22, travelDelays: 5, energyKwh: 1040, waterLitres: 5180 },
  { rain: 65, temp: 25, storm: 5, wind: 48, flood: 8, occupancy: 66, newBookings: 4, cancellations: 5, outdoorGuests: 26, covers: 149, requests: 39, staffPlanned: 26, staffPresent: 21, travelDelays: 9, energyKwh: 1190, waterLitres: 5460 },
  { rain: 12, temp: 31, storm: 0, wind: 14, flood: 0, occupancy: 70, newBookings: 9, cancellations: 2, outdoorGuests: 68, covers: 139, requests: 24, staffPlanned: 25, staffPresent: 24, travelDelays: 1, energyKwh: 1130, waterLitres: 5390 },
  { rain: 0, temp: 33, storm: 0, wind: 10, flood: 0, occupancy: 73, newBookings: 11, cancellations: 1, outdoorGuests: 91, covers: 145, requests: 28, staffPlanned: 26, staffPresent: 25, travelDelays: 0, energyKwh: 1280, waterLitres: 5710 },
  { rain: 28, temp: 30, storm: 2, wind: 28, flood: 1, occupancy: 69, newBookings: 6, cancellations: 3, outdoorGuests: 49, covers: 151, requests: 33, staffPlanned: 25, staffPresent: 22, travelDelays: 4, energyKwh: 1080, waterLitres: 5320 },
  { rain: 90, temp: 24, storm: 8, wind: 70, flood: 18, occupancy: 61, newBookings: 2, cancellations: 8, outdoorGuests: 9, covers: 158, requests: 52, staffPlanned: 27, staffPresent: 19, travelDelays: 15, energyKwh: 1330, waterLitres: 5890 },
  { rain: 8, temp: 28, storm: 0, wind: 9, flood: 0, occupancy: 70, newBookings: 10, cancellations: 2, outdoorGuests: 76, covers: 142, requests: 23, staffPlanned: 25, staffPresent: 24, travelDelays: 1, energyKwh: 990, waterLitres: 5140 },
];

const todayUtc = new Date();
const lastCompletedDay = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - 1));
const records = dailyExamples.map((example, index) => {
  const date = new Date(lastCompletedDay);
  date.setUTCDate(date.getUTCDate() - (dailyExamples.length - index - 1));
  const occupiedRooms = Math.round(70 * example.occupancy / 100);
  const outdoorShare = Math.round(example.outdoorGuests / Math.max(occupiedRooms * 2, 1) * 100);
  const availableInventory = Math.max(0, 100 - Math.round(example.rain / 5 + example.flood / 2));

  return {
    date: date.toISOString().slice(0, 10),
    recordType: 'synthetic_demo_only',
    weather: {
      source: 'synthetic scenario; not an observed weather record',
      rainfallMm24h: example.rain,
      meanTemperatureC: example.temp,
      stormDurationHours: example.storm,
      peakWindKph: example.wind,
      illustrativeFloodDepthCm: example.flood,
    },
    operations: {
      occupancyPercent: example.occupancy,
      totalRooms: 70,
      occupiedRooms,
      bookingsCreated: example.newBookings,
      bookingsCancelled: example.cancellations,
      inHouseGuestsEstimate: occupiedRooms * 2,
      outdoorGuestVisits: example.outdoorGuests,
      estimatedGuestActivityShiftIndoorsPercent: Math.max(0, 100 - outdoorShare),
      restaurantCovers: example.covers,
      publishedEventAttendance: Math.round(example.outdoorGuests * 0.32),
      guestRequests: example.requests,
      staffScheduled: example.staffPlanned,
      staffAttended: example.staffPresent,
      transportDelays: example.travelDelays,
      energyUseKwh: example.energyKwh,
      waterUseLitres: example.waterLitres,
      supplyAvailabilityIndex: availableInventory,
    },
  };
});

const dataset = {
  dataset: 'Staylix weather-resort aligned history',
  generatedAt: new Date().toISOString(),
  location: { name: 'Demo Resort Location', latitude: 15.2993, longitude: 74.124 },
  synthetic: true,
  intendedUse: 'UI demos, schema integration, and pipeline tests only. Never train or calibrate production predictions from these generated values.',
  outcomeDisclaimer: 'Every weather and operational value below is invented for demonstration; none represents measured Staylix or resort outcomes.',
  recordCount: records.length,
  records,
};

const outputPath = path.join(__dirname, '..', 'data', 'weather-resort-history-10d.synthetic.json');
fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`Generated ${records.length} synthetic daily records: ${outputPath}`);