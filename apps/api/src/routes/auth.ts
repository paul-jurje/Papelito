import { Router, type Request, type Response, type NextFunction } from 'express';
import passport from '../lib/passport.js';
import { register, logout, EmailAlreadyExistsError } from '../services/authService.js';
import { requestPasswordReset, resetPassword } from '../services/passwordResetService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { db } from '../db/index.js';
import { getSubscriptionByUserId } from '../repositories/subscriptionRepository.js';
import { isActiveSubscriptionStatus } from '../types/subscription.js';

export const authRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateCredentials(email: unknown, password: unknown): string | null {
  if (typeof email !== 'string' || typeof password !== 'string') {
    return 'Email and password are required';
  }
  if (!EMAIL_REGEX.test(email)) {
    return 'Invalid email format';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

authRouter.post('/register', (req, res, next) => {
  const { email, password } = req.body ?? {};
  const validationError = validateCredentials(email, password);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  register(email as string, password as string)
    .then((user) => {
      req.login(user, (err) => {
        if (err) return next(err);
        return res.status(201).json({ user });
      });
    })
    .catch((err) => {
      if (err instanceof EmailAlreadyExistsError) {
        return res.status(409).json({ message: 'Email already registered' });
      }
      next(err);
    });
});

authRouter.post('/login', (req, res, next) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  passport.authenticate(
    'local',
    (err: unknown, user: Express.User | false | null, info: { message?: string } | undefined) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message ?? 'Invalid email or password' });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ user });
      });
    },
  )(req, res, next);
});

authRouter.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  logout(req)
    .then(() => {
      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.clearCookie('connect.sid');
        res.json({ success: true });
      });
    })
    .catch(next);
});

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const result = await requestPasswordReset(email);
    return res.status(200).json({ resetUrl: result.resetUrl });
  } catch {
    return res.status(200).json({ resetUrl: null });
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Invalid or expired reset token.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  try {
    await resetPassword(token, password);
    // Destroy the current session so the cookie used for this request cannot
    // be replayed after the password changes. The service already deletes all
    // sessions for the user from the store.
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    res.clearCookie('connect.sid');
    return res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid or expired reset token.';
    return res.status(400).json({ message });
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const sub = req.user ? getSubscriptionByUserId(db, req.user.id) : undefined;
  const isSubscriber = isActiveSubscriptionStatus(sub?.status);
  res.json({ user: req.user, isSubscriber });
});
