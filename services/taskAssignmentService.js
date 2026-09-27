/**
 * Automatic staff assignment - rule-based workload balancing.
 */
const Staff = require('../models/Staff');
const Task = require('../models/Task');
const Alert = require('../models/Alert');
const { sendRequestAssignment, notifyManagers } = require('./emailService');

async function assignTaskForRequest(request) {
  const department = request.category === 'Other' ? 'Front Desk' : request.category;

  let candidates = await Staff.find({ department, availability: true }).populate('user', 'name email').sort({ currentWorkload: 1 });
  if (!candidates.length) {
    candidates = await Staff.find({ availability: true }).populate('user', 'name email').sort({ currentWorkload: 1 });
  }

  if (!candidates.length) {
    await Alert.create({
      type: 'staffing',
      severity: 'warning',
      title: 'No available staff',
      message: `No available ${department} staff to handle request: "${request.message}"`,
      metadata: { requestId: request._id },
    });
    notifyManagers({ subject: `Low staff availability - ${department}`, title: 'Low staff availability', intro: 'A guest request could not be assigned to an available staff member.', body: `<p style="font-size:15px;line-height:1.7;color:#60716d">Department: <strong>${department}</strong><br />Request: ${request.message}</p>` });
    return null;
  }

  const chosen = candidates[0];
  const task = await Task.create({
    request: request._id,
    assignedStaff: chosen._id,
    department,
    title: `${department}: ${request.message.slice(0, 60)}`,
    priority: request.priority,
    status: 'pending',
  });

  chosen.currentWorkload += 1;
  await chosen.save();
  sendRequestAssignment({ request, task: { ...task.toObject(), assignedStaff: chosen } });

  return task;
}

module.exports = { assignTaskForRequest };
