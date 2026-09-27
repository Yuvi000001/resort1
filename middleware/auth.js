const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');

exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'User no longer exists' });

    // Guest identities are permanent by phone. A checkout should not invalidate
    // the guest account itself; it only means there is no active stay right now.
    // The guest can still sign back in with the same phone later for a new stay.
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Role '${req.user.role}' is not permitted to access this resource` });
  }
  next();
};