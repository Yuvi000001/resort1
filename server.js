require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { initSocket } = require('./sockets/socketHandler');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const roomRoutes = require('./routes/rooms');
const bookingRoutes = require('./routes/bookings');
const staffRoutes = require('./routes/staff');
const requestRoutes = require('./routes/requests');
const taskRoutes = require('./routes/tasks');
const inventoryRoutes = require('./routes/inventory');
const analyticsRoutes = require('./routes/analytics');
const intelligenceRoutes = require('./routes/intelligence');
const digitalTwinRoutes = require('./routes/digitalTwin');
const recommendationRoutes = require('./routes/recommendations');
const alertRoutes = require('./routes/alerts');
const feedbackRoutes = require('./routes/feedback');
const maintenanceRoutes = require('./routes/maintenance');
const offerRoutes = require('./routes/offers');
const eventRoutes = require('./routes/events');
const { sendDailyResortSummary, sendShiftReminders } = require('./services/emailService');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});
initSocket(io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use('/uploads', express.static('uploads'));
app.post('/api/bookings/payment/webhook', express.raw({ type: 'application/json' }), bookingRoutes.handleRazorpayWebhook);
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/digital-twin', digitalTwinRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/events', eventRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Smart Resort 360 API' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Smart Resort 360 API running on port ${PORT}`);
    const sendDailyEmails = () => {
      sendDailyResortSummary().catch((err) => console.error('Daily summary email failed:', err.message));
      sendShiftReminders().catch((err) => console.error('Shift reminder email failed:', err.message));
    };
    sendDailyEmails();
    setInterval(sendDailyEmails, 24 * 60 * 60 * 1000);
  });
});

module.exports = { app, server };