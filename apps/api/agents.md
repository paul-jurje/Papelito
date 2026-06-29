# AI Assistant Context: apps/api

## Stack

- Node.js ≥ 20, ESM (`"type": "module"`)
- Express 4 + Passport.js (local strategy) + express-session
- SQLite via `better-sqlite3` + Drizzle ORM
- `connect-sqlite3` for session storage
- Stripe Node SDK for billing
- Vitest + supertest for tests

## Entry points

- `src/index.ts` — builds the Express app (`buildApp()`), mounts middleware/routers, starts the server in non-test env.
- `src/db/index.ts` — lazy SQLite DB singleton; loads `.env` via `dotenv`.
- `src/db/migrate.ts` — runs Drizzle migrations.

## Architecture

Layered structure:

```
HTTP request
    │
    ▼
Routes (src/routes/*.ts)        ← Express routers, validation, status codes
    │
    ▼
Services (src/services/*.ts)    ← business logic
    │
    ▼
Repositories (src/repositories/*.ts)  ← Drizzle queries
    │
    ▼
Database (src/db/schema.ts, src/db/index.ts)
```

## Key directories

- `src/routes/` — route handlers: `auth.ts`, `billing.ts`, `documents.ts`, plus `*.test.ts`.
- `src/services/` — `authService.ts`, `billingService.ts`, `documentService.ts`, `planSyncService.ts`, plus tests.
- `src/repositories/` — one per entity: `userRepository.ts`, `documentRepository.ts`, `subscriptionRepository.ts`, `planRepository.ts`.
- `src/middleware/` — `requireAuth.ts`, `requireSubscription.ts`, plus tests.
- `src/lib/` — `passport.ts`, `password.ts`, `stripe.ts`.
- `src/types/` — shared types + `express.ts` (module augmentation for `Express.User`).
- `src/test/` — Vitest setup (`setup.ts`).
- `src/tests/integration/` — integration tests.

## Conventions

- Imports use `.js` extensions even for TypeScript files (ESM + TypeScript Bundler resolution).
- Route handlers are mounted in `src/index.ts` under `/api/*`.
- All protected routes use `requireAuth` middleware.
- Document routes additionally use `requireSubscription`.
- Passwords are hashed with `bcrypt` — see `src/lib/password.ts`.
- `src/types/express.ts` augments `Express.User` with `SafeUser`. Do NOT remove the namespace/empty-interface pattern there; it is required for module augmentation.

## Testing

- Run: `pnpm test` (or `vitest run`).
- Test setup: `src/test/setup.ts` sets `NODE_ENV=test` and seeds `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` placeholders. It does **not** set `STRIPE_PRICE_ID`; the backend is plan-agnostic and resolves prices from the synced `plans` table.
- Repository tests use an in-memory SQLite DB created in setup.
- Stripe SDK is mocked in billing tests and integration tests.
- `vitest.config.ts` sets `fileParallelism: false` because tests share the
  global SQLite DB singleton (`src/db/index.ts`) and swap in isolated
  in-memory databases between files.

## Billing & plans

The backend is multi-plan: it no longer relies on a single hardcoded
`STRIPE_PRICE_ID`. Instead, active recurring Stripe prices are synced into the
local `plans` table and exposed to the frontend.

- `GET /api/billing/plans` returns the active plans from the local `plans`
  table, each with `id`, `displayName`, `interval`, `amountCents`, and
  `currency`.
- `POST /api/billing/checkout-session` requires a JSON body with `{ planId }`
  (selected from the plans endpoint) and returns `{ url, sessionId }`. An
  invalid or inactive `planId` responds with `400`.
- `GET /api/billing/session/:sessionId` (authenticated) verifies a Stripe
  Checkout Session directly with Stripe. If the session is paid and belongs to
  the calling user, the local `subscriptions` row is upserted immediately.
  This closes the temporary "paid but not subscribed" gap caused by delayed
  webhooks. The endpoint returns `{ verified, status?, sessionId }`.
- `verifyCheckoutSession` in `src/services/billingService.ts` performs the
  Stripe lookup, validates `client_reference_id` against the caller, resolves
  the local `planId` from the subscription's price, and upserts the
  subscription.
- On startup the API calls `syncPlansFromStripe()` to upsert active recurring
  Stripe prices into the `plans` table. Sync failures are logged but do not
  block server startup.
- Webhook handlers (`customer.subscription.updated`,
  `checkout.session.completed`) resolve the matching local `planId` from the
  Stripe price id on the subscription's item(s). Webhooks remain the source of
  truth for renewals, cancellations, and charge failures.

## Password reset

Self-service password reset with single-use tokens.

- `POST /api/auth/forgot-password` accepts `{ email }`, creates a single-use reset token (hashed with Node.js `crypto`, 15-minute expiry) in `password_resets`, and returns `{ resetUrl }`. Unknown emails still return `200` with `resetUrl: null`.
- `POST /api/auth/reset-password` accepts `{ token, password }`, validates the token and that password length is ≥ 8, updates the user's password hash, deletes the token, invalidates existing sessions, and returns `200`. Invalid or expired tokens return `400`.
- A new migration creates the `password_resets` table with columns `(userId, tokenHash, expiresAt)`.
- Implementation lives in `src/services/passwordResetService.ts` and `src/repositories/passwordResetRepository.ts`, both with unit tests.
- Only Node.js `crypto` is used for token generation and hashing; no email provider is integrated.

## IDs and primary keys

- `documents.id` is a UUID string (`text` primary key) generated by Node.js `crypto.randomUUID()` in `src/db/schema.ts`.
- API types (`Document`, `DocumentResponse`, `CreateDocumentInput`, `UpdateDocumentInput`) and repository/service/route signatures all use `string` for document IDs.
- `/api/documents/:id` validates the param as a UUID (8-4-4-4-12 hex digits) and returns `400` for malformed IDs.
- User IDs remain integers (`integer` / `number`) throughout the API and schema.
- Migration `drizzle/0002_document_uuid.sql` recreates the `documents` table as UUID-backed. Existing rows are dropped; data loss is accepted.

## Common pitfalls

- The Stripe webhook route (`/api/billing/webhook`) MUST use `express.raw({ type: 'application/json' })` before the global `express.json()` parser so HMAC signature verification works.
- Session cookie `secure` flag is `process.env.NODE_ENV === 'production'` — do not hardcode it.
- CORS is configured explicitly in `src/index.ts` with `origin: process.env.WEB_ORIGIN` and `credentials: true`.
- `connect-sqlite3` types have a mismatch with `express-session`; the code casts `SQLiteStore` via `as unknown as new (...) => Store`.
