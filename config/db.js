const mongoose = require('mongoose');
const dns = require('node:dns');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const BookingSlot = require('../models/BookingSlot');
const PaymentTransaction = require('../models/PaymentTransaction');
const ProcessedWebhook = require('../models/ProcessedWebhook');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart-resort-360';
    if (uri.startsWith('mongodb+srv://')) {
      const srvRecord = `_mongodb._tcp.${new URL(uri).hostname}`;
      try {
        await dns.promises.resolveSrv(srvRecord);
      } catch (err) {
        if (err.code !== 'ECONNREFUSED' || err.syscall !== 'querySrv') throw err;

        const servers = ['1.1.1.1', '8.8.8.8'];
        dns.setServers(servers);
        await dns.promises.resolveSrv(srvRecord);
        console.warn(`System DNS refused the MongoDB SRV query; using ${servers.join(', ')}`);
      }
    }
    await mongoose.connect(uri);
    try {
      await Room.collection.dropIndex('number_1');
      console.log('Removed obsolete rooms.number_1 index');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound' && err.code !== 27) throw err;
    }
    await Room.createIndexes();
    await Promise.all([
      Booking.createIndexes(),
      BookingSlot.createIndexes(),
      PaymentTransaction.createIndexes(),
      ProcessedWebhook.createIndexes(),
    ]);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
