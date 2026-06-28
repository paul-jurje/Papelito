import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './requireAuth.js';
import { db } from '../db/index.js';
import { getSubscriptionByUserId } from '../repositories/subscriptionRepository.js';
import { isActiveSubscriptionStatus } from '../types/subscription.js';

/**
 * Gate that allows the request through only when the session user has an
 * active (or trialing) subscription. 401 if unauthenticated, 403 if
 * authenticated but not subscribed. Use this AFTER `requireAuth` is implicitly
 * satisfied — `requireAuth` is composed in so callers only need to register
 * this middleware.
 */
export function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) {
      // requireAuth already responded; this is just a type-narrowing guard.
      return;
    }
    const sub = getSubscriptionByUserId(db, req.user.id);
    if (!isActiveSubscriptionStatus(sub?.status)) {
      res.status(403).json({ message: 'Active subscription required' });
      return;
    }
    next();
  });
}
