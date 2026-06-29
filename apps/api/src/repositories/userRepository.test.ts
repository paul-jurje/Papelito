import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createUser, getUserByEmail, getUserById } from './userRepository.js';

describe('userRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createUser', () => {
    it('inserts a user with default timestamps and returns it', () => {
      const user = createUser(handle.db, {
        email: 'alice@example.com',
        passwordHash: 'hash-1',
      });

      expect(user.id).toBeTypeOf('number');
      expect(user.id).toBeGreaterThan(0);
      expect(user.email).toBe('alice@example.com');
      expect(user.passwordHash).toBe('hash-1');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('rejects duplicate emails via the unique constraint', () => {
      createUser(handle.db, {
        email: 'dup@example.com',
        passwordHash: 'h',
      });
      expect(() =>
        createUser(handle.db, { email: 'dup@example.com', passwordHash: 'h2' }),
      ).toThrow();
    });
  });

  describe('getUserByEmail', () => {
    it('returns the matching user', () => {
      const created = createUser(handle.db, {
        email: 'find@example.com',
        passwordHash: 'hash',
      });
      const found = getUserByEmail(handle.db, 'find@example.com');
      expect(found).toEqual(created);
    });

    it('returns undefined when no user matches', () => {
      expect(getUserByEmail(handle.db, 'missing@example.com')).toBeUndefined();
    });
  });

  describe('getUserById', () => {
    it('returns the matching user', () => {
      const created = createUser(handle.db, {
        email: 'byid@example.com',
        passwordHash: 'hash',
      });
      const found = getUserById(handle.db, created.id);
      expect(found).toEqual(created);
    });

    it('returns undefined for an unknown id', () => {
      expect(getUserById(handle.db, 99999)).toBeUndefined();
    });
  });
});
