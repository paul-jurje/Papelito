// Domain types and webhook-event narrowing helpers for Stripe subscriptions.

import type Stripe from 'stripe';

/**
 * Stripe subscription statuses that grant the user access to subscriber-only
 * features (the editor). We treat `active` and `trialing` as "subscribed".
 *
 * Other statuses (`past_due`, `unpaid`, `incomplete`, `incomplete_expired`,
 * `canceled`, `paused`) deny access.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const;
export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isActiveSubscriptionStatus(
  status: string | null | undefined,
): status is ActiveSubscriptionStatus {
  return (
    typeof status === 'string' &&
    (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Shape we expect from a `checkout.session.completed` event payload for a
 * subscription-mode checkout. We narrow the Stripe event union before using
 * the fields so the service layer can stay type-safe.
 */
export interface CheckoutSessionCompletedData {
  id: string;
  customer: string | null;
  // In subscription mode, this is the Stripe Subscription id (e.g. `sub_...`).
  subscription: string | null;
  client_reference_id: string | null;
  customer_email: string | null;
}

/**
 * Shape we care about from a `customer.subscription.{updated,deleted}` event.
 */
export interface StripeSubscriptionData {
  id: string;
  customer: string | null;
  status: string;
  // Unix timestamp (seconds). Stripe's `current_period_end` is always present
  // on active subscriptions.
  current_period_end: number;
  cancel_at_period_end?: boolean;
}

// Narrowing helpers — Stripe's event type is a discriminated union and we
// only care about a small set of event names.
export function isCheckoutSessionCompleted(
  event: Stripe.Event,
): event is Stripe.Event & { type: 'checkout.session.completed' } {
  return event.type === 'checkout.session.completed';
}

export function isCustomerSubscriptionUpdated(
  event: Stripe.Event,
): event is Stripe.Event & {
  type: 'customer.subscription.updated' | 'customer.subscription.deleted';
} {
  return (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  );
}
