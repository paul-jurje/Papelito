import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../index.js';
import { getUserByEmail } from '../repositories/userRepository.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { register, EmailAlreadyExistsError } from './authService.js';
import { verifyPassword } from '../lib/password.js';

describe('authService.register', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    // Reset the singleton to a fresh in-memory DB with migrations applied.
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('creates a user with a hashed password and returns a safe user (no hash)', async () => {
    const safe = await register('alice@example.com', 'password123');
    expect(safe.id).toBeTypeOf('number');
    expect(safe.email).toBe('alice@example.com');
    expect(safe.createdAt).toBeInstanceOf(Date);
    // SafeUser must NOT include passwordHash
    expect((safe as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('stores a bcrypt hash, not the plaintext password', async () => {
    await register('bob@example.com', 'supersecret');
    const stored = getUserByEmail(db, 'bob@example.com');
    expect(stored).toBeDefined();
    expect(stored!.passwordHash).not.toBe('supersecret');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword('supersecret', stored!.passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', stored!.passwordHash)).resolves.toBe(false);
  });

  it('throws EmailAlreadyExistsError for duplicate emails', async () => {
    await register('dup@example.com', 'password123');
    await expect(register('dup@example.com', 'password456')).rejects.toBeInstanceOf(
      EmailAlreadyExistsError,
    );
  });

  it('is case-sensitive on email equality', async () => {
    await register('case@example.com', 'password123');
    // Database has unique constraint on exact email match; different casing should be allowed
    // (this documents current behavior — registration is case-sensitive).
    await expect(register('CASE@example.com', 'password456')).resolves.toBeDefined();
  });
});
