import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '../db/index.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import {
  findOrCreateUserFromGoogle,
  OAuthEmailRequiredError,
  OAuthEmailNotVerifiedError,
} from './oauthService.js';
import { createUser } from '../repositories/userRepository.js';

describe('findOrCreateUserFromGoogle', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  const profile = (id: string, email: string, verified = true) => ({
    id,
    emails: [{ value: email, verified }],
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

  it('links google id to an existing email/password user when email is verified', () => {
    const existing = createUser(db, { email: 'b@example.com', passwordHash: 'hash' });
    const user = findOrCreateUserFromGoogle(profile('g3', 'b@example.com'));
    expect(user.email).toBe('b@example.com');
    expect(user.id).toBe(existing.id);
    expect(user.googleId).toBe('g3');
  });

  it('does not link to an existing email/password user when the Google email is unverified', () => {
    createUser(db, { email: 'unverified@example.com', passwordHash: 'hash' });
    expect(() =>
      findOrCreateUserFromGoogle(profile('g5', 'unverified@example.com', false)),
    ).toThrow(OAuthEmailNotVerifiedError);
  });

  it('creates a new OAuth-only account for an unverified email when no existing user matches', () => {
    const user = findOrCreateUserFromGoogle(profile('g5', 'unverified@example.com', false));
    expect(user.email).toBe('unverified@example.com');
    expect(user.googleId).toBe('g5');
  });

  it('normalizes the Google email to lowercase before lookup and creation', () => {
    const existing = createUser(db, { email: 'mixed@example.com', passwordHash: 'hash' });
    const linked = findOrCreateUserFromGoogle(profile('g6', 'MIXED@EXAMPLE.COM'));
    expect(linked.id).toBe(existing.id);
    expect(linked.googleId).toBe('g6');

    const created = findOrCreateUserFromGoogle(profile('g7', 'UPPER@EXAMPLE.COM'));
    expect(created.email).toBe('upper@example.com');
    expect(created.googleId).toBe('g7');
  });

  it('throws when google profile has no email', () => {
    expect(() => findOrCreateUserFromGoogle({ id: 'g4' })).toThrow(OAuthEmailRequiredError);
  });
});
