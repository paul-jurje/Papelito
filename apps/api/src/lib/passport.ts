import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getUserById, getUserByEmail } from '../repositories/userRepository.js';
import { db } from '../db/index.js';
import { verifyPassword } from './password.js';
import { toSafeUser } from '../types/express.js';
import { findOrCreateUserFromGoogle } from '../services/oauthService.js';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const callbackURL =
  process.env.GOOGLE_CALLBACK_URL ?? `${webOrigin.replace(/\/$/, '')}/api/auth/google/callback`;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = findOrCreateUserFromGoogle({
            id: profile.id,
            emails: profile.emails?.map((e) => ({ value: e.value, verified: e.verified })),
          });
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );
}

passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = getUserByEmail(db, email);
        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        if (!user.passwordHash) {
          return done(null, false, {
            message: 'This account uses Google sign-in. Please log in with Google.',
          });
        }
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        return done(null, toSafeUser(user));
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  // `user` here is whatever we passed to `done(null, user)` above — the SafeUser.
  // We persist only the id in the session.
  const id = (user as { id: number }).id;
  done(null, id);
});

passport.deserializeUser((id: number, done) => {
  try {
    const user = getUserById(db, id);
    if (!user) {
      return done(null, false);
    }
    return done(null, toSafeUser(user));
  } catch (err) {
    return done(err as Error);
  }
});

export default passport;
