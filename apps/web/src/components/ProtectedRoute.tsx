import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Route guard. Renders a loading spinner while the initial session check is
 * in flight, redirects unauthenticated users to `/login?next=<originalPath>`,
 * and renders the nested `<Outlet />` for authenticated users.
 */
export function ProtectedRoute(): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="auth-loading"
        className="flex min-h-screen items-center justify-center bg-white"
      >
        <div
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"
        />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve the intended destination so we can bounce the user back after
    // they successfully log in. Encode only the pathname + search; never
    // include the hash to avoid leaking fragments to the login URL.
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
