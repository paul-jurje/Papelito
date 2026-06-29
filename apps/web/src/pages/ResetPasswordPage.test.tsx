import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ResetPasswordPage from './ResetPasswordPage';

// --- fetch mock helpers ---------------------------------------------------

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FetchRoute {
  match: (url: string, init?: RequestInit) => boolean;
  status: number;
  body: unknown;
}

const routes: FetchRoute[] = [];

function when(match: (url: string, init?: RequestInit) => boolean): {
  respond: (status: number, body: unknown) => void;
} {
  const route: FetchRoute = { match, status: 200, body: {} };
  routes.push(route);
  return {
    respond(status, body) {
      route.status = status;
      route.body = body;
    },
  };
}

function resetRoutes(): void {
  routes.length = 0;
}

beforeEach(() => {
  fetchMock.mockReset();
  resetRoutes();
  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routes) {
      if (route.match(url, init)) {
        return jsonResponse(route.status, route.body);
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- render helper --------------------------------------------------------

function renderResetPasswordAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/forgot-password"
            element={<div data-testid="forgot-password-page">Forgot Password</div>}
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// --- shared fixtures ------------------------------------------------------

function mockMeAsUnauthenticated(): void {
  when((url) => url.endsWith('/api/auth/me')).respond(401, { message: 'Unauthorized' });
}

function mockResetPasswordResponse(
  body: { success: boolean; message?: string },
  status = 200,
): void {
  when(
    (url, init) => url.endsWith('/api/auth/reset-password') && (init?.method ?? 'GET') === 'POST',
  ).respond(status, body);
}

// --- tests ----------------------------------------------------------------

describe('ResetPasswordPage', () => {
  it('shows an invalid link message when no token is present', async () => {
    mockMeAsUnauthenticated();
    renderResetPasswordAt('/reset-password');

    const invalidLink = await screen.findByTestId('invalid-link');
    expect(invalidLink).toHaveTextContent(/invalid or missing reset link/i);

    const link = screen.getByRole('link', { name: /reset link/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('renders the password form when a token is present', async () => {
    mockMeAsUnauthenticated();
    renderResetPasswordAt('/reset-password?token=abc');

    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows a validation error for short passwords and does not call the API', async () => {
    mockMeAsUnauthenticated();
    renderResetPasswordAt('/reset-password?token=abc');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    const passwordError = await screen.findByTestId('password-error');
    expect(passwordError).toHaveTextContent(/at least 8 characters/i);

    const resetCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.endsWith('/api/auth/reset-password');
    });
    expect(resetCalls).toHaveLength(0);
  });

  it('submits the new password to /api/auth/reset-password', async () => {
    mockMeAsUnauthenticated();
    let capturedInit: RequestInit | undefined;
    when((url, init) => {
      if (url.endsWith('/api/auth/reset-password') && (init?.method ?? 'GET') === 'POST') {
        capturedInit = init;
        return true;
      }
      return false;
    }).respond(200, { success: true });

    const user = userEvent.setup();
    renderResetPasswordAt('/reset-password?token=abc123');

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(capturedInit).toBeDefined();
    });

    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.credentials).toBe('include');
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        token: 'abc123',
        password: 'newpassword123',
      }),
    );
  });

  it('shows a success message and login link after a successful reset', async () => {
    mockMeAsUnauthenticated();
    mockResetPasswordResponse({ success: true }, 200);

    const user = userEvent.setup();
    renderResetPasswordAt('/reset-password?token=abc');

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    const successMessage = await screen.findByTestId('success-message');
    expect(successMessage).toHaveTextContent(/password updated successfully/i);

    const loginLink = within(successMessage.parentElement!).getByRole('link', { name: /log in/i });
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('displays the server error message when reset fails', async () => {
    mockMeAsUnauthenticated();
    mockResetPasswordResponse({ success: false, message: 'Invalid or expired token' }, 400);

    const user = userEvent.setup();
    renderResetPasswordAt('/reset-password?token=abc');

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    const error = await screen.findByTestId('form-error');
    expect(error).toHaveTextContent(/invalid or expired token/i);
  });
});
