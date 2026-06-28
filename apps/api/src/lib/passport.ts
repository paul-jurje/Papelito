import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { getUserById, getUserByEmail } from '../repositories/userRepository.js';
import { db } from '../db/index.js';
import { verifyPassword } from './password.js';
import { toSafeUser } from '../types/express.js';

passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = getUserByEmail(db, email);
        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
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
