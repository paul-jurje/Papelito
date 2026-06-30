import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import RegisterPage from './RegisterPage';

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

function renderRegisterAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/editor" element={<div data-testid="editor-page">Editor</div>} />
          <Route path="/subscribe" element={<div data-testid="subscribe-page">Subscribe</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// --- shared fixtures ------------------------------------------------------

const sampleUser = {
  id: 9,
  email: 'new@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function mockMeAsUnauthenticated(): void {
  when((url) => url.endsWith('/api/auth/me')).respond(401, { message: 'Unauthorized' });
}

// --- tests ----------------------------------------------------------------

describe('RegisterPage', () => {
  it('renders email and password fields with a submit button', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    // findBy* waits for the AuthProvider's /api/auth/me effect to settle,
    // keeping React state updates inside act().
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows a link to /login', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    const link = await screen.findByRole('link', { name: /log in/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('blocks submission with an invalid email and surfaces an error', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const emailError = await screen.findByTestId('email-error');
    expect(emailError).toHaveTextContent(/valid email/i);

    // No network call should have been made for /api/auth/register.
    const registerCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.endsWith('/api/auth/register');
    });
    expect(registerCalls).toHaveLength(0);
  });

  it('blocks submission with a password shorter than 8 characters', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'good@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const passwordError = await screen.findByTestId('password-error');
    expect(passwordError).toHaveTextContent(/at least 8 characters/i);

    const registerCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.endsWith('/api/auth/register');
    });
    expect(registerCalls).toHaveLength(0);
  });

  it('blocks submission when both fields are invalid and shows both errors', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'bad');
    await user.type(screen.getByLabelText(/password/i), '1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('email-error')).toBeInTheDocument();
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
  });

  it('clears a field-level error once the user edits the field', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register');

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'bad');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('email-error')).toBeInTheDocument();

    await user.clear(emailInput);
    await user.type(emailInput, 'good@example.com');

    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
  });

  it('registers the user and navigates to /editor by default', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/register') && (init?.method ?? 'GET') === 'POST',
    ).respond(201, {
      user: sampleUser,
    });

    const user = userEvent.setup();
    renderRegisterAt('/register');

    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByTestId('editor-page')).toBeInTheDocument();
    });
  });

  it('honors ?next=/editor and navigates there after registration', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/register') && (init?.method ?? 'GET') === 'POST',
    ).respond(201, {
      user: sampleUser,
    });

    const user = userEvent.setup();
    renderRegisterAt('/register?next=/editor');

    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByTestId('editor-page')).toBeInTheDocument();
    });
  });

  it('displays the server error message when registration fails (e.g., duplicate email)', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/register') && (init?.method ?? 'GET') === 'POST',
    ).respond(409, {
      message: 'Email already registered',
    });

    const user = userEvent.setup();
    renderRegisterAt('/register');

    await user.type(screen.getByLabelText(/email/i), 'dup@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const error = await screen.findByTestId('form-error');
    expect(error).toHaveTextContent(/already registered/i);

    // Stayed on register page.
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('sends JSON credentials with cookies on the register request', async () => {
    mockMeAsUnauthenticated();
    let capturedInit: RequestInit | undefined;
    when((url, init) => {
      if (url.endsWith('/api/auth/register') && (init?.method ?? 'GET') === 'POST') {
        capturedInit = init;
        return true;
      }
      return false;
    }).respond(201, { user: sampleUser });

    const user = userEvent.setup();
    renderRegisterAt('/register');

    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(capturedInit).toBeDefined();
    });

    expect(capturedInit?.credentials).toBe('include');
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        email: 'new@example.com',
        password: 'password123',
      }),
    );
  });

  it('renders a Google sign-in link that forwards the next parameter', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register?next=/foo');

    const link = await screen.findByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google?next=%2Ffoo');
  });

  it('sanitizes a protocol-relative next URL in the Google sign-in link', async () => {
    mockMeAsUnauthenticated();
    renderRegisterAt('/register?next=//evil.com');

    const link = await screen.findByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google?next=%2Feditor');
  });
});
