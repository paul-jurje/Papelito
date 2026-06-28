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
- `src/services/` — `authService.ts`, `billingService.ts`, `documentService.ts`, plus tests.
- `src/repositories/` — one per entity: `userRepository.ts`, `documentRepository.ts`, `subscriptionRepository.ts`.
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
- Test setup: `src/test/setup.ts` sets `NODE_ENV=test` and seeds `STRIPE_*` env vars.
- Repository tests use an in-memory SQLite DB created in setup.
- Stripe SDK is mocked in billing tests and integration tests.

## Common pitfalls

- The Stripe webhook route (`/api/billing/webhook`) MUST use `express.raw({ type: 'application/json' })` before the global `express.json()` parser so HMAC signature verification works.
- Session cookie `secure` flag is `process.env.NODE_ENV === 'production'` — do not hardcode it.
- CORS is configured explicitly in `src/index.ts` with `origin: process.env.WEB_ORIGIN` and `credentials: true`.
- `connect-sqlite3` types have a mismatch with `express-session`; the code casts `SQLiteStore` via `as unknown as new (...) => Store`.
