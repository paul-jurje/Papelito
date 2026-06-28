import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import SubscribeButton from './SubscribeButton';

export interface BillingStatusProps {
  /**
   * When true, the inline free-plan copy is hidden. Useful when embedding
   * the badge in tight UI like the header.
   */
  compact?: boolean;
  /**
   * Where to send the user after they click "Subscribe" while logged in.
   * Defaults to `/editor`.
   */
  returnTo?: string;
}

/**
 * Read-only subscription status pill.
 *
 * - Active subscribers see a green "Subscribed" badge.
 * - Everyone else (loading, unauthenticated, free) sees a "Free plan"
 *   indicator and a subscribe CTA.
 *
 * The component never blocks the page; it just shows the current state and
 * the next step.
 */
export function BillingStatus({
  compact = false,
  returnTo = '/editor',
}: BillingStatusProps): ReactNode {
  const { isAuthenticated, isLoading, isSubscriber } = useAuth();

  if (isSubscriber) {
    return (
      <span
        data-testid="billing-status"
        data-status="active"
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
        />
        Subscribed
      </span>
    );
  }

  return (
    <div
      data-testid="billing-status"
      data-status="inactive"
      className="flex items-center gap-3"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400"
        />
        {isLoading
          ? 'Checking plan…'
          : isAuthenticated
            ? 'Free plan'
            : 'Free plan'}
      </span>
      {!compact && (
        <SubscribeButton
          variant="light"
          label="Subscribe"
          returnTo={returnTo}
        />
      )}
    </div>
  );
}

export default BillingStatus;
