import Stripe from 'stripe';

// Single Stripe SDK instance used by the API. Reads the secret key from
// `STRIPE_SECRET_KEY`. Throws at construction time if the key is missing —
// we'd rather fail loudly on boot than at request time.
const apiKey = process.env.STRIPE_SECRET_KEY;
if (!apiKey) {
  throw new Error(
    'STRIPE_SECRET_KEY is not set. Add it to your environment (see .env.example).',
  );
}

// We intentionally let the SDK use its default `apiVersion` (the one baked
// into the installed SDK package) so the type definitions stay consistent
// with the runtime behaviour.
export const stripe = new Stripe(apiKey, {
  typescript: true,
});
