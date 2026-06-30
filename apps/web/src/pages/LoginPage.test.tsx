import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from './LoginPage';

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

function renderLoginAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<div data-testid="register-page">Register</div>} />
          <Route path="/editor" element={<div data-testid="editor-page">Editor</div>} />
          <Route path="/foo" element={<div data-testid="foo-page">Foo</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// --- shared fixtures ------------------------------------------------------

const sampleUser = {
  id: 7,
  email: 'jane@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function mockMeAsUnauthenticated(): void {
  when((url) => url.endsWith('/api/auth/me')).respond(401, { message: 'Unauthorized' });
}

// --- tests ----------------------------------------------------------------

describe('LoginPage', () => {
  it('renders email and password fields with a submit button', async () => {
    mockMeAsUnauthenticated();
    renderLoginAt('/login');

    // findBy* waits for the AuthProvider's /api/auth/me effect to settle,
    // keeping React state updates inside act().
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^log in$/i })).toBeInTheDocument();
  });

  it('shows a link to /register', async () => {
    mockMeAsUnauthenticated();
    renderLoginAt('/login');

    const link = await screen.findByRole('link', { name: /sign up/i });
    expect(link).toHaveAttribute('href', '/register');
  });

  it('logs the user in and navigates to /editor by default', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/login') && (init?.method ?? 'GET') === 'POST',
    ).respond(200, {
      user: sampleUser,
    });

    const user = userEvent.setup();
    renderLoginAt('/login');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('editor-page')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('honors ?next=/foo and navigates there after login', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/login') && (init?.method ?? 'GET') === 'POST',
    ).respond(200, {
      user: sampleUser,
    });

    const user = userEvent.setup();
    renderLoginAt('/login?next=/foo');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('foo-page')).toBeInTheDocument();
    });
  });

  it('ignores a non-path next value and falls back to /editor', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/login') && (init?.method ?? 'GET') === 'POST',
    ).respond(200, {
      user: sampleUser,
    });

    const user = userEvent.setup();
    // `//evil.com` starts with `//` which would be protocol-relative — reject.
    renderLoginAt('/login?next=//evil.com');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('editor-page')).toBeInTheDocument();
    });
  });

  it('displays the server error message when login fails', async () => {
    mockMeAsUnauthenticated();
    when(
      (url, init) => url.endsWith('/api/auth/login') && (init?.method ?? 'GET') === 'POST',
    ).respond(401, {
      message: 'Invalid email or password',
    });

    const user = userEvent.setup();
    renderLoginAt('/login');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    const error = await screen.findByTestId('form-error');
    expect(error).toHaveTextContent('Invalid email or password');

    // Stayed on login page.
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('sends JSON credentials with cookies on the login request', async () => {
    mockMeAsUnauthenticated();
    let capturedUrl: string | null = null;
    let capturedInit: RequestInit | undefined;
    when((url, init) => {
      if (url.endsWith('/api/auth/login') && (init?.method ?? 'GET') === 'POST') {
        capturedUrl = url;
        capturedInit = init;
        return true;
      }
      return false;
    }).respond(200, { user: sampleUser });

    const user = userEvent.setup();
    renderLoginAt('/login');

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(capturedUrl).not.toBeNull();
    });

    expect(capturedUrl).toBe('/api/auth/login');
    expect(capturedInit?.credentials).toBe('include');
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        email: 'jane@example.com',
        password: 'password123',
      }),
    );
  });

  it('renders a Google sign-in link that forwards the next parameter', async () => {
    mockMeAsUnauthenticated();
    renderLoginAt('/login?next=/foo');

    const link = await screen.findByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google?next=%2Ffoo');
  });

  it('sanitizes a protocol-relative next URL in the Google sign-in link', async () => {
    mockMeAsUnauthenticated();
    renderLoginAt('/login?next=//evil.com');

    const link = await screen.findByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google?next=%2Feditor');
  });
});
