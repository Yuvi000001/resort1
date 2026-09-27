const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Staff = require('../models/Staff');
const InventoryItem = require('../models/InventoryItem');
const Event = require('../models/Event');
const { forecastOccupancy } = require('./occupancyRegressionService');

const DEFAULT_LOCATION = { name: 'Demo Resort Location', latitude: 15.2993, longitude: 74.124 };
let weatherCache = null;
let weatherCacheExpiresAt = 0;

async function readWeather(location) {
  if (weatherCache && weatherCacheExpiresAt > Date.now()) return weatherCache;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code',
    forecast_days: '3',
    timezone: 'auto',
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  const payload = await response.json();
  const hourlyTimes = payload.hourly?.time || [];
  const currentHourIndex = Math.max(hourlyTimes.indexOf(payload.current.time), 0);
  const hours = hourlyTimes.slice(currentHourIndex, currentHourIndex + 24).map((time, offset) => {
    const index = currentHourIndex + offset;
    return ({
    time,
    temperatureC: payload.hourly.temperature_2m?.[index] ?? payload.current.temperature_2m,
    rainfallMm: payload.hourly.precipitation?.[index] ?? 0,
    precipitationProbability: payload.hourly.precipitation_probability?.[index] ?? 0,
    windKph: payload.hourly.wind_speed_10m?.[index] ?? payload.current.wind_speed_10m,
    weatherCode: payload.hourly.weather_code?.[index] ?? payload.current.weather_code,
    });
  });

  const nextDay = hours;
  const weather = {
    source: 'Open-Meteo',
    fetchedAt: new Date().toISOString(),
    timezone: payload.timezone,
    current: {
      temperatureC: payload.current.temperature_2m,
      humidityPercent: payload.current.relative_humidity_2m,
      rainfallMm: payload.current.precipitation,
      windKph: payload.current.wind_speed_10m,
      windGustKph: payload.current.wind_gusts_10m,
      weatherCode: payload.current.weather_code,
    },
    forecast: {
      rainfallMm24h: Number(nextDay.reduce((sum, hour) => sum + hour.rainfallMm, 0).toFixed(1)),
      temperatureC: Number((nextDay.reduce((sum, hour) => sum + hour.temperatureC, 0) / Math.max(nextDay.length, 1)).toFixed(1)),
      stormDurationHours: nextDay.filter((hour) => hour.rainfallMm >= 1).length,
      windKph: Math.max(...nextDay.map((hour) => hour.windKph), payload.current.wind_speed_10m),
      peakRainProbability: Math.max(...nextDay.map((hour) => hour.precipitationProbability), 0),
      hours: nextDay,
    },
  };
  weatherCache = weather;
  weatherCacheExpiresAt = Date.now() + 10 * 60 * 1000;
  return weather;
}

async function readPublicSignals(location) {
  try {
    const query = `${location.name} weather travel`.slice(0, 80);
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts');
    url.search = new URLSearchParams({ q: query, limit: '8', sort: 'latest' });
    const response = await fetch(url, { signal: AbortSignal.timeout(5500) });
    if (!response.ok) return { source: 'Bluesky public search', status: 'unavailable', posts: [] };
    const payload = await response.json();
    const posts = (payload.posts || []).slice(0, 8).map((post) => ({
      text: post.record?.text || '',
      author: post.author?.handle || 'public account',
      createdAt: post.record?.createdAt || null,
      url: `https://bsky.app/profile/${post.author?.handle || ''}/post/${post.uri?.split('/').pop() || ''}`,
    }));
    return { source: 'Bluesky public search', status: 'available', posts };
  } catch {
    return { source: 'Bluesky public search', status: 'unavailable', posts: [] };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function simulateWeatherImpacts(scenario, context) {
  const weather = {
    rainfallMm24h: clamp(scenario.rainfallMm24h, 0, 500),
    temperatureC: clamp(scenario.temperatureC, -20, 55),
    stormDurationHours: clamp(scenario.stormDurationHours, 0, 24),
    windKph: clamp(scenario.windKph, 0, 250),
    floodDepthCm: clamp(scenario.floodDepthCm, 0, 300),
  };
  const rainRisk = Math.min(weather.rainfallMm24h / 150, 1);
  const stormRisk = weather.stormDurationHours / 24;
  const windRisk = Math.min(weather.windKph / 120, 1);
  const floodRisk = Math.min(weather.floodDepthCm / 100, 1);
  const heatRisk = Math.min(Math.max(weather.temperatureC - 32, 0) / 15, 1);
  const coldRisk = Math.min(Math.max(12 - weather.temperatureC, 0) / 20, 1);
  const riskIndex = Math.min(1, rainRisk * 0.27 + stormRisk * 0.13 + windRisk * 0.2 + floodRisk * 0.3 + heatRisk * 0.08 + coldRisk * 0.02);
  const riskProbabilityPct = Math.round((1 - Math.exp(-2.2 * riskIndex)) * 100);
  const occupancyDelta = Number((-Math.min(14, riskIndex * 11)).toFixed(1));
  const occupancy = clamp((context.baselineOccupancy ?? 50) + occupancyDelta, 0, 100);
  const guestMovementIndoorPct = Math.round(clamp(riskIndex * 82 + heatRisk * 12, 0, 95));
  const coversDeltaPct = Math.round(clamp(guestMovementIndoorPct * 0.28 + rainRisk * 14 - 7, -10, 35));
  const staffingDemandDelta = Math.ceil((context.inHouseGuests || 0) * riskIndex * 0.035 + guestMovementIndoorPct / 35);
  const commuteAvailabilityRiskPct = Math.round(clamp(windRisk * 25 + rainRisk * 20 + floodRisk * 45, 0, 85));
  const energyDeltaPct = Math.round(clamp(heatRisk * 34 + stormRisk * 15 + floodRisk * 12, 0, 60));
  const suppliesDeltaPct = Math.round(clamp(rainRisk * 18 + floodRisk * 28 + heatRisk * 12, 0, 55));
  const intervalWidth = Math.round(5 + riskIndex * 12);

  return {
    scenario: weather,
    riskIndex: Number(riskIndex.toFixed(2)),
    riskProbabilityPct,
    probabilityNote: 'Heuristic disruption likelihood, not calibrated against resort outcomes.',
    occupancy: {
      baselinePercent: Number((context.baselineOccupancy ?? 50).toFixed(1)),
      projectedPercent: Number(occupancy.toFixed(1)),
      weatherDeltaPoints: occupancyDelta,
      uncertaintyRangePercent: [Number(clamp(occupancy - intervalWidth, 0, 100).toFixed(1)), Number(clamp(occupancy + intervalWidth, 0, 100).toFixed(1))],
    },
    bookings: { expectedChangePercent: -Math.round(riskIndex * 18), uncertaintyRangePercent: [Math.round(-riskIndex * 35), Math.round(riskIndex * 8)] },
    guestMovement: { indoorShiftPercent: guestMovementIndoorPct, outdoorAccessRisk: riskIndex >= 0.48 ? 'high' : riskIndex >= 0.2 ? 'elevated' : 'low' },
    restaurant: { expectedCoversChangePercent: coversDeltaPct, indoorDiningShiftPercent: Math.round(guestMovementIndoorPct * 0.7) },
    staffing: { additionalStaffRecommended: staffingDemandDelta, commuteAvailabilityRiskPercent: commuteAvailabilityRiskPct, availableStaff: context.availableStaff },
    resources: { energyUseChangePercent: energyDeltaPct, supplyUseChangePercent: suppliesDeltaPct, inventoryAtRisk: context.inventoryAtRisk },
    impactChain: [
      `Weather disruption index ${Math.round(riskIndex * 100)}% changes outdoor access.`,
      `${guestMovementIndoorPct}% of guest activity may shift indoors, changing restaurant covers by ${coversDeltaPct}%.`,
      `Indoor demand and commute risk suggest ${staffingDemandDelta} additional staff and ${energyDeltaPct}% higher energy use.`,
      `Projected occupancy is adjusted from the resort baseline; booking response remains uncertain without weather-linked history.`,
    ],
  };
}

async function getDigitalTwinSnapshot() {
  const location = {
    name: process.env.RESORT_LOCATION_NAME || DEFAULT_LOCATION.name,
    latitude: Number(process.env.RESORT_LATITUDE) || DEFAULT_LOCATION.latitude,
    longitude: Number(process.env.RESORT_LONGITUDE) || DEFAULT_LOCATION.longitude,
    isDemo: !process.env.RESORT_LATITUDE || !process.env.RESORT_LONGITUDE,
  };
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [weather, rooms, confirmedBookings, availableStaff, totalStaff, inventory, events, occupancyForecast, social] = await Promise.all([
    readWeather(location),
    Room.find().select('status').lean(),
    Booking.countDocuments({ checkIn: { $gte: now, $lte: nextWeek }, status: { $in: ['confirmed', 'checked-in'] } }),
    Staff.countDocuments({ availability: true }),
    Staff.countDocuments(),
    InventoryItem.find().select('name currentStock minimumStock').lean(),
    Event.countDocuments({ status: 'published', date: { $gte: now, $lte: nextWeek } }),
    forecastOccupancy(),
    readPublicSignals(location),
  ]);
  const occupiedRooms = rooms.filter((room) => room.status === 'occupied').length;
  const occupiedRoomPercent = rooms.length ? (occupiedRooms / rooms.length) * 100 : null;
  const baselineOccupancy = occupancyForecast.predictedOccupancy ?? occupiedRoomPercent ?? 50;
  const context = {
    totalRooms: rooms.length,
    occupiedRooms,
    inHouseGuests: occupiedRooms * 2,
    confirmedBookingsNext7Days: confirmedBookings,
    availableStaff,
    totalStaff,
    inventoryAtRisk: inventory.filter((item) => item.currentStock <= item.minimumStock).map((item) => item.name),
    eventsNext7Days: events,
    baselineOccupancy,
    occupancySource: occupancyForecast.predictedOccupancy !== null ? 'historical occupancy regression' : 'current occupied rooms',
  };
  const defaultScenario = {
    rainfallMm24h: weather.forecast.rainfallMm24h,
    temperatureC: weather.forecast.temperatureC,
    stormDurationHours: weather.forecast.stormDurationHours,
    windKph: weather.forecast.windKph,
    floodDepthCm: 0,
  };

  return {
    location,
    weather,
    context,
    forecastModel: occupancyForecast.explanation,
    social,
    socialUseNote: 'Public posts are contextual signals only. They are not treated as verified weather reports or used to drive numeric forecasts.',
    defaultScenario,
    simulation: simulateWeatherImpacts(defaultScenario, context),
    mapSites: [
      { id: 'resort', name: location.name, type: 'Resort', latitude: location.latitude, longitude: location.longitude },
      { id: 'restaurant', name: 'Restaurant', type: 'Indoor demand', latitude: location.latitude + 0.002, longitude: location.longitude + 0.002 },
      { id: 'event-lawn', name: 'Outdoor event area', type: 'Weather exposure', latitude: location.latitude - 0.002, longitude: location.longitude + 0.003 },
      { id: 'arrival', name: 'Arrival and transport', type: 'Access risk', latitude: location.latitude + 0.003, longitude: location.longitude - 0.002 },
      { id: 'guest-zone', name: 'Guest activity zone', type: 'Movement shift', latitude: location.latitude - 0.003, longitude: location.longitude - 0.002 },
    ],
    safetyNote: 'Simulation only. It never changes live resort records. Follow official local weather alerts and emergency procedures.',
  };
}

module.exports = { getDigitalTwinSnapshot, simulateWeatherImpacts };