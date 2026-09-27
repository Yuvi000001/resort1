const crypto = require('node:crypto');
const Razorpay = require('razorpay');

let client;

function getRazorpay() {
  if (client) return client;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    error.statusCode = 503;
    throw error;
  }
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

function getCurrency() {
  return (process.env.RAZORPAY_CURRENCY || 'USD').toUpperCase();
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest();
}

function safeEqualHex(expected, actual) {
  if (!/^[a-f0-9]+$/i.test(actual || '') || expected.length !== Buffer.from(actual, 'hex').length) return false;
  return crypto.timingSafeEqual(expected, Buffer.from(actual, 'hex'));
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqualHex(sign(`${orderId}|${paymentId}`, secret), signature);
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  return safeEqualHex(sign(rawBody, secret), signature);
}

async function createOrder({ amount, currency, receipt, notes }) {
  try {
    return await getRazorpay().orders.create({
      amount,
      currency,
      receipt: String(receipt).slice(0, 40),
      notes,
    });
  } catch (cause) {
    const description = cause.error?.description || cause.error?.reason || cause.message || 'Razorpay did not create the payment order';
    console.error('Razorpay order API error:', cause.statusCode || 'unknown status', cause.error?.code || 'unknown code', description);
    const error = new Error(description);
    error.statusCode = cause.statusCode === 400 ? 502 : (cause.statusCode || 502);
    error.code = cause.error?.code || cause.code;
    error.publicMessage = description;
    throw error;
  }
}

async function fetchAndCapturePayment(paymentId, expected) {
  const razorpay = getRazorpay();
  let payment = await razorpay.payments.fetch(paymentId);
  if (payment.order_id !== expected.orderId || Number(payment.amount) !== Number(expected.amount) || payment.currency !== expected.currency) {
    throw new Error('Payment details do not match the booking order');
  }
  if (payment.status === 'authorized') {
    try {
      payment = await razorpay.payments.capture(paymentId, Number(expected.amount), expected.currency);
    } catch (error) {
      payment = await razorpay.payments.fetch(paymentId);
      if (payment.status !== 'captured') throw error;
    }
  }
  if (payment.status !== 'captured') throw new Error(`Payment is not captured (status: ${payment.status})`);
  return payment;
}

module.exports = { getRazorpay, getCurrency, verifyCheckoutSignature, verifyWebhookSignature, createOrder, fetchAndCapturePayment };
