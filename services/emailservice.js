const nodemailer = require('nodemailer');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Task = require('../models/Task');
const MaintenanceTask = require('../models/MaintenanceTask');
const Staff = require('../models/Staff');

const LOGO_URL = 'https://res.cloudinary.com/g3ibo1zm/image/upload/v1790452983/WhatsApp_Image_2026-09-26_at_4.18.12_PM__1_-removebg-preview.png';
const BRAND = '#1f5b50';
const IVORY = '#f7f4ed';

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE) === 'true' || port === 465,
    auth: { user, pass },
  });
  return transporter;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function layout({ eyebrow, title, intro, body, cta }) {
  return `<!doctype html><html><body style="margin:0;background:${IVORY};font-family:Arial,sans-serif;color:#18312d">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${IVORY};padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e7dfd0;border-radius:20px;overflow:hidden">
      <tr><td style="padding:24px 30px;border-bottom:1px solid #eee7dc"><img src="${LOGO_URL}" alt="Staylix" style="width:132px;height:auto;display:block" /></td></tr>
      <tr><td style="padding:32px 30px"><div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND}">${escapeHtml(eyebrow)}</div>
      <h1 style="margin:9px 0 10px;font-size:28px;line-height:1.2;color:#18312d">${escapeHtml(title)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#60716d">${escapeHtml(intro)}</p>${body}${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:24px;background:${BRAND};color:#fff;text-decoration:none;border-radius:10px;padding:13px 20px;font-size:14px;font-weight:700">${escapeHtml(cta.label)}</a>` : ''}</td></tr>
      <tr><td style="padding:18px 30px;background:#f3eee5;color:#71817c;font-size:12px;line-height:1.6">Staylix Resort Workspace<br />Smarter stays. Happier guests.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function details(items) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7dfd0;border-radius:14px;overflow:hidden">${items.map(([label, value]) => `<tr><td style="padding:12px 14px;background:#faf8f3;color:#71817c;font-size:12px;width:38%">${escapeHtml(label)}</td><td style="padding:12px 14px;color:#18312d;font-size:13px;font-weight:700">${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

async function sendEmail({ to, subject, html }) {
  if (!to) return false;
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`Email skipped for ${to}: SMTP is not configured`);
    return false;
  }
  await mailer.sendMail({ from: process.env.EMAIL_FROM || `Staylix Resort <${process.env.SMTP_USER || process.env.EMAIL_USER}>`, to, subject, html });
  return true;
}

function queueEmail(options) {
  sendEmail(options).catch((error) => console.error('Email delivery failed:', error.message));
}

function sendBookingConfirmation(booking) {
  const guest = booking.guest;
  const room = booking.room;
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: `Staylix booking confirmed - Room ${room?.roomNumber || ''}`,
    html: layout({
      eyebrow: 'Booking confirmed',
      title: `Welcome to Staylix, ${guest.name}`,
      intro: 'Your resort stay is confirmed. Keep these details handy for your arrival.',
      body: details([
        ['Guest', guest.name],
        ['Room', room?.roomNumber || 'Assigned room'],
        ['Check-in', new Date(booking.checkIn).toLocaleDateString()],
        ['Check-out', new Date(booking.checkOut).toLocaleDateString()],
      ]),
    }),
  });
}

function sendRegistrationOtp({ email, name, code }) {
  queueEmail({
    to: email,
    subject: 'Your Staylix verification code',
    html: layout({
      eyebrow: 'Email verification',
      title: `Verify your Staylix account, ${name}`,
      intro: 'Use this one-time code to complete guest registration. It expires in 10 minutes.',
      body: `<div style="margin:8px 0 4px;padding:18px;text-align:center;border:1px solid #dce9e2;border-radius:14px;background:#f3faf5;color:${BRAND};font-size:32px;font-weight:800;letter-spacing:8px">${escapeHtml(code)}</div><p style="font-size:12px;color:#71817c">If you did not request this code, you can ignore this email.</p>`,
    }),
  });
}

function sendRoomAccessEmail(booking) {
  const guest = booking.guest;
  const room = booking.room;
  if (!guest?.email || !room?._id) return;
  const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/room?room=${room._id}`;
  queueEmail({
    to: guest.email,
    subject: `Your Staylix room access - Room ${room.roomNumber}`,
    html: layout({
      eyebrow: 'Room access',
      title: `Room ${room.roomNumber} is ready`,
      intro: 'Use the room access QR from your Staylix dashboard or open the secure room access link below.',
      body: details([
        ['Guest', guest.name],
        ['Room', room.roomNumber],
        ['Room type', room.type],
        ['Access link', url],
      ]),
      cta: { label: 'Open room access', url },
    }),
  });
}

function sendCheckoutConfirmation(booking) {
  const guest = booking.guest;
  const room = booking.room;
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: `Staylix check-out confirmed - Room ${room?.roomNumber || ''}`,
    html: layout({
      eyebrow: 'Check-out complete',
      title: `Thank you, ${guest.name}`,
      intro: 'Your check-out has been completed. We hope to welcome you back soon.',
      body: details([
        ['Room', room?.roomNumber || 'Room'],
        ['Check-out', new Date().toLocaleDateString()],
        ['Stay total', booking.totalPrice || '—'],
      ]),
      cta: { label: 'Leave feedback', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/feedback` },
    }),
  });
}

function sendGuestAssignment({ request, task }) {
  const guest = request.guest;
  if (!guest?.email || !task?.assignedStaff?.user?.name) return;
  queueEmail({
    to: guest.email,
    subject: `${task.assignedStaff.user.name} is handling your request`,
    html: layout({
      eyebrow: 'Request update',
      title: 'Your request has been assigned',
      intro: 'A member of the Staylix team is now handling your request.',
      body: details([
        ['Issue', request.message],
        ['Assigned staff', task.assignedStaff.user.name],
        ['Department', task.department],
        ['Priority', request.priority],
      ]),
      cta: { label: 'Open Help Desk', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard` },
    }),
  });
}

function sendFeedbackRequest({ guest, task }) {
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: 'How was your Staylix service?',
    html: layout({
      eyebrow: 'Your feedback matters',
      title: 'Rate your completed service',
      intro: 'Your feedback helps us improve the resort experience and recognize great service.',
      body: details([
        ['Task', task?.title || 'Completed service'],
        ['Staff', task?.assignedStaff?.user?.name || 'Staylix team'],
      ]),
      cta: { label: 'Leave feedback', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/feedback` },
    }),
  });
}

function sendInvoiceReceipt(booking) {
  const guest = booking.guest;
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: `Staylix payment receipt - ${booking.totalPrice || 'Stay'}`,
    html: layout({
      eyebrow: 'Payment receipt',
      title: 'Your Staylix receipt',
      intro: 'Here is your booking payment summary for your records.',
      body: details([
        ['Guest', guest.name],
        ['Room', booking.room?.roomNumber || 'Room'],
        ['Booking status', booking.status],
        ['Total', booking.totalPrice || '—'],
      ]),
    }),
  });
}

function sendStaffMessage({ staff, request, message }) {
  const email = staff?.user?.email;
  if (!email) return;
  queueEmail({
    to: email,
    subject: `New guest message - Room ${request.room?.roomNumber || ''}`,
    html: layout({
      eyebrow: 'Guest message',
      title: 'A guest replied to your task',
      intro: 'Open the staff workspace to continue the assigned guest conversation.',
      body: details([
        ['Guest', request.guest?.name || 'Guest'],
        ['Room', request.room?.roomNumber || 'Room'],
        ['Message', message],
      ]),
      cta: { label: 'Open staff workspace', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard` },
    }),
  });
}

async function sendDailyResortSummary() {
  const [bookings, openTasks, maintenance, staff] = await Promise.all([
    Booking.countDocuments({ status: 'checked-in' }),
    Task.countDocuments({ status: { $ne: 'completed' } }),
    MaintenanceTask.countDocuments({ status: { $ne: 'completed' } }),
    Staff.countDocuments({ availability: true }),
  ]);
  await notifyManagers({
    subject: 'Staylix daily resort summary',
    title: 'Daily resort summary',
    intro: 'Here is the current operational snapshot for Staylix.',
    body: details([
      ['Checked-in guests', bookings],
      ['Open guest tasks', openTasks],
      ['Open maintenance tasks', maintenance],
      ['Available staff', staff],
    ]),
  });
}

function sendRequestAssignment({ request, task }) {
  const staffEmail = task?.assignedStaff?.user?.email;
  if (!staffEmail) return;
  queueEmail({
    to: staffEmail,
    subject: `New ${request.category} task assigned - ${request.message}`,
    html: layout({
      eyebrow: 'New task assigned',
      title: request.category,
      intro: 'A guest request has been assigned to you. Please review and update the task after completion.',
      body: details([
        ['Guest', request.guest?.name || 'Guest'],
        ['Room', request.room?.roomNumber || 'Guest room'],
        ['Issue', request.message],
        ['Priority', request.priority],
      ]),
      cta: { label: 'Open staff workspace', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/tasks` },
    }),
  });
}

function sendGuestMessage({ guest, sender, message }) {
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: `${sender} replied to your Staylix Help Desk chat`,
    html: layout({
      eyebrow: 'Help Desk message',
      title: `${sender} sent you a message`,
      intro: 'Open your Staylix dashboard to continue the conversation.',
      body: `<div style="padding:16px;border-left:4px solid ${BRAND};background:#faf8f3;font-size:15px;line-height:1.7">${escapeHtml(message)}</div>`,
      cta: { label: 'Open Help Desk chat', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard` },
    }),
  });
}

async function notifyManagers({ subject, title, intro, body }) {
  const managers = await User.find({ role: 'manager', email: { $exists: true, $ne: '' } }).select('email');
  managers.forEach((manager) => queueEmail({ to: manager.email, subject, html: layout({ eyebrow: 'Resort workspace', title, intro, body }) }));
}

function sendMaintenanceAssignment(task) {
  const email = task.assignedStaff?.user?.email;
  if (!email) return;
  queueEmail({
    to: email,
    subject: `Maintenance assigned - Room ${task.room?.roomNumber || ''}`,
    html: layout({
      eyebrow: 'Maintenance assignment',
      title: task.title,
      intro: 'This room is due for maintenance. Upload an after-maintenance photo to complete the task.',
      body: details([
        ['Room', task.room?.roomNumber || 'Room'],
        ['Reason', task.reason],
        ['Need score', `${task.needScore}/100`],
        ['Priority', task.priority],
      ]),
      cta: { label: 'Open maintenance workspace', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/maintenance` },
    }),
  });
}

function sendMaintenanceCompletion({ guest, task }) {
  if (!guest?.email) return;
  queueEmail({
    to: guest.email,
    subject: `Maintenance completed - Room ${task.room?.roomNumber || ''}`,
    html: layout({
      eyebrow: 'Maintenance update',
      title: 'Your room issue was resolved',
      intro: 'The maintenance team completed the work and uploaded a completion photo.',
      body: details([
        ['Room', task.room?.roomNumber || 'Room'],
        ['Task', task.title],
        ['Status', 'Completed'],
      ]),
      cta: { label: 'Open your dashboard', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard` },
    }),
  });
}

async function sendEventAnnouncement(event) {
  const guests = await User.find({ role: 'guest', email: { $exists: true, $ne: '' } }).select('email name');
  const eventDate = new Date(event.date).toLocaleDateString();
  const eventBody = details([
    ['Date', eventDate],
    ['Time', event.time],
    ['Location', event.location],
    ['Registration', event.registrationDetails],
  ]);
  guests.forEach((guest) => queueEmail({
    to: guest.email,
    subject: `Upcoming at Staylix: ${event.name}`,
    html: layout({
      eyebrow: 'Upcoming resort event',
      title: event.name,
      intro: `Hello ${guest.name || 'Guest'}, a new resort event has been published. See the details and register your interest in the app.`,
      body: `${event.image ? `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" style="display:block;width:100%;max-height:260px;object-fit:cover;border-radius:14px;margin-bottom:20px" />` : ''}${eventBody}<p style="font-size:14px;line-height:1.7;color:#60716d">${escapeHtml(event.description)}</p>`,
      cta: { label: 'View event and register', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/events` },
    }),
  }));
}

async function sendShiftReminders() {
  const staff = await Staff.find({ availability: true }).populate('user', 'name email');
  staff.forEach((member) => {
    if (!member.user?.email) return;
    queueEmail({
      to: member.user.email,
      subject: `Staylix ${member.shift} shift reminder`,
      html: layout({
        eyebrow: 'Shift reminder',
        title: `Your ${member.shift} shift is scheduled`,
        intro: 'Please review your assigned tasks before starting your shift.',
        body: details([['Staff member', member.user.name], ['Department', member.department], ['Shift', member.shift]]),
        cta: { label: 'Open staff workspace', url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard` },
      }),
    });
  });
}

module.exports = {
  sendBookingConfirmation,
  sendRegistrationOtp,
  sendRoomAccessEmail,
  sendCheckoutConfirmation,
  sendGuestAssignment,
  sendFeedbackRequest,
  sendInvoiceReceipt,
  sendRequestAssignment,
  sendGuestMessage,
  sendStaffMessage,
  notifyManagers,
  sendMaintenanceAssignment,
  sendMaintenanceCompletion,
  sendEventAnnouncement,
  sendDailyResortSummary,
  sendShiftReminders,
};
