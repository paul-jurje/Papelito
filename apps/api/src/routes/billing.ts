import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createCheckoutSession,
  processWebhookEvent,
} from '../services/billingService.js';
import { stripe } from '../lib/stripe.js';

export const billingRouter = Router();

// POST /api/billing/checkout-session
// Creates a Stripe Checkout Session in subscription mode and returns the URL
// the frontend should redirect the user to.
billingRouter.post('/checkout-session', requireAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      // requireAuth guarantees this, but the type system doesn't know.
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await createCheckoutSession(req.user.id, req.user.email);
    res.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/webhook
//
// IMPORTANT: this route must be mounted on the app with `express.raw()` BEFORE
// the global `express.json()` parser so we receive the raw Buffer needed to
// verify Stripe's HMAC signature. See `apps/api/src/index.ts`.
billingRouter.post('/webhook', (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ message: 'STRIPE_WEBHOOK_SECRET is not configured' });
    return;
  }
  if (typeof sig !== 'string') {
    res.status(400).json({ message: 'Missing stripe-signature header' });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    // This shouldn't happen if the app is wired correctly; fail loudly.
    res
      .status(400)
      .json({ message: 'Webhook requires raw body (check route ordering)' });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    res.status(400).json({ message: `Webhook signature verification failed: ${message}` });
    return;
  }

  // Fire-and-forget: respond 200 quickly so Stripe doesn't retry, but await
  // the DB update so failures surface in logs.
  processWebhookEvent(event)
    .then(() => {
      res.json({ received: true });
    })
    .catch((err) => {
      // We already verified the signature — log and still return 200 so
      // Stripe doesn't retry indefinitely. In production, route to an
      // alerting sink here.
      // eslint-disable-next-line no-console
      console.error('Webhook handler failed:', err);
      res.json({ received: true });
    });
});
