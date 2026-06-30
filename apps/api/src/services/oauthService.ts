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

export class OAuthEmailNotVerifiedError extends Error {
  constructor() {
    super(
      'Google email is not verified. Please verify your email with Google or log in with your password.',
    );
    this.name = 'OAuthEmailNotVerifiedError';
  }
}

export function findOrCreateUserFromGoogle(profile: GoogleProfile): SafeUser {
  const primaryEmail = profile.emails?.[0];
  const email = primaryEmail?.value;
  if (!email) {
    throw new OAuthEmailRequiredError();
  }

  const normalizedEmail = email.toLowerCase();
  const isVerified = primaryEmail?.verified ?? false;

  return db.transaction((tx) => {
    const byGoogle = getUserByGoogleId(tx, profile.id);
    if (byGoogle) {
      return toSafeUser(byGoogle);
    }

    const byEmail = getUserByEmail(tx, normalizedEmail);
    if (byEmail) {
      if (!isVerified) {
        throw new OAuthEmailNotVerifiedError();
      }
      const linked = linkGoogleId(tx, byEmail.id, profile.id);
      return toSafeUser(linked);
    }

    const created = createUser(tx, { email: normalizedEmail, googleId: profile.id });
    return toSafeUser(created);
  });
}
