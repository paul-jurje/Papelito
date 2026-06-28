// Runs before any test module is imported. Sets NODE_ENV='test' so that
// `buildApp()` (evaluated at module load time) picks the in-memory session
// store and any code that branches on NODE_ENV behaves correctly.
process.env.NODE_ENV = 'test';

// The Stripe SDK is constructed at module load time and throws if the secret
// key is missing. `app` in `./src/index.ts` is built at module load and
// transitively imports the Stripe SDK, so test files that import `app`
// (e.g. `auth.test.ts`, `index.test.ts`) need the env var set before module
// evaluation begins. Test files that exercise billing logic (`billing.test.ts`)
// additionally mock the SDK via `vi.mock`, so these placeholders are only
// needed to satisfy the module-load guard.
process.env.STRIPE_SECRET_KEY = 'sk_test_setup_placeholder';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_setup_placeholder';
process.env.STRIPE_PRICE_ID = 'price_test_setup_placeholder';
