/**
 * Staff recommendation - rule-based, uses predicted occupancy + current workload.
 */
const Staff = require('../models/Staff');

const GUESTS_PER_STAFF = { Housekeeping: 8, Maintenance: 20, RoomService: 15, Restaurant: 25, Spa: 15, 'Front Desk': 30, Other: 20 };

async function recommendStaffing(predictedOccupancy, totalRooms) {
  const predictedGuests = Math.round((predictedOccupancy / 100) * totalRooms * 1.8);
  const staff = await Staff.find().populate('user', 'name');

  const byDept = {};
  staff.forEach((s) => {
    byDept[s.department] = byDept[s.department] || { available: 0, totalWorkload: 0, members: [] };
    if (s.availability) byDept[s.department].available += 1;
    byDept[s.department].totalWorkload += s.currentWorkload;
    byDept[s.department].members.push(s);
  });

  const recommendations = Object.entries(GUESTS_PER_STAFF).map(([department, ratio]) => {
    const required = Math.max(1, Math.ceil(predictedGuests / ratio));
    const available = byDept[department]?.available || 0;
    const shortfall = Math.max(0, required - available);
    return {
      department,
      requiredStaff: required,
      availableStaff: available,
      shortfall,
      recommendation: shortfall > 0
        ? `Add ${shortfall} more ${department} staff \u2014 predicted ${predictedGuests} guests need ~${required}, only ${available} available.`
        : `${department} staffing is sufficient for predicted demand.`,
    };
  }).filter((r) => r.shortfall > 0 || r.availableStaff > 0);

  return { predictedGuests, recommendations };
}

function pickLowestWorkloadStaff(staffList) {
  const available = staffList.filter((s) => s.availability);
  if (!available.length) return null;
  return available.reduce((min, s) => (s.currentWorkload < min.currentWorkload ? s : min), available[0]);
}

module.exports = { recommendStaffing, pickLowestWorkloadStaff };
