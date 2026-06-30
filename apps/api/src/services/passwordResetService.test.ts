import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createUser } from '../repositories/userRepository.js';
import { getPasswordResetByTokenHash } from '../repositories/passwordResetRepository.js';
import { db } from '../db/index.js';
import { passwordResets, users } from '../db/schema.js';
import { requestPasswordReset, resetPassword } from './passwordResetService.js';
import { verifyPassword } from '../lib/password.js';

describe('passwordResetService', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('requestPasswordReset', () => {
    it('returns { resetUrl: null } for an unknown email and creates no token', async () => {
      const result = await requestPasswordReset('unknown@example.com');
      expect(result).toEqual({ resetUrl: null });
      expect(await getPasswordResetByTokenHash('any-hash')).toBeUndefined();
    });

    it('returns a URL with a 64-char hex token and stores the SHA-256 hash for a known email', async () => {
      const user = createUser(db, {
        email: 'known@example.com',
        passwordHash: 'hash',
      });

      const result = await requestPasswordReset('known@example.com');

      expect(result.resetUrl).toMatch(/\/reset-password\?token=[a-f0-9]{64}$/);
      const token = new URL(result.resetUrl!).searchParams.get('token')!;
      expect(token).toHaveLength(64);

      const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
      const stored = await getPasswordResetByTokenHash(expectedHash);
      expect(stored).toBeDefined();
      expect(stored!.userId).toBe(user.id);
      expect(stored!.tokenHash).toBe(expectedHash);
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('resetPassword', () => {
    it('updates the user password, deletes the token, and succeeds with a valid token', async () => {
      createUser(db, {
        email: 'reset@example.com',
        passwordHash: 'old-hash',
      });

      const { resetUrl } = await requestPasswordReset('reset@example.com');
      const token = new URL(resetUrl!).searchParams.get('token')!;

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(await getPasswordResetByTokenHash(tokenHash)).toBeDefined();

      await resetPassword(token, 'newpassword456');

      const updatedUser = db.select().from(users).where(eq(users.email, 'reset@example.com')).get();
      expect(await verifyPassword('newpassword456', updatedUser!.passwordHash!)).toBe(true);
      expect(await verifyPassword('old-hash', updatedUser!.passwordHash!)).toBe(false);
      expect(await getPasswordResetByTokenHash(tokenHash)).toBeUndefined();
    });

    it('throws "Invalid or expired reset token" for an invalid token', async () => {
      await expect(resetPassword('invalid-token', 'newpassword456')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('throws "Invalid or expired reset token" for an expired token', async () => {
      createUser(db, {
        email: 'expired@example.com',
        passwordHash: 'hash',
      });

      const { resetUrl } = await requestPasswordReset('expired@example.com');
      const token = new URL(resetUrl!).searchParams.get('token')!;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Manually expire the token
      db.update(passwordResets)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(passwordResets.tokenHash, tokenHash))
        .run();

      await expect(resetPassword(token, 'newpassword456')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('throws "Password must be at least 8 characters" for a short password', async () => {
      createUser(db, {
        email: 'short@example.com',
        passwordHash: 'hash',
      });

      const { resetUrl } = await requestPasswordReset('short@example.com');
      const token = new URL(resetUrl!).searchParams.get('token')!;

      await expect(resetPassword(token, 'short')).rejects.toThrow(
        'Password must be at least 8 characters',
      );
    });
  });
});
