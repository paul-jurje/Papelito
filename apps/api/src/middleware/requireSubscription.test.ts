import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { requireSubscription } from './requireSubscription.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createOrUpdateSubscription } from '../repositories/subscriptionRepository.js';
import { createUser } from '../repositories/userRepository.js';

// We don't load the real Express app here (to avoid session store / DB coupling
// in this unit test); we mount requireSubscription on a tiny app with a stub
// auth middleware that injects a fake user, simulating Passport's behaviour.
function buildApp(opts: { userId?: number } = {}) {
  const app = express();
  const authedUser = opts.userId
    ? {
        id: opts.userId,
        email: 'sub@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Simulate Passport's `req.user` for unit-test purposes.
    if (req.headers['x-test-anonymous'] === '1') return next();
    if (authedUser) {
      (req as Request & { user: typeof authedUser }).user = authedUser;
    }
    next();
  });
  const router = Router();
  router.get('/protected', requireSubscription, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(router);
  return app;
}

const buildAppWithUser = (userId: number) => buildApp({ userId });

describe('requireSubscription middleware', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('returns 401 when no user is attached to the request', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('x-test-anonymous', '1');
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no subscription row', async () => {
    // Create a real user so the FK on `subscriptions.user_id` is satisfied,
    // but seed NO subscription row for them.
    const user = createUser(handle.db, {
      email: 'no-sub@example.com',
      passwordHash: 'hash',
    });
    const app = buildAppWithUser(user.id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/subscription/i);
  });

  it('returns 403 when subscription status is inactive', async () => {
    const user = createUser(handle.db, { email: 'canceled@example.com', passwordHash: 'hash' });
    createOrUpdateSubscription(handle.db, { userId: user.id, status: 'canceled' });
    const app = buildAppWithUser(user.id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('returns 403 for past_due status (not currently active)', async () => {
    const user = createUser(handle.db, { email: 'pastdue@example.com', passwordHash: 'hash' });
    createOrUpdateSubscription(handle.db, { userId: user.id, status: 'past_due' });
    const app = buildAppWithUser(user.id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('allows the request through when subscription status is active', async () => {
    const user = createUser(handle.db, { email: 'active@example.com', passwordHash: 'hash' });
    createOrUpdateSubscription(handle.db, { userId: user.id, status: 'active' });
    const app = buildAppWithUser(user.id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows the request through when subscription status is trialing', async () => {
    const user = createUser(handle.db, { email: 'trial@example.com', passwordHash: 'hash' });
    createOrUpdateSubscription(handle.db, { userId: user.id, status: 'trialing' });
    const app = buildAppWithUser(user.id);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });
});
