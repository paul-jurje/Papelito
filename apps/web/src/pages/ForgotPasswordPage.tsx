import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage(): JSX.Element {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    const isEmailValid = EMAIL_REGEX.test(email);
    setEmailError(isEmailValid ? null : 'Please enter a valid email address.');

    if (!isEmailValid) {
      setFormError(null);
      return;
    }

    setFormError(null);
    setResetUrl(null);
    setSubmitted(false);
    setCopyLabel('Copy');
    setIsSubmitting(true);
    try {
      const response = await requestPasswordReset(email);
      setSubmitted(true);
      setResetUrl(response.resetUrl);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy(): Promise<void> {
    if (resetUrl === null) return;
    try {
      await navigator.clipboard.writeText(resetUrl);
      setCopyLabel('Copied!');
      window.setTimeout(() => setCopyLabel('Copy'), 2000);
    } catch {
      setCopyLabel('Copy failed');
      window.setTimeout(() => setCopyLabel('Copy'), 2000);
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
          <p className="mb-8 text-sm text-slate-500 font-medium">
            Enter your email and we&apos;ll send you a reset link.
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError !== null) setEmailError(null);
                }}
                aria-invalid={emailError !== null}
                aria-describedby={emailError !== null ? 'email-error' : undefined}
                className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-xs focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 transition-all"
                placeholder="you@example.com"
              />
              {emailError !== null && (
                <p
                  id="email-error"
                  data-testid="email-error"
                  className="mt-1.5 text-xs font-semibold text-red-600"
                >
                  {emailError}
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

            {!submitted && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-all hover:scale-[1.01] mt-2"
              >
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>
            )}
          </form>

          {submitted && (
            <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-emerald-800">
                If an account exists, a reset link was generated.
              </p>
              {resetUrl !== null && (
                <div className="flex items-center gap-2">
                  <input
                    id="reset-url"
                    type="text"
                    readOnly
                    value={resetUrl}
                    className="block min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors"
                  >
                    {copyLabel}
                  </button>
                </div>
              )}
              {resetUrl !== null && (
                <p className="mt-2 text-[11px] font-medium text-emerald-700/80">
                  This link is single-use and expires in 15 minutes.
                </p>
              )}
            </div>
          )}

          {!submitted && !isSubmitting && (
            <p className="mt-8 text-center text-xs font-semibold text-slate-400">
              Remember your password?{' '}
              <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-bold">
                Log in
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default ForgotPasswordPage;
