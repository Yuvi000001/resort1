/**
 * Seed script - creates demo data sized per spec: 50-100 rooms,
 * 30+ days occupancy history, 20-50 bookings, 10-20 staff,
 * inventory, guest requests, feedback, and 4 visually distinct
 * guest clusters for the K-Means demo.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Staff = require('../models/Staff');
const GuestRequest = require('../models/GuestRequest');
const Task = require('../models/Task');
const InventoryItem = require('../models/InventoryItem');
const Feedback = require('../models/Feedback');
const OccupancyRecord = require('../models/OccupancyRecord');
const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');
const GuestSegment = require('../models/GuestSegment');

const ROOM_TYPES = ['Standard', 'Deluxe', 'Suite', 'Villa'];
const BASE_PRICES = { Standard: 90, Deluxe: 150, Suite: 260, Villa: 420 };
const DEPARTMENTS = ['Housekeeping', 'Maintenance', 'RoomService', 'Restaurant', 'Spa', 'Front Desk'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function daysAgo(n) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

async function seed() {
  await connectDB();
  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}), Room.deleteMany({}), Booking.deleteMany({}), Staff.deleteMany({}),
    GuestRequest.deleteMany({}), Task.deleteMany({}), InventoryItem.deleteMany({}),
    Feedback.deleteMany({}), OccupancyRecord.deleteMany({}), Alert.deleteMany({}),
    Recommendation.deleteMany({}), GuestSegment.deleteMany({}),
  ]);

  console.log('Creating users...');
  const manager = await User.create({ name: 'Amara Okafor', email: 'manager@smartresort360.com', password: 'password123', role: 'manager', phone: '+1-555-0100' });

  const staffUsers = [];
  const staffFirstNames = ['Liam', 'Noah', 'Ava', 'Mia', 'Leo', 'Zoe', 'Kai', 'Nora', 'Theo', 'Ivy', 'Omar', 'Priya', 'Sana', 'Diego', 'Elin', 'Ravi'];
  for (let i = 0; i < 16; i++) {
    staffUsers.push(await User.create({
      name: `${staffFirstNames[i]} ${['Reyes', 'Kim', 'Silva', 'Novak', 'Haddad'][i % 5]}`,
      email: `staff${i + 1}@smartresort360.com`,
      password: 'password123',
      role: 'staff',
      phone: `+1-555-01${String(i + 10).padStart(2, '0')}`,
    }));
  }

  // 40 guests, deliberately shaped into 4 patterns so K-Means finds 4 clean clusters:
  // 0-9  Budget Traveler: low spend, short stay, few requests, mixed sentiment
  // 10-19 Frequent High-Spender: high spend, short/medium stay, many requests, positive
  // 20-29 Family Guest: medium spend, medium stay, medium requests, mostly positive
  // 30-39 Long-Stay Guest: medium-low spend, long stay, few requests, neutral/positive
  const guestNames = [
    'Elena Vasquez','Marcus Chen','Fatima Ali','Jonas Berg','Sofia Rossi','Amir Hassan','Chloe Martin','Yuki Tanaka','Nadia Petrov','Carlos Diaz',
    'Isabella Cruz','William Park','Grace Nwosu','Hiroshi Sato','Camila Ortiz','Ethan Brooks','Layla Saleh','Anders Lund','Priyanka Rao','Julian West',
    'Maya Goldberg','Tomasz Nowak','Aisha Mohammed','Lucas Ferreira','Emma Wilson','Ravi Shankar','Naomi Cohen','Diego Fernandez','Sarah Johnson','Kenji Yamamoto',
    'Ingrid Larsen','Ben Okonkwo','Valentina Russo','Omar Farouk','Hannah Kim','Milo Andersson','Zara Iqbal','Felix Weber','Ana Beatriz','Tariq Malik',
  ];
  const guests = [];
  for (let i = 0; i < guestNames.length; i++) {
    guests.push(await User.create({
      name: guestNames[i],
      email: `guest${i + 1}@example.com`,
      password: 'password123',
      role: 'guest',
      phone: `+1-555-02${String(i + 10).padStart(2, '0')}`,
    }));
  }

  console.log('Creating staff records...');
  const staffDocs = [];
  for (let i = 0; i < staffUsers.length; i++) {
    staffDocs.push(await Staff.create({
      user: staffUsers[i]._id,
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      availability: Math.random() > 0.15,
      currentWorkload: rand(0, 4),
      shift: pick(['morning', 'afternoon', 'night']),
    }));
  }

  console.log('Creating rooms...');
  const rooms = [];
  const roomCount = 70;
  for (let i = 1; i <= roomCount; i++) {
    const type = i <= 35 ? 'Standard' : i <= 55 ? 'Deluxe' : i <= 65 ? 'Suite' : 'Villa';
    rooms.push(await Room.create({
      roomNumber: `${Math.ceil(i / 10)}0${i % 10 || 10}`,
      type,
      basePrice: BASE_PRICES[type] + rand(-10, 10),
      capacity: type === 'Villa' ? 6 : type === 'Suite' ? 4 : 2,
      status: pick(['available', 'available', 'available', 'occupied', 'cleaning']),
    }));
  }

  console.log('Creating 30 days of occupancy history (upward trend for a clean regression demo)...');
  const occupancyRecords = [];
  for (let i = 34; i >= 0; i--) {
    const base = 55 + (34 - i) * 0.9; // upward trend
    const noise = rand(-6, 6);
    const pct = Math.max(20, Math.min(97, Math.round(base + noise)));
    const occupied = Math.round((pct / 100) * roomCount);
    const revenue = Math.round(occupied * (140 + rand(-20, 40)));
    occupancyRecords.push(await OccupancyRecord.create({
      date: daysAgo(i),
      totalRooms: roomCount,
      occupiedRooms: occupied,
      occupancyPercentage: pct,
      revenue,
    }));
  }

  console.log('Creating bookings...');
  const bookingCount = 40;
  const bookings = [];

  function segmentProfile(guestIndex) {
    if (guestIndex < 10) return { spendRange: [80, 260], stayRange: [1, 2], bookingsRange: [1, 2] }; // Budget
    if (guestIndex < 20) return { spendRange: [900, 2200], stayRange: [2, 3], bookingsRange: [2, 4] }; // High spender
    if (guestIndex < 30) return { spendRange: [400, 900], stayRange: [4, 6], bookingsRange: [1, 2] }; // Family
    return { spendRange: [250, 600], stayRange: [8, 14], bookingsRange: [1, 2] }; // Long-stay
  }

  let bookingsMade = 0;
  for (let g = 0; g < guests.length && bookingsMade < bookingCount; g++) {
    const profile = segmentProfile(g);
    const numBookings = rand(...profile.bookingsRange);
    for (let b = 0; b < numBookings && bookingsMade < bookingCount; b++) {
      const room = pick(rooms);
      const stay = rand(...profile.stayRange);
      const checkInOffset = rand(1, 33);
      const checkIn = daysAgo(checkInOffset);
      const checkOut = new Date(checkIn); checkOut.setDate(checkOut.getDate() + stay);
      const totalPrice = Math.round(rand(...profile.spendRange));
      bookings.push(await Booking.create({
        guest: guests[g]._id, room: room._id, checkIn, checkOut,
        guestCount: rand(1, room.capacity), totalPrice,
        status: pick(['confirmed', 'checked-in', 'checked-out']),
      }));
      bookingsMade++;
    }
  }

  console.log('Creating inventory...');
  const inventoryItems = [
    { name: 'Bath Towels', category: 'linen', currentStock: 180, unit: 'pcs', minimumStock: 150, usagePerGuest: 1.5 },
    { name: 'Bed Sheets', category: 'linen', currentStock: 90, unit: 'sets', minimumStock: 100, usagePerGuest: 0.3 },
    { name: 'Shampoo Bottles', category: 'toiletries', currentStock: 320, unit: 'pcs', minimumStock: 200, usagePerGuest: 1 },
    { name: 'Soap Bars', category: 'toiletries', currentStock: 150, unit: 'pcs', minimumStock: 200, usagePerGuest: 1 },
    { name: 'Bottled Water', category: 'beverage', currentStock: 400, unit: 'bottles', minimumStock: 300, usagePerGuest: 2 },
    { name: 'Breakfast Supplies', category: 'food', currentStock: 60, unit: 'kg', minimumStock: 80, usagePerGuest: 0.4 },
    { name: 'Coffee Pods', category: 'beverage', currentStock: 500, unit: 'pcs', minimumStock: 250, usagePerGuest: 1.2 },
  ];
  for (const item of inventoryItems) await InventoryItem.create(item);

  console.log('Creating guest requests + auto-assigned tasks...');
  const requestSamples = [
    { message: 'I need two extra towels please', category: 'Housekeeping', priority: 'normal' },
    { message: 'My AC is not cooling at all', category: 'Maintenance', priority: 'urgent' },
    { message: 'Can I get room service breakfast delivered', category: 'RoomService', priority: 'normal' },
    { message: 'The bathroom sink is leaking', category: 'Maintenance', priority: 'high' },
    { message: 'Please make a dinner reservation at the restaurant', category: 'Restaurant', priority: 'low' },
    { message: 'Would like to book a spa massage this afternoon', category: 'Spa', priority: 'low' },
    { message: 'Need fresh sheets and vacuuming today', category: 'Housekeeping', priority: 'normal' },
    { message: 'Wifi is down in our villa, urgent fix needed', category: 'Maintenance', priority: 'urgent' },
  ];
  for (let i = 0; i < 24; i++) {
    const sample = pick(requestSamples);
    const guest = pick(guests);
    const room = pick(rooms);
    const request = await GuestRequest.create({
      guest: guest._id, room: room._id, message: sample.message,
      category: sample.category, priority: sample.priority,
      status: pick(['open', 'assigned', 'in-progress', 'resolved']),
    });
    const dept = sample.category === 'Other' ? 'Front Desk' : sample.category;
    const candidate = staffDocs.find((s) => s.department === dept) || pick(staffDocs);
    await Task.create({
      request: request._id, assignedStaff: candidate._id, department: dept,
      title: `${dept}: ${sample.message.slice(0, 60)}`,
      priority: sample.priority,
      status: pick(['pending', 'in-progress', 'completed']),
    });
  }

  console.log('Creating feedback...');
  const feedbackSamples = [
    { rating: 5, comment: 'Amazing stay, the staff were friendly and the room was perfect and clean', sentiment: 'positive', issues: [] },
    { rating: 5, comment: 'Excellent service, loved the spa, will come back', sentiment: 'positive', issues: [] },
    { rating: 4, comment: 'Great pool area, enjoyed the breakfast', sentiment: 'positive', issues: [] },
    { rating: 2, comment: 'Room was dirty and the AC was broken, disappointed', sentiment: 'negative', issues: ['dirty', 'broken'] },
    { rating: 1, comment: 'Terrible, rude staff at front desk and noisy hallway', sentiment: 'negative', issues: ['rude', 'noisy'] },
    { rating: 3, comment: 'It was fine, nothing special, average experience', sentiment: 'neutral', issues: [] },
    { rating: 4, comment: 'Good value, clean room, friendly housekeeping', sentiment: 'positive', issues: [] },
    { rating: 2, comment: 'Slow room service and poor wifi', sentiment: 'negative', issues: ['slow', 'poor'] },
  ];
  for (let i = 0; i < 22; i++) {
    const sample = pick(feedbackSamples);
    await Feedback.create({ guest: pick(guests)._id, rating: sample.rating, comment: sample.comment, sentiment: sample.sentiment, issues: sample.issues });
  }

  console.log('Creating starter alerts...');
  await Alert.create({ type: 'inventory', severity: 'warning', title: 'Soap bars below minimum stock', message: 'Soap Bars stock (150) is below the 200 minimum threshold.' });
  await Alert.create({ type: 'maintenance', severity: 'critical', title: 'Repeated AC complaints', message: 'Multiple AC/cooling maintenance requests logged this week across Villa rooms.' });

  console.log('Seed complete:', {
    users: 1 + staffUsers.length + guests.length,
    rooms: rooms.length,
    occupancyRecords: occupancyRecords.length,
    bookings: bookings.length,
    staff: staffDocs.length,
    inventory: inventoryItems.length,
  });
  console.log('Manager login -> email: manager@smartresort360.com / password: password123');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
