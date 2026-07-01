# Subscription System: Three Interview Answers

## 1. How does the app decide a user is an active subscriber?

The decision is made server-side, never by trusting the frontend. When the user
or the checkout-return page asks "am I subscribed?", `GET /api/auth/me` loads the
row from the local `subscriptions` table and reports back `isSubscriber` using
`isActiveSubscriptionStatus(sub?.status)` (`apps/api/src/routes/auth.ts`). That
helper is strict: only the Stripe status `active` counts as subscribed. Anything else — `past_due`, `unpaid`, `incomplete`,
`incomplete_expired`, `canceled`, `paused`, or a missing row — resolves to
`false` (`apps/api/src/types/subscription.ts`).

Document routes are gated the same way. `requireSubscription` reads the user's
subscription from the `subscriptions` table on every request and returns 403
unless the status is active
(`apps/api/src/middleware/requireSubscription.ts`,
`apps/api/src/routes/documents.ts`).

The only place that authoritative status is written is by Stripe itself. We
listen to `checkout.session.completed` and `customer.subscription.updated` (plus
created/deleted variants) and upsert the `subscriptions` table with the live
status, `current_period_end`, and resolved plan id
(`apps/api/src/services/billingService.ts`, `apps/api/src/db/schema.ts`). So the
frontend can poll `/api/auth/me` all it wants, but the gatekeeper is always the
database row written by Stripe webhooks.

## 2. What happens if payment succeeds but the webhook is delayed?

We don't leave the user stranded. After Stripe redirects back to
`/checkout-return?success=true&session_id=...`, the frontend can call
`GET /api/billing/session/:sessionId` (`apps/api/src/routes/billing.ts`). The
`verifyCheckoutSession` service retrieves that Checkout Session from Stripe,
confirms `payment_status === 'paid'`, validates that `client_reference_id`
matches the logged-in user, expands the subscription, resolves the local plan
from the Stripe price id, and immediately upserts the local subscription row
(`apps/api/src/services/billingService.ts`).

This closes the gap while the webhook is still in flight, but it does not
replace webhooks. Webhooks remain the source of truth for renewals,
cancellations, charge failures, and period-end updates. The verify path is just
a safety net for the exact moment the user lands back in the app.

## 3. One security decision you made and why

The decision I'm most glad we made is verifying the Stripe webhook HMAC
signature. Because receiving a Stripe event means potentially granting someone
subscriber access, we treat every unverified event as hostile.

In `apps/api/src/index.ts`, we register
`express.raw({ type: 'application/json' })` for `/api/billing/webhook` before the
global `express.json()` parser. That preserves the raw request Buffer, which
Stripe's signature check needs. Then the webhook handler in
`apps/api/src/routes/billing.ts` calls
`stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)` and
responds 400 if verification fails. Without that step, anyone who knew our
webhook URL could POST a forged `checkout.session.completed` event and grant
themselves access. With it, only Stripe can write the subscription state.
