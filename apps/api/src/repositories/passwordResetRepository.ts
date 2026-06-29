import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { passwordResets, type DbPasswordReset } from '../db/schema.js';

export async function createPasswordReset(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<DbPasswordReset> {
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId)).run();

  const row = await db
    .insert(passwordResets)
    .values({
      userId,
      tokenHash,
      expiresAt,
    })
    .returning()
    .get();

  return row;
}

export async function getPasswordResetByTokenHash(
  tokenHash: string,
): Promise<DbPasswordReset | undefined> {
  const row = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .get();

  return row;
}

export async function deletePasswordReset(id: number): Promise<void> {
  await db.delete(passwordResets).where(eq(passwordResets.id, id)).run();
}

export async function deletePasswordResetsByUserId(userId: number): Promise<void> {
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId)).run();
}
