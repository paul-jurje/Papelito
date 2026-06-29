import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Header(): JSX.Element {
  const { isAuthenticated, isLoading, user, logout, isSubscriber } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Even if the server call fails, the local session is already cleared
      // in the auth context, so there's nothing for the user to recover here.
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-slate-100 bg-white/70 backdrop-blur-md transition-all"
      data-testid="header"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="group flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white shadow-sm transition-transform group-hover:scale-105"
          >
            P
          </span>
          <span className="transition-colors group-hover:text-indigo-600">Papelito</span>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden gap-8 text-sm font-semibold text-slate-500 md:flex"
        >
          <a href="#features" className="transition-colors hover:text-slate-900">
            Features
          </a>
          <a href="#pricing" className="transition-colors hover:text-slate-900">
            Pricing
          </a>
          <a href="#faq" className="transition-colors hover:text-slate-900">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {!isLoading && isAuthenticated && user !== null && (
            <>
              <div className="hidden items-center gap-2 rounded-full border border-slate-100 bg-slate-50/50 pl-2.5 pr-3 py-1 sm:flex max-w-[16rem]">
                <span
                  data-testid="user-email"
                  className="truncate text-xs font-semibold text-slate-650"
                  title={user.email}
                >
                  {user.email}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    isSubscriber
                      ? 'bg-emerald-50 text-emerald-705 border border-emerald-100'
                      : 'bg-slate-100 text-slate-500 border border-slate-200/40'
                  }`}
                >
                  {isSubscriber ? 'Pro' : 'Free'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                data-testid="logout-button"
                className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 transition-colors"
              >
                {isLoggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </>
          )}
          {!isLoading && !isAuthenticated && (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all hover:shadow-md"
              >
                Start writing
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
