const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // guest may have no email
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
      required: function () { return this.role !== 'guest'; }, // guest = phone-only login, no password
    },
    role: { type: String, enum: ['manager', 'staff', 'guest'], default: 'guest' },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // required+unique for guest, enforced in route
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);