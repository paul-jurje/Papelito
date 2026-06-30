import { db } from '../db/index.js';
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  linkGoogleId,
} from '../repositories/userRepository.js';
import { toSafeUser } from '../types/express.js';
import type { SafeUser } from '../types/express.js';

export interface GoogleProfile {
  id: string;
  emails?: Array<{ value: string; verified?: boolean }>;
}

export class OAuthEmailRequiredError extends Error {
  constructor() {
    super('Google account must have an email address');
    this.name = 'OAuthEmailRequiredError';
  }
}

export function findOrCreateUserFromGoogle(profile: GoogleProfile): SafeUser {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new OAuthEmailRequiredError();
  }

  const byGoogle = getUserByGoogleId(db, profile.id);
  if (byGoogle) {
    return toSafeUser(byGoogle);
  }

  const byEmail = getUserByEmail(db, email);
  if (byEmail) {
    const linked = linkGoogleId(db, byEmail.id, profile.id);
    return toSafeUser(linked);
  }

  const created = createUser(db, { email, googleId: profile.id });
  return toSafeUser(created);
}
