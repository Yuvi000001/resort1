const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestRequest' },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    department: { type: String, required: true },
    title: { type: String, required: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
