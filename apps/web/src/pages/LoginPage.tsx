import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

const DEFAULT_NEXT = '/editor';

function resolveNext(value: string | null): string {
  if (!value) return DEFAULT_NEXT;
  const trimmed = value.trim();
  if (trimmed.length === 0) return DEFAULT_NEXT;
  // Reject protocol-relative URLs (`//evil.com/x`) to prevent open redirects.
  if (trimmed.startsWith('//')) return DEFAULT_NEXT;
  // Normalize bare tokens like `subscribe` into `/subscribe`; accept full
  // same-origin paths like `/subscribe` or `/editor?foo=bar` as-is.
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextTarget = resolveNext(searchParams.get('next'));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(nextTarget, { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-50/20 via-white to-slate-50/50">
      <Header />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 sm:p-10 shadow-xl shadow-slate-100/50">
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900 tracking-tight">Log in</h1>
          <p className="mb-8 text-sm text-slate-500 font-medium">
            Welcome back. Enter your details to continue writing.
          </p>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-xs focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-xs focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error !== null && (
              <p
                role="alert"
                data-testid="form-error"
                className="text-xs font-semibold text-red-600"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-all hover:scale-[1.01] mt-2"
            >
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs font-semibold text-slate-400">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-bold">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
