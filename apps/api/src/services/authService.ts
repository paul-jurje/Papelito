import { createUser, getUserByEmail } from '../repositories/userRepository.js';
import { db } from '../db/index.js';
import { hashPassword } from '../lib/password.js';
import type { SafeUser } from '../types/express.js';
import { toSafeUser } from '../types/express.js';
import type { Request } from 'express';

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export async function register(email: string, password: string): Promise<SafeUser> {
  const existing = getUserByEmail(db, email);
  if (existing) {
    throw new EmailAlreadyExistsError(email);
  }
  const passwordHash = await hashPassword(password);
  const user = createUser(db, { email, passwordHash });
  return toSafeUser(user);
}

// Wraps `req.logout` in a Promise so route handlers can await it.
export function logout(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.logout((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
