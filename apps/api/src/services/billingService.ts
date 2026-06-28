import type Stripe from 'stripe';
import { stripe } from '../lib/stripe.js';
import { db } from '../db/index.js';
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
} from '../repositories/subscriptionRepository.js';
import {
  isCheckoutSessionCompleted,
  isCustomerSubscriptionUpdated,
} from '../types/subscription.js';

const ACTIVE_STATUS = 'active';

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface CreateCheckoutSessionDeps {
  stripeClient?: Stripe;
  successUrl?: string;
  cancelUrl?: string;
  priceId?: string;
}

/**
 * Find or create a Stripe Customer for `userId`, persist the link locally, and
 * create a subscription-mode Checkout Session for the configured price.
 *
 * The `client_reference_id` is set to the user id so the webhook can later
 * resolve which user to grant access to (Stripe also sends the customer email
 * but we treat userId as the authoritative identifier).
 */
export async function createCheckoutSession(
  userId: number,
  email: string,
  deps: CreateCheckoutSessionDeps = {},
): Promise<CheckoutSessionResult> {
  const stripeClient = deps.stripeClient ?? stripe;
  const priceId = deps.priceId ?? process.env.STRIPE_PRICE_ID;
  const successUrl =
    deps.successUrl ??
    'http://localhost:5173/checkout-return?success=true&session_id={CHECKOUT_SESSION_ID}';
  const cancelUrl =
    deps.cancelUrl ?? 'http://localhost:5173/checkout-return?success=false';

  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID is not configured.');
  }

  // Reuse a Stripe Customer we've already linked to this user; otherwise look
  // up an existing customer by email (avoids creating duplicates when the user
  // has previously checked out in test mode) and finally fall back to creating
  // a fresh customer.
  const existing = getSubscriptionByUserId(db, userId);
  let stripeCustomerId = existing?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    const found = await stripeClient.customers.list({ email, limit: 1 });
    const match = found.data[0];
    if (match) {
      stripeCustomerId = match.id;
    } else {
      const created = await stripeClient.customers.create({
        email,
        metadata: { userId: String(userId) },
      });
      stripeCustomerId = created.id;
    }
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    client_reference_id: String(userId),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout session URL.');
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Apply a verified Stripe webhook event to the local subscription table.
 *
 * Idempotency: `createOrUpdateSubscription` is an upsert keyed on `userId`,
 * so re-delivering an event yields the same final state. For
 * `checkout.session.completed` we additionally look up the subscription in
 * Stripe so we have the most up-to-date status / period end.
 */
export async function processWebhookEvent(
  event: Stripe.Event,
  deps: { stripeClient?: Stripe } = {},
): Promise<void> {
  const stripeClient = deps.stripeClient ?? stripe;

  if (isCheckoutSessionCompleted(event)) {
    const session = event.data.object;
    const userId = session.client_reference_id
      ? Number(session.client_reference_id)
      : NaN;
    const stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : null;

    if (!Number.isFinite(userId) || userId <= 0) {
      // No user to attribute the subscription to — drop silently.
      return;
    }

    if (!stripeSubscriptionId) {
      // Subscription-mode checkout should always include a subscription id;
      // if it's missing we still record the customer link so future checkouts
      // reuse it, but skip period/status fields.
      createOrUpdateSubscription(db, {
        userId,
        stripeCustomerId: stripeCustomerId ?? undefined,
        status: ACTIVE_STATUS,
      });
      return;
    }

    // Fetch the live subscription so we record accurate status and period end.
    const sub = await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
    const periodEnd = readPeriodEnd(sub);
    createOrUpdateSubscription(db, {
      userId,
      stripeCustomerId:
        stripeCustomerId ?? (typeof sub.customer === 'string' ? sub.customer : undefined),
      stripeSubscriptionId,
      status: sub.status,
      currentPeriodEnd: periodEnd,
    });
    return;
  }

  if (isCustomerSubscriptionUpdated(event)) {
    const sub = event.data.object;
    const userId = readMetadataUserId(sub.metadata) ?? resolveUserIdByCustomer(sub.customer);

    if (!userId) return;

    createOrUpdateSubscription(db, {
      userId,
      stripeCustomerId:
        typeof sub.customer === 'string' ? sub.customer : undefined,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      currentPeriodEnd: readPeriodEnd(sub),
    });
    return;
  }

  // Unhandled event types are ignored (Stripe may send many we don't care about).
}

/**
 * Stripe moved `current_period_end` from the top-level Subscription to its
 * items array in newer API versions. Helper that pulls the latest period end
 * from whichever location it's available.
 */
function readPeriodEnd(
  sub: Pick<Stripe.Subscription, 'items'>,
): Date | null {
  const item = sub.items.data[0];
  if (!item) return null;
  const ts = item.current_period_end;
  return typeof ts === 'number' ? new Date(ts * 1000) : null;
}

function readMetadataUserId(
  metadata: Stripe.Metadata | null | undefined,
): number | null {
  const raw = metadata?.userId;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveUserIdByCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): number | null {
  if (!customer) return null;
  if (typeof customer === 'string') return null;
  // DeletedCustomer has no metadata; only Customer does.
  if ('metadata' in customer) {
    return readMetadataUserId(customer.metadata);
  }
  return null;
}
