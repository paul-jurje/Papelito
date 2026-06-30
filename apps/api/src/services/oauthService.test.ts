import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '../db/index.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { findOrCreateUserFromGoogle, OAuthEmailRequiredError } from './oauthService.js';
import { createUser } from '../repositories/userRepository.js';

describe('findOrCreateUserFromGoogle', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  const profile = (id: string, email: string) => ({
    id,
    emails: [{ value: email }],
  });

  it('creates an OAuth-only user when neither google id nor email exists', () => {
    const user = findOrCreateUserFromGoogle(profile('g1', 'new@example.com'));
    expect(user.email).toBe('new@example.com');
    expect((user as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('logs in an existing user matched by google id', () => {
    createUser(db, { email: 'a@example.com', googleId: 'g2' });
    const user = findOrCreateUserFromGoogle(profile('g2', 'a@example.com'));
    expect(user.email).toBe('a@example.com');
  });

  it('links google id to an existing email/password user', () => {
    createUser(db, { email: 'b@example.com', passwordHash: 'hash' });
    const user = findOrCreateUserFromGoogle(profile('g3', 'b@example.com'));
    expect(user.email).toBe('b@example.com');
  });

  it('throws when google profile has no email', () => {
    expect(() => findOrCreateUserFromGoogle({ id: 'g4' })).toThrow(OAuthEmailRequiredError);
  });
});
