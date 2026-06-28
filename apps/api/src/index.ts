import './config/env.js';
import cors from 'cors';
import express, { type Application } from 'express';
import session, { type Store } from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import passport from './lib/passport.js';
import './types/express.js';
import { authRouter } from './routes/auth.js';
import { billingRouter } from './routes/billing.js';
import { documentsRouter } from './routes/documents.js';

// `connect-sqlite3`'s bundled types declare `createSession` as returning `void`
// but `express-session` expects a `Store` whose `createSession` returns `Session & SessionData`.
// At runtime the implementation is compatible; this cast bridges the gap.
const SQLiteStore = connectSqlite3(session) as unknown as new (options?: Record<string, unknown>) => Store;

export function buildApp(): Application {
  const app: Application = express();

  // Allow the Vite dev server (5173) and the production web origin to call
  // the API with cookies. `credentials: true` is required so the browser
  // will send the session cookie on cross-origin requests. Default to a
  // safe localhost origin for local development; set WEB_ORIGIN to the
  // deployed frontend URL in production.
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  app.use(
    cors({
      origin: webOrigin,
      credentials: true,
    }),
  );

  // Stripe webhook MUST receive the raw request body to verify its HMAC
  // signature. Register the raw parser for that exact path BEFORE the global
  // JSON parser — once `express.json()` runs, `req.body` is parsed and the
  // signature check will fail.
  app.use(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
  );

  app.use(express.json());

  const isTest = process.env.NODE_ENV === 'test';
  const sessionDb = process.env.SESSION_DB ?? (isTest ? ':memory:' : 'sessions.db');

  app.use(
    session({
      store: new SQLiteStore({ db: sessionDb, dir: '.' }),
      secret: process.env.SESSION_SECRET ?? 'dev-secret-do-not-use-in-prod',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // Only send the session cookie over HTTPS in production. In dev we
        // typically run on plain HTTP, so the cookie must be allowed there.
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  // passport must be initialized AFTER session middleware
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/documents', documentsRouter);

  return app;
}

export const app: Application = buildApp();

const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`api listening on http://localhost:${PORT}`);
  });
}
