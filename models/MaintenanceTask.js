const mongoose = require('mongoose');

const maintenanceTaskSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    title: { type: String, required: true },
    reason: { type: String, required: true },
    needScore: { type: Number, min: 0, max: 100, required: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
    dueAt: { type: Date, required: true },
    afterPhoto: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

maintenanceTaskSchema.index({ room: 1, status: 1 });

module.exports = mongoose.model('MaintenanceTask', maintenanceTaskSchema);
