# Razorpay Booking Payments

## Environment

Add these to `backend/.env` using Razorpay **Test Mode** values:

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_CURRENCY=USD
RAZORPAY_HOLD_MINUTES=15
```

The current resort price catalog and UI are denominated in USD. Keep `RAZORPAY_CURRENCY=USD` unless the business has decided room prices are INR. Razorpay/merchant configuration determines which methods Checkout offers; UPI generally requires INR and a supported India merchant account. Do not silently relabel USD room rates as INR. If UPI is required, first set room prices and displays to INR (or add an explicit server-side FX conversion policy).

Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in frontend env variables. Only `RAZORPAY_KEY_ID` is returned to Checkout.

## Dashboard setup

1. In Razorpay Dashboard, switch to **Test Mode** and create API keys.
2. Put the Test Key ID and Key Secret in backend `.env`.
3. In Webhooks, add the public endpoint `POST https://<your-host>/api/bookings/payment/webhook`.
4. Set a random webhook secret in Razorpay and the exact same value as `RAZORPAY_WEBHOOK_SECRET` in backend `.env`.
5. Subscribe to `payment.authorized`, `payment.captured`, and `payment.failed`.
6. Restart the backend after env changes. For local webhook tests, expose port 5000 with a trusted HTTPS tunnel and configure that public URL in the Razorpay Dashboard.

## API

- `GET /api/bookings/available?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=1` — date-overlap check and server-computed amount/loyalty discount.
- `POST /api/bookings/payment/order` — guest-only; validates room/dates/capacity, reserves each room-night, creates a pending booking and Razorpay Order. Send `Idempotency-Key` with a UUID.
- `POST /api/bookings/payment/verify` — guest-only; verifies Checkout HMAC, fetches provider payment, checks amount/currency/order, captures if authorized, then confirms the booking.
- `POST /api/bookings/payment/:bookingId/retry` — reuses an active order or creates a new order for the same booking.
- `POST /api/bookings/payment/:bookingId/cancel` and `/failure` — records unpaid outcomes; neither can mark a booking paid.
- `GET /api/bookings/payment/:bookingId/status` — owner-only payment/booking state.
- `POST /api/bookings/payment/webhook` — public Razorpay endpoint; raw-body HMAC verification and event-ID idempotency are enforced.
- Legacy `POST /api/bookings` rejects guest requests so payment cannot be bypassed. Manager operations remain available.

## Data/index migration

No manual SQL migration is needed; the backend explicitly creates Mongoose indexes after MongoDB connects. New collections: `bookingslots`, `paymenttransactions`, and `processedwebhooks`. Booking documents gain payment status, currency, Razorpay IDs/signature, timestamp, expiry and idempotency fields. Room-night unique index prevents overlapping payment holds. Existing bookings default to `paymentStatus: not_required`; they remain visible and are not retroactively charged.

Review MongoDB index-creation logs on first restart. If a deployment disables index creation through infrastructure policy, provision the Mongoose model indexes before accepting bookings.

## Test Mode walkthrough

1. Add valid Razorpay Test Mode credentials and webhook secret to backend `.env`.
2. Start backend and frontend; open the guest account and choose **Book a stay**.
3. Select dates and room, then click **Confirm & pay**. Checkout opens with server-created amount/order.
4. Complete or cancel using Razorpay's current official Test Mode instruments for your account. Never use real payment details in test mode.
5. On success, verify the booking confirmation page shows `confirmed`, `paid`, booking ID, payment ID, amount and timestamp.
6. On failure/cancel, confirm it remains unconfirmed and use **Retry payment**; it should reuse the booking ID.
7. Verify a captured payment via Dashboard webhook delivery logs; duplicate events should not duplicate confirmation/email or transaction records.
8. Confirm the manager Bookings list shows payment status and payment ID.

Do a full success/failure/webhook test only after credentials and webhook configuration are set; source-only checks do not contact Razorpay.
