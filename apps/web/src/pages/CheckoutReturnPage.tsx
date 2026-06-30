import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';

interface VerifySessionResponse {
  verified: boolean;
  status?: string;
  sessionId: string;
}

type ReturnState = 'loading' | 'success' | 'pending' | 'cancelled';

/**
 * Stripe Checkout redirects the browser back to this page with either
 * `?success=true&session_id=...` after a completed payment or
 * `?success=false` (no `session_id`) when the user cancels.
 *
 * Success path:
 *   1. Call /api/billing/session/:sessionId to verify payment directly with
 *      Stripe and activate the local subscription immediately.
 *   2. If verified, refresh auth state and navigate to `/editor`.
 *   3. If not verified yet, poll for up to ~15 seconds.
 *   4. If still not verified, show a "still waiting" message instead of
 *      redirecting to a route that may return 403.
 *
 * Cancel path:
 *   Stay on the page and show a friendly message with a link back to the
 *   pricing section so the user can retry.
 */
export function CheckoutReturnPage(): ReactNode {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [state, setState] = useState<ReturnState>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasRunRef = useRef<boolean>(false);

  const successFlag = searchParams.get('success');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    if (successFlag === 'true') {
      setState('loading');
      (async () => {
        try {
          if (!sessionId) {
            throw new Error('Missing session id');
          }

          const verifyUrl = `/api/billing/session/${encodeURIComponent(sessionId)}`;

          // Poll the session verification endpoint. Stripe usually confirms
          // payment within a second or two, but we give it a generous window
          // before asking the user to refresh manually.
          const maxAttempts = 10;
          const pollIntervalMs = 1_500;

          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const result = await api<VerifySessionResponse>(verifyUrl);

            if (result.verified) {
              await refresh();
              setState('success');
              navigate('/editor', { replace: true });
              return;
            }

            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            }
          }

          // Still not confirmed after max attempts. Keep the user on a
          // friendly pending screen instead of redirecting to a 403.
          setState('pending');
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Could not finalize your subscription.');
          // Fall back to the legacy auth-refresh loop. The webhook may still
          // arrive and update /api/auth/me, so we give it a few attempts
          // before giving up.
          try {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              await refresh();
              await new Promise((resolve) => setTimeout(resolve, 750));
            }
            setState('success');
            navigate('/editor', { replace: true });
          } catch {
            setState('pending');
          }
        }
      })();
      return;
    }

    if (successFlag === 'false') {
      setState('cancelled');
      return;
    }

    // Missing or unrecognised query string: treat as a cancel so the user
    // gets a sensible landing rather than a blank loading screen.
    setState('cancelled');
  }, [successFlag, sessionId, refresh, navigate]);

  if (state === 'cancelled') {
    return (
      <div
        data-testid="checkout-return"
        data-state="cancelled"
        className="flex min-h-screen flex-col bg-white"
      >
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div
            data-testid="checkout-cancelled"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <h1 className="text-2xl font-semibold text-slate-900">Checkout cancelled</h1>
            <p className="mt-3 text-sm text-slate-600">
              No worries — you weren&apos;t charged. You can come back any time and subscribe when
              you&apos;re ready.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                to="/#pricing"
                data-testid="checkout-back-to-pricing"
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                Back to pricing
              </Link>
              <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Go to homepage
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div
        data-testid="checkout-return"
        data-state="pending"
        className="flex min-h-screen flex-col bg-white"
      >
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div
            data-testid="checkout-pending"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <h1 className="text-2xl font-semibold text-slate-900">Payment pending confirmation</h1>
            <p className="mt-3 text-sm text-slate-600">
              We&apos;re still waiting for Stripe to confirm your payment. Refresh this page in a
              moment or check your email for a receipt.
            </p>
            {sessionId !== null && (
              <p className="mt-4 break-all text-xs text-slate-400">Session: {sessionId}</p>
            )}
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                data-testid="checkout-reload"
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                Refresh status
              </button>
              <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Go to homepage
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // state === 'loading' || state === 'success' (briefly before navigation)
  return (
    <div
      data-testid="checkout-return"
      data-state={state}
      className="flex min-h-screen flex-col bg-white"
    >
      <Header />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div
          data-testid="checkout-loading"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
          />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Finalizing your subscription…
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {state === 'success'
              ? 'Subscription confirmed. Redirecting to your editor.'
              : 'Hang tight while we confirm your payment with Stripe.'}
          </p>
          {sessionId !== null && (
            <p className="mt-4 break-all text-xs text-slate-400">Session: {sessionId}</p>
          )}
          {error !== null && (
            <p role="alert" data-testid="checkout-error" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}
          {!isAuthLoading && !isAuthenticated && state === 'loading' && (
            <p className="mt-4 text-sm text-slate-500">
              You may need to{' '}
              <Link to="/login" className="underline">
                log in
              </Link>{' '}
              to continue.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default CheckoutReturnPage;
