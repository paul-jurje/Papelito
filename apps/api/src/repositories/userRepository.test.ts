import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '../db/index.js';
import { createUser, getUserByGoogleId, linkGoogleId, getUserByEmail } from './userRepository.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';

describe('userRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('creates a user without a password (OAuth-only)', () => {
    const user = createUser(db, { email: 'oauth@example.com', googleId: '123' });
    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toBe('123');
  });

  it('looks up a user by google id', () => {
    createUser(db, { email: 'oauth@example.com', googleId: '123' });
    const found = getUserByGoogleId(db, '123');
    expect(found).toBeDefined();
    expect(found!.email).toBe('oauth@example.com');
  });

  it('links a google id to an existing email/password user', () => {
    const user = createUser(db, { email: 'existing@example.com', passwordHash: 'hash' });
    const linked = linkGoogleId(db, user.id, 'google-123');
    expect(linked.googleId).toBe('google-123');
    expect(getUserByEmail(db, 'existing@example.com')!.googleId).toBe('google-123');
  });
});
