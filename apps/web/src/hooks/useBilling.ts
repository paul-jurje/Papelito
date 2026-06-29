import { useCallback, useState } from 'react';
import { ApiError, api } from '../lib/api';

/**
 * Response shape from `POST /api/billing/checkout-session`. The server returns
 * a Stripe-hosted Checkout URL that the browser is redirected to.
 */
export interface CheckoutSessionResponse {
  url: string;
}

export interface UseBillingResult {
  /**
   * Request a Stripe Checkout session from the server and navigate the
   * browser to the returned URL. Resolves with the URL on success so callers
   * can assert it in tests; throws `ApiError` on failure.
   */
  createCheckout: (planId: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Billing hook. Wraps the `POST /api/billing/checkout-session` endpoint and
 * performs the cross-origin redirect to Stripe Checkout on success.
 *
 * The redirect uses `window.location.assign` rather than `<a href>` /
 * `useNavigate()` because the destination is an absolute URL on
 * `checkout.stripe.com` (same tab, full page load).
 */
export function useBilling(): UseBillingResult {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const createCheckout = useCallback(
    async (planId: string): Promise<string> => {
      if (isLoading) {
        // Guard against double-clicks: a second call while one is in flight
        // would otherwise race to set state and trigger two redirects.
        throw new ApiError('Checkout is already being created.', 0);
      }
      setIsLoading(true);
      setError(null);
      try {
        const data = await api<CheckoutSessionResponse>('/api/billing/checkout-session', {
          method: 'POST',
          body: { planId },
        });
        if (typeof data.url !== 'string' || data.url.length === 0) {
          throw new ApiError('Server did not return a checkout URL.', 500);
        }
        // Same-tab redirect so the user comes back to /checkout-return in the
        // same browser session (preserves the express-session cookie).
        window.location.assign(data.url);
        return data.url;
      } catch (err: unknown) {
        const message =
          err instanceof ApiError ? err.message : 'Could not start checkout. Please try again.';
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  return { createCheckout, isLoading, error };
}

export default useBilling;
