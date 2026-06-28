# AI Assistant Context: Papelito (root)

Use this file alongside `apps/api/agents.md` and `apps/web/agents.md` when changing either workspace.

## Monorepo layout

- `package.json` — root pnpm workspace manifest; no runtime code here.
- `pnpm-workspace.yaml` — declares `apps/*` as workspace packages.
- `apps/api/` — Express API (Node.js, ESM).
- `apps/web/` — Vite React SPA.
- Shared style toolchain lives at root: `tailwind.config.js`, `postcss.config.mjs`, `prettier.config.mjs`, `tsconfig.base.json`.

## Common commands

```bash
pnpm install              # install all workspace deps
pnpm dev                  # starts Vite (5173) + API (3000) concurrently
pnpm test                 # runs vitest in both apps
pnpm typecheck            # runs tsc in both apps
pnpm lint                 # runs ESLint in both apps
pnpm lint:fix             # auto-fix ESLint issues in both apps
pnpm format               # check formatting with Prettier
pnpm format:fix           # format with Prettier
```

Individual app commands:

```bash
cd apps/api && pnpm dev / pnpm test / pnpm typecheck / pnpm lint / pnpm db:migrate
cd apps/web && pnpm dev / pnpm test / pnpm typecheck / pnpm lint
```

## Environment

Copy `.env.example` to `.env` at repo root. The API loads it via `dotenv` in `apps/api/src/db/index.ts`. Key vars:

- `DATABASE_URL` — SQLite path (default `papelito.db`).
- `SESSION_SECRET` — session cookie signing secret.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` — required for billing.
- `WEB_ORIGIN` — CORS origin for the frontend (default `http://localhost:5173`).
- `PORT` — API port (default `3000`).

In tests, `NODE_ENV=test` is set by `apps/api/src/test/setup.ts`, which also stubs the Stripe env vars.

## Conventions

- TypeScript everywhere; strict mode enabled in `tsconfig.base.json`.
- Use pnpm workspaces — add shared deps at root, app-specific deps in the app's `package.json`.
- Run `pnpm install` after editing any `package.json`.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm lint` before declaring work done.
- Keep Prettier formatting consistent; config is in `prettier.config.mjs`.
