const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const EmailOtp = require('../models/EmailOtp');
const { sendRegistrationOtp } = require('../services/emailService');

const router = express.Router();

const signToken = (id, extra = {}) =>
  jwt.sign({ id, ...extra }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

router.post(
  '/register/request-otp',
  [body('name').trim().notEmpty(), body('email').isEmail().normalizeEmail(), body('phone').trim().notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: 'Name, email and phone are required' });
      const { name, email, phone } = req.body;
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) return res.status(409).json({ message: 'This email is already registered' });
      const existingPhone = await User.findOne({ phone });
      if (existingPhone && existingPhone.role !== 'guest') return res.status(409).json({ message: 'This phone is already linked to a staff account' });

      const code = String(crypto.randomInt(100000, 1000000));
      await EmailOtp.deleteMany({ email: email.toLowerCase() });
      await EmailOtp.create({
        email: email.toLowerCase(),
        codeHash: await bcrypt.hash(code, 10),
        name,
        phone,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      sendRegistrationOtp({ email, name, code });
      res.json({ message: 'Verification code sent to your email' });
    } catch (err) { next(err); }
  },
);

router.post(
  '/register/verify-otp',
  [body('email').isEmail().normalizeEmail(), body('otp').isLength({ min: 6, max: 6 }).isNumeric()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: 'Enter a valid 6-digit OTP' });
      const { email, otp } = req.body;
      const record = await EmailOtp.findOne({ email: email.toLowerCase() });
      if (!record || record.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired. Request a new code.' });
      if (record.attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Request a new code.' });
      record.attempts += 1;
      await record.save();
      if (!(await bcrypt.compare(String(otp), record.codeHash))) return res.status(400).json({ message: 'Invalid OTP' });

      let user = await User.findOne({ phone: record.phone, role: 'guest' });
      if (!user) user = await User.create({ name: record.name, email: record.email, phone: record.phone, role: 'guest' });
      else {
        user.name = record.name;
        user.email = record.email;
        await user.save();
      }
      await EmailOtp.deleteOne({ _id: record._id });
      const token = signToken(user._id);
      res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
    } catch (err) { next(err); }
  },
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !user.password || !(await user.matchPassword(password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const token = signToken(user._id);
      res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
      next(err);
    }
  }
);

// Guest login: phone number only. Valid only while they have an active
// (checked-in) booking — this IS the "temporary login id" for the stay.
// If `room` is passed (guest scanned that room's QR key), the phone must
// match the guest actually checked into THAT specific room.
router.post(
  '/guest-login',
  [body('phone').notEmpty().withMessage('Phone number is required')],
  async (req, res, next) => {
    try {
      const { phone, room } = req.body;
      let guest = await User.findOne({ phone, role: 'guest' });
      if (!guest) {
        const fallbackName = `Guest ${String(phone).replace(/\D/g, '').slice(-4) || 'User'}`;
        guest = await User.create({
          name: fallbackName,
          phone,
          role: 'guest',
        });
      } else if (!guest.name) {
        guest.name = `Guest ${String(phone).replace(/\D/g, '').slice(-4) || 'User'}`;
        await guest.save();
      }

      const activeBooking = await Booking.findOne({ guest: guest._id, status: 'checked-in' });
      if (room && activeBooking && activeBooking.room.toString() !== room) {
        return res.status(401).json({ message: 'This phone number is not checked into this room' });
      }

      const token = signToken(guest._id, activeBooking ? { bookingId: activeBooking._id.toString() } : {});
      res.json({
        token,
        user: { id: guest._id, name: guest.name, phone: guest.phone, role: guest.role },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;