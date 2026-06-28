import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBilling } from '../hooks/useBilling';

export interface SubscribeButtonProps {
  /**
   * Visual variant. `solid` is the dark primary CTA (default for pricing
   * pages), `light` is a softer outline style for inline placements like
   * the editor upsell screen.
   */
  variant?: 'solid' | 'light';
  /**
   * Optional override for the button label. Defaults to "Subscribe".
   */
  label?: string;
  /**
   * If provided, unauthenticated users are sent to `/login?next=...`
   * instead of `/register?next=...`.
   */
  unauthenticatedRedirect?: 'login' | 'register';
  /**
   * Class name appended to the rendered element (button or link).
   */
  className?: string;
  /**
   * Where the user should land after the post-checkout return page finishes.
   * Defaults to `/editor`.
   */
  returnTo?: string;
  /**
   * Optional override for the `data-testid` attribute. Defaults to
   * `"subscribe-button"`. Use when multiple buttons need distinct test ids
   * on the same page (e.g. pricing + upsell).
   */
  'data-testid-attr'?: string;
}

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANT_CLASSES: Record<NonNullable<SubscribeButtonProps['variant']>, string> = {
  solid: 'bg-slate-900 text-white hover:bg-slate-800',
  light:
    'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50',
};

/**
 * Subscribe CTA.
 *
 * Behaviour:
 * - Subscribed users: renders nothing (no CTA needed).
 * - Authenticated, non-subscribed: calls `useBilling().createCheckout()`,
 *   which POSTs to `/api/billing/checkout-session` and redirects to Stripe.
 * - Unauthenticated: links to register/login with a `next` query so the
 *   user lands back here after signing in.
 */
export function SubscribeButton({
  variant = 'solid',
  label = 'Subscribe',
  unauthenticatedRedirect = 'register',
  className,
  returnTo = '/editor',
  'data-testid-attr': testId = 'subscribe-button',
}: SubscribeButtonProps): ReactNode {
  const { isAuthenticated, isLoading: isAuthLoading, isSubscriber } = useAuth();
  const { createCheckout, isLoading: isCheckoutLoading, error } = useBilling();
  const [localError, setLocalError] = useState<string | null>(null);

  const isLoading = isAuthLoading || isCheckoutLoading;

  // Don't show the button to users who already have an active subscription.
  if (isSubscriber) {
    return null;
  }

  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]}${
    className ? ` ${className}` : ''
  }`;

  // Unauthenticated users get a link to the sign-in / sign-up flow. After
  // authenticating they'll land back where they came from via `next`, where
  // they can complete the subscription.
  if (!isAuthenticated) {
    const target =
      unauthenticatedRedirect === 'login' ? '/login' : '/register';
    return (
      <Link
        to={`${target}?next=${encodeURIComponent(returnTo)}`}
        className={classes}
        data-testid={testId}
        data-state="unauthenticated"
      >
        {label}
      </Link>
    );
  }

  async function handleClick(): Promise<void> {
    setLocalError(null);
    try {
      await createCheckout();
    } catch {
      // Error already captured in hook state (`error`) and below as
      // `localError` is only set for synchronous pre-flight failures.
    }
  }

  const message = localError ?? error;

  return (
    <span className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={classes}
        data-testid={testId}
        data-state="authenticated"
      >
        {isLoading ? 'Redirecting…' : label}
      </button>
      {message !== null && (
        <p
          role="alert"
          data-testid="subscribe-error"
          className="mt-2 text-xs text-red-600"
        >
          {message}
        </p>
      )}
    </span>
  );
}

export default SubscribeButton;
