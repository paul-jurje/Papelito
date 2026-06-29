import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

export function ResetPasswordPage(): JSX.Element {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-50/20 via-white to-slate-50/50">
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 sm:p-10 shadow-xl shadow-slate-100/50">
            <h1 className="mb-2 text-2xl font-extrabold text-slate-900 tracking-tight">
              Reset password
            </h1>
            <div
              role="alert"
              data-testid="invalid-link"
              className="rounded-xl border border-red-100 bg-red-50/60 p-4"
            >
              <p className="text-sm font-semibold text-red-700">Invalid or missing reset link.</p>
            </div>
            <p className="mt-8 text-center text-xs font-semibold text-slate-400">
              Request a new{' '}
              <Link
                to="/forgot-password"
                className="text-indigo-600 hover:text-indigo-700 font-bold"
              >
                reset link
              </Link>
              .
            </p>
          </div>
        </main>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    const isPasswordValid = password.length >= 8;
    setPasswordError(isPasswordValid ? null : 'Password must be at least 8 characters.');

    if (!isPasswordValid) {
      setFormError(null);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setIsSuccess(true);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-50/20 via-white to-slate-50/50">
      <Header />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 sm:p-10 shadow-xl shadow-slate-100/50">
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            Reset password
          </h1>
          <p className="mb-8 text-sm text-slate-500 font-medium">Enter your new password below.</p>

          {!isSuccess && (
            <form noValidate onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  New Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError !== null) setPasswordError(null);
                  }}
                  aria-invalid={passwordError !== null}
                  aria-describedby={passwordError !== null ? 'password-error' : undefined}
                  className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-xs focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 transition-all"
                  placeholder="••••••••"
                />
                {passwordError !== null && (
                  <p
                    id="password-error"
                    data-testid="password-error"
                    className="mt-1.5 text-xs font-semibold text-red-600"
                  >
                    {passwordError}
                  </p>
                )}
              </div>

              {formError !== null && (
                <p
                  role="alert"
                  data-testid="form-error"
                  className="text-xs font-semibold text-red-600"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-all hover:scale-[1.01] mt-2"
              >
                {isSubmitting ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          )}

          {isSuccess && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p
                role="alert"
                data-testid="success-message"
                className="mb-2 text-sm font-semibold text-emerald-800"
              >
                Password updated successfully.
              </p>
              <Link to="/login" className="text-sm font-bold text-indigo-600 hover:text-indigo-700">
                Log in
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ResetPasswordPage;
