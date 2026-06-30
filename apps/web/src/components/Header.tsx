import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Header(): JSX.Element {
  const { isAuthenticated, isLoading, user, logout, isSubscriber } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      setIsDropdownOpen(false);
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
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                data-testid="user-menu-trigger"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 pl-3 pr-2.5 py-1.5 hover:bg-slate-100/70 hover:border-slate-300 transition-all select-none max-w-[12rem] sm:max-w-[16rem]"
              >
                <span
                  data-testid="user-email"
                  className="truncate text-xs font-semibold text-slate-700"
                  title={user.email}
                >
                  {user.email}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    isSubscriber
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-slate-100 text-slate-550 border border-slate-200/40'
                  }`}
                >
                  {isSubscriber ? 'Pro' : 'Free'}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </button>

              {isDropdownOpen && (
                <div
                  data-testid="user-menu-dropdown"
                  className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-slate-150 bg-white p-1.5 shadow-lg ring-1 ring-black/5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <div className="px-3 py-2 text-left">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider select-none">
                      Signed in as
                    </p>
                    <p
                      className="truncate text-xs font-semibold text-slate-700 mt-0.5"
                      title={user.email}
                    >
                      {user.email}
                    </p>
                  </div>

                  <div className="h-px bg-slate-100 my-1" />

                  <div className="space-y-0.5">
                    <Link
                      to="/editor"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        className="h-4 w-4 text-slate-400"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                      Open Editor
                    </Link>

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-750 transition-colors disabled:opacity-60"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        className="h-4 w-4 text-red-400"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                        />
                      </svg>
                      {isLoggingOut ? 'Logging out…' : 'Log out'}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
