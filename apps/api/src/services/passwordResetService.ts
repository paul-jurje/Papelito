import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { hashPassword } from '../lib/password.js';
import { getUserByEmail, updateUserPassword } from '../repositories/userRepository.js';
import {
  createPasswordReset,
  deletePasswordReset,
  getPasswordResetByTokenHash,
} from '../repositories/passwordResetRepository.js';

export interface PasswordResetRequestResult {
  resetUrl: string | null;
}

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUserByEmail(db, normalizedEmail);

  if (!user) {
    return { resetUrl: null };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await createPasswordReset(user.id, tokenHash, expiresAt);

  const resetUrl = `${WEB_ORIGIN}/reset-password?token=${token}`;
  return { resetUrl };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const tokenHash = sha256Hex(token);
  const tokenRow = await getPasswordResetByTokenHash(tokenHash);

  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    throw new Error('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  updateUserPassword(db, tokenRow.userId, passwordHash);

  await deletePasswordReset(tokenRow.id);

  try {
    await db.run(
      sql`DELETE FROM sessions WHERE json_extract(sess, '$.passport.user') = ${tokenRow.userId}`,
    );
  } catch (error) {
    // When no session has ever been written, connect-sqlite3 may not have created the table yet.
    // The underlying SQLite error may be wrapped by Drizzle, so inspect both the error and its cause.
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error.cause : undefined;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    if (message.includes('no such table') || causeMessage.includes('no such table')) {
      return;
    }
    throw error;
  }
}
