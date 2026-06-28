import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';

const agent = () => request.agent(app);

// Normalize `set-cookie` (which is `string | string[] | undefined`) into a single string
// so tests can pattern-match against it portably.
function setCookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw.join(' ');
  return raw ?? '';
}

describe('POST /api/auth/register', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('creates a user, hashes the password, logs them in, returns user (no hash)', async () => {
    const res = await agent()
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.id).toBeTypeOf('number');
    expect(res.body.user.passwordHash).toBeUndefined();
    // session cookie established
    expect(setCookieHeader(res)).toMatch(/connect\.sid=/);
  });

  it('rejects invalid email format with 400', async () => {
    const res = await agent()
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('rejects short password with 400', async () => {
    const res = await agent()
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  it('returns 409 when email already exists', async () => {
    await agent()
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'password123' });
    const res = await agent()
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'password456' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already/i);
  });
});

describe('POST /api/auth/login', () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = createTestDb();
    await agent()
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'password123' });
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('logs in a valid user, returns user (no hash), sets session cookie', async () => {
    const res = await agent()
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(setCookieHeader(res)).toMatch(/connect\.sid=/);
  });

  it('returns 401 for wrong password', async () => {
    const res = await agent()
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  it('returns 401 for unknown email', async () => {
    const res = await agent()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when email/password missing', async () => {
    const res = await agent().post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns current user after login', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'me@example.com',
      password: 'password123',
    });
    const res = await a.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

describe('POST /api/auth/logout', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('destroys the session and returns success', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'out@example.com',
      password: 'password123',
    });
    const before = await a.get('/api/auth/me');
    expect(before.status).toBe(200);

    const logoutRes = await a.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ success: true });

    const after = await a.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('returns success even when not authenticated', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
