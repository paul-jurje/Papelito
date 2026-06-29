import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { db } from '../db/index.js';
import {
  createCheckoutSession,
  processWebhookEvent,
  verifyCheckoutSession,
  PlanNotFoundError,
  InactivePlanError,
} from '../services/billingService.js';
import { stripe } from '../lib/stripe.js';
import { getActivePlans } from '../repositories/planRepository.js';

export const billingRouter = Router();

// GET /api/billing/plans
// Returns the active subscription plans available for checkout. The frontend
// uses this list to render plan selection instead of relying on a hardcoded
// price id.
billingRouter.get('/plans', async (_req, res, next) => {
  try {
    const plans = getActivePlans(db);
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

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
    const { planId } = req.body;
    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ message: 'planId is required' });
      return;
    }

    const result = await createCheckoutSession(req.user.id, planId, req.user.email);
    res.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    if (err instanceof PlanNotFoundError || err instanceof InactivePlanError) {
      res.status(400).json({ message: err.message });
      return;
    }
    next(err);
  }
});

// GET /api/billing/session/:sessionId
// Verifies a Stripe Checkout Session on browser return. If payment succeeded,
// the local subscription row is activated immediately, closing the gap before
// the webhook arrives.
billingRouter.get('/session/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      res.status(400).json({ message: 'Invalid session id' });
      return;
    }
    const result = await verifyCheckoutSession(req.user!.id, sessionId);
    res.json(result);
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
    res.status(400).json({ message: 'Webhook requires raw body (check route ordering)' });
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
      console.error('Webhook handler failed:', err);
      res.json({ received: true });
    });
});
