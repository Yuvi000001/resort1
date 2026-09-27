const Room = require('../models/Room');
const Staff = require('../models/Staff');
const MaintenanceTask = require('../models/MaintenanceTask');
const { sendMaintenanceAssignment } = require('./emailService');

function calculateNeed(room, lastCompletedAt) {
  const daysSinceMaintenance = lastCompletedAt
    ? Math.floor((Date.now() - new Date(lastCompletedAt).getTime()) / 86400000)
    : 7;
  const statusScore = { maintenance: 55, cleaning: 30, occupied: 20, available: 10 }[room.status] || 10;
  const ageScore = Math.min(45, Math.max(0, daysSinceMaintenance * 7));
  const score = Math.min(100, statusScore + ageScore);
  const priority = score >= 85 ? 'urgent' : score >= 65 ? 'high' : score >= 40 ? 'normal' : 'low';
  const reason = room.status === 'maintenance'
    ? 'Room is marked for maintenance.'
    : daysSinceMaintenance >= 7
      ? `Preventive maintenance is due after ${daysSinceMaintenance} days.`
      : 'Routine room health check.';
  return { score, priority, reason };
}

async function assignStaff() {
  let staff = await Staff.find({ department: 'Maintenance', availability: true }).populate('user', 'name email').sort({ currentWorkload: 1 });
  if (!staff.length) staff = await Staff.find({ availability: true }).populate('user', 'name email').sort({ currentWorkload: 1 });
  return staff[0] || null;
}

async function ensureMaintenanceTasks() {
  const rooms = await Room.find();
  const tasks = [];
  for (const room of rooms) {
    const latest = await MaintenanceTask.findOne({ room: room._id }).sort({ completedAt: -1, createdAt: -1 });
    const active = await MaintenanceTask.findOne({ room: room._id, status: { $ne: 'completed' } });
    const dueAt = latest?.completedAt ? new Date(new Date(latest.completedAt).getTime() + 7 * 86400000) : new Date();
    if (active) {
      if (!active.assignedStaff) {
        const staff = await assignStaff();
        if (staff) {
          active.assignedStaff = staff._id;
          await active.save();
          staff.currentWorkload += 1;
          await staff.save();
          sendMaintenanceAssignment({ ...active.toObject(), assignedStaff: staff });
        }
      }
      continue;
    }
    if (dueAt > new Date()) continue;

    const need = calculateNeed(room, latest?.completedAt);
    const staff = await assignStaff();
    const task = await MaintenanceTask.create({
      room: room._id,
      assignedStaff: staff?._id,
      title: `Room ${room.roomNumber} maintenance`,
      reason: need.reason,
      needScore: need.score,
      priority: need.priority,
      dueAt: new Date(),
    });
    if (staff) {
      staff.currentWorkload += 1;
      await staff.save();
    }
    if (staff) sendMaintenanceAssignment({ ...task.toObject(), room, assignedStaff: staff });
    tasks.push(task);
  }
  return tasks;
}

module.exports = { ensureMaintenanceTasks };
