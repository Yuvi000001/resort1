const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: {
      type: String,
      enum: ['Housekeeping', 'Maintenance', 'RoomService', 'Restaurant', 'Spa', 'Front Desk', 'Other'],
      required: true,
    },
    availability: { type: Boolean, default: true },
    currentWorkload: { type: Number, default: 0 },
    shift: { type: String, enum: ['morning', 'afternoon', 'night'], default: 'morning' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staff', staffSchema);
