import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

const DEFAULT_NEXT = '/editor';
const MIN_PASSWORD_LENGTH = 8;

// Same regex the server uses (`apps/api/src/routes/auth.ts`). Kept here so
// we can give immediate feedback before the round-trip.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

interface ValidationResult {
  isValid: boolean;
  emailError: string | null;
  passwordError: string | null;
}

function validate(email: string, password: string): ValidationResult {
  const emailError = EMAIL_REGEX.test(email) ? null : 'Please enter a valid email address.';
  const passwordError =
    password.length >= MIN_PASSWORD_LENGTH
      ? null
      : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return {
    isValid: emailError === null && passwordError === null,
    emailError,
    passwordError,
  };
}

export function RegisterPage(): JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextTarget = resolveNext(searchParams.get('next'));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    const result = validate(email, password);
    setEmailError(result.emailError);
    setPasswordError(result.passwordError);

    if (!result.isValid) {
      setFormError(null);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await register(email, password);
      navigate(nextTarget, { replace: true });
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
            Create your account
          </h1>
          <p className="mb-8 text-sm text-slate-500 font-medium">
            Sign up to start writing. We&apos;ll keep your work safe.
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
              <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
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
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs font-semibold text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-bold">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default RegisterPage;
