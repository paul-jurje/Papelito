import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createUser } from './userRepository.js';
import {
  createPasswordReset,
  deletePasswordReset,
  deletePasswordResetsByUserId,
  getPasswordResetByTokenHash,
} from './passwordResetRepository.js';

describe('passwordResetRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createPasswordReset', () => {
    it('stores a hashed token with expiry for a user', async () => {
      const user = createUser(handle.db, {
        email: 'reset@example.com',
        passwordHash: 'hash',
      });

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const row = await createPasswordReset(user.id, 'token-hash', expiresAt);

      expect(row.userId).toBe(user.id);
      expect(row.tokenHash).toBe('token-hash');
      // SQLite timestamps have second precision, so compare with a small tolerance.
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        Math.floor(expiresAt.getTime() / 1000) * 1000,
      );
      expect(row.expiresAt.getTime()).toBeLessThan(expiresAt.getTime() + 1000);
      expect(row.id).toBeTypeOf('number');
    });

    it('deletes any prior token for the user before inserting a new one', async () => {
      const user = createUser(handle.db, {
        email: 'reset@example.com',
        passwordHash: 'hash',
      });

      const first = await createPasswordReset(
        user.id,
        'first-hash',
        new Date(Date.now() + 15 * 60 * 1000),
      );
      const second = await createPasswordReset(
        user.id,
        'second-hash',
        new Date(Date.now() + 15 * 60 * 1000),
      );

      expect(second.id).not.toBe(first.id);
      expect(second.tokenHash).toBe('second-hash');
      expect(await getPasswordResetByTokenHash('first-hash')).toBeUndefined();
      expect(await getPasswordResetByTokenHash('second-hash')).toBeDefined();
    });
  });

  describe('getPasswordResetByTokenHash', () => {
    it('returns the right row for a known token hash', async () => {
      const user = createUser(handle.db, {
        email: 'reset@example.com',
        passwordHash: 'hash',
      });

      const created = await createPasswordReset(
        user.id,
        'known-hash',
        new Date(Date.now() + 15 * 60 * 1000),
      );
      const found = await getPasswordResetByTokenHash('known-hash');

      expect(found).toEqual(created);
    });

    it('returns undefined for an unknown token hash', async () => {
      expect(await getPasswordResetByTokenHash('unknown-hash')).toBeUndefined();
    });
  });

  describe('deletePasswordReset', () => {
    it('removes the row by id', async () => {
      const user = createUser(handle.db, {
        email: 'reset@example.com',
        passwordHash: 'hash',
      });

      const row = await createPasswordReset(
        user.id,
        'delete-hash',
        new Date(Date.now() + 15 * 60 * 1000),
      );
      expect(await getPasswordResetByTokenHash('delete-hash')).toBeDefined();

      await deletePasswordReset(row.id);

      expect(await getPasswordResetByTokenHash('delete-hash')).toBeUndefined();
    });
  });

  describe('deletePasswordResetsByUserId', () => {
    it('removes all rows for a user', async () => {
      const user = createUser(handle.db, {
        email: 'reset@example.com',
        passwordHash: 'hash',
      });
      const otherUser = createUser(handle.db, {
        email: 'other@example.com',
        passwordHash: 'hash',
      });

      await createPasswordReset(user.id, 'hash-1', new Date(Date.now() + 15 * 60 * 1000));
      await createPasswordReset(user.id, 'hash-2', new Date(Date.now() + 15 * 60 * 1000));
      const otherRow = await createPasswordReset(
        otherUser.id,
        'hash-3',
        new Date(Date.now() + 15 * 60 * 1000),
      );

      await deletePasswordResetsByUserId(user.id);

      expect(await getPasswordResetByTokenHash('hash-1')).toBeUndefined();
      expect(await getPasswordResetByTokenHash('hash-2')).toBeUndefined();
      expect(await getPasswordResetByTokenHash('hash-3')).toEqual(otherRow);
    });
  });
});
