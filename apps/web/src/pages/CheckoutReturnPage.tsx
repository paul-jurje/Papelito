import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';

type ReturnState = 'loading' | 'success' | 'cancelled';

/**
 * Stripe Checkout redirects the browser back to this page with either
 * `?success=true&session_id=...` after a completed payment or
 * `?success=false` (no `session_id`) when the user cancels.
 *
 * Success path:
 *   1. Refresh `/api/auth/me` so `isSubscriber` reflects the webhook update.
 *   2. Navigate to `/editor`.
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
          // The webhook may not have arrived yet, so give Stripe a moment
          // before polling. Two attempts are usually enough for local dev
          // with the Stripe CLI forwarding the event.
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await refresh();
            // We can't read `isSubscriber` directly here without re-running
            // the effect, so rely on the timing: refresh resolves after the
            // /me fetch returns.
            await new Promise((resolve) => setTimeout(resolve, 750));
          }
          setState('success');
          navigate('/editor', { replace: true });
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Could not finalize your subscription.');
          setState('success');
          // Still navigate — the user paid, they shouldn't be stuck here.
          navigate('/editor', { replace: true });
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
  }, [successFlag, refresh, navigate]);

  // We deliberately don't block the success view on the auth refetch above;
  // navigate('/editor') will trigger ProtectedRoute which redirects
  // unauthenticated users to /login. While in flight, show a calm status.

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
