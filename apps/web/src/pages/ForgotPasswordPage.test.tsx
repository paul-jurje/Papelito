import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ForgotPasswordPage from './ForgotPasswordPage';

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

function renderForgotPasswordAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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

function mockForgotPasswordResponse(
  body: { resetUrl: string | null; message?: string },
  status = 200,
): void {
  when(
    (url, init) => url.endsWith('/api/auth/forgot-password') && (init?.method ?? 'GET') === 'POST',
  ).respond(status, body);
}

// --- tests ----------------------------------------------------------------

describe('ForgotPasswordPage', () => {
  it('renders email field with a submit button', async () => {
    mockMeAsUnauthenticated();
    renderForgotPasswordAt('/forgot-password');

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows a link to /login', async () => {
    mockMeAsUnauthenticated();
    renderForgotPasswordAt('/forgot-password');

    const link = await screen.findByRole('link', { name: /log in/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('blocks submission with an invalid email and surfaces an error', async () => {
    mockMeAsUnauthenticated();
    renderForgotPasswordAt('/forgot-password');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const emailError = await screen.findByTestId('email-error');
    expect(emailError).toHaveTextContent(/valid email/i);

    const forgotCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.endsWith('/api/auth/forgot-password');
    });
    expect(forgotCalls).toHaveLength(0);
  });

  it('clears the email error once the user edits the field', async () => {
    mockMeAsUnauthenticated();
    renderForgotPasswordAt('/forgot-password');

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'bad');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByTestId('email-error')).toBeInTheDocument();

    await user.clear(emailInput);
    await user.type(emailInput, 'good@example.com');

    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
  });

  it('displays the server error message when the request fails', async () => {
    mockMeAsUnauthenticated();
    mockForgotPasswordResponse({ resetUrl: null, message: 'Something went wrong' }, 400);

    const user = userEvent.setup();
    renderForgotPasswordAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const error = await screen.findByTestId('form-error');
    expect(error).toHaveTextContent(/something went wrong/i);
  });

  it('shows the reset URL, copy button, and expiration note when the response includes a URL', async () => {
    mockMeAsUnauthenticated();
    mockForgotPasswordResponse({ resetUrl: 'http://localhost/reset?token=abc123' }, 200);

    const user = userEvent.setup();
    renderForgotPasswordAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const resetInput = await screen.findByDisplayValue('http://localhost/reset?token=abc123');
    expect(resetInput).toHaveAttribute('readonly');

    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByText(/single-use/i)).toBeInTheDocument();
    expect(screen.getByText(/15 minutes/i)).toBeInTheDocument();
  });

  it('shows a neutral confirmation when no reset URL is returned', async () => {
    mockMeAsUnauthenticated();
    mockForgotPasswordResponse({ resetUrl: null }, 200);

    const user = userEvent.setup();
    renderForgotPasswordAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument();
  });

  it('copies the reset URL to the clipboard when the copy button is clicked', async () => {
    mockMeAsUnauthenticated();
    mockForgotPasswordResponse({ resetUrl: 'http://localhost/reset?token=abc123' }, 200);

    const user = userEvent.setup();
    renderForgotPasswordAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const copyButton = await screen.findByRole('button', { name: /copy/i });
    await user.click(copyButton);

    expect(copyButton).toHaveTextContent(/copied!/i);
  });

  it('sends JSON email with cookies on the forgot-password request', async () => {
    mockMeAsUnauthenticated();
    let capturedInit: RequestInit | undefined;
    when((url, init) => {
      if (url.endsWith('/api/auth/forgot-password') && (init?.method ?? 'GET') === 'POST') {
        capturedInit = init;
        return true;
      }
      return false;
    }).respond(200, { resetUrl: null });

    const user = userEvent.setup();
    renderForgotPasswordAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(capturedInit).toBeDefined();
    });

    expect(capturedInit?.credentials).toBe('include');
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        email: 'jane@example.com',
      }),
    );
  });
});
