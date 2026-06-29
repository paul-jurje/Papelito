import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';
import CheckoutReturnPage from './CheckoutReturnPage';

interface AuthStubOverrides {
  user?: AuthContextValue['user'];
  isAuthenticated?: boolean;
  isSubscriber?: boolean;
  isLoading?: boolean;
  refresh?: AuthContextValue['refresh'];
}

function makeAuthContextValue(overrides: AuthStubOverrides = {}): AuthContextValue {
  const refresh =
    overrides.refresh ??
    (vi.fn(async () => {
      /* default no-op */
    }) as AuthContextValue['refresh']);
  return {
    user: overrides.user ?? null,
    isLoading: overrides.isLoading ?? false,
    isAuthenticated: overrides.isAuthenticated ?? false,
    isSubscriber: overrides.isSubscriber ?? false,
    login: vi.fn(async () => {
      throw new Error('not implemented in stub');
    }) as AuthContextValue['login'],
    register: vi.fn(async () => {
      throw new Error('not implemented in stub');
    }) as AuthContextValue['register'],
    logout: vi.fn(async () => {
      /* default no-op */
    }) as AuthContextValue['logout'],
    requestPasswordReset: vi.fn(async () => ({
      resetUrl: null,
    })) as AuthContextValue['requestPasswordReset'],
    resetPassword: vi.fn(async () => ({ success: true })) as AuthContextValue['resetPassword'],
    refresh,
  };
}

function renderPage(
  authValue: AuthContextValue,
  initialEntry: string,
  editorContent: React.ReactNode = <div data-testid="editor-page-stub">editor</div>,
) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/checkout-return" element={<CheckoutReturnPage />} />
          <Route path="/editor" element={editorContent} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function sessionResponse(verified: boolean) {
  return new Response(JSON.stringify({ verified, status: 'active', sessionId: 'cs_test_123' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CheckoutReturnPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ user: { id: 1 }, isSubscriber: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a cancelled message when ?success=false', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    renderPage(auth, '/checkout-return?success=false');

    expect(await screen.findByTestId('checkout-cancelled')).toBeInTheDocument();
    expect(screen.getByText(/checkout cancelled/i)).toBeInTheDocument();
    expect(screen.getByTestId('checkout-back-to-pricing')).toHaveAttribute('href', '/#pricing');
    // No refresh should be triggered on the cancel path.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('treats a missing query string as cancelled', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      refresh,
    });

    renderPage(auth, '/checkout-return');

    expect(await screen.findByTestId('checkout-cancelled')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('calls the session verification endpoint and navigates to /editor on success', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/billing/session/cs_test_123') {
        return Promise.resolve(sessionResponse(true));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: 1 }, isSubscriber: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    renderPage(auth, '/checkout-return?success=true&session_id=cs_test_123');

    expect(screen.getByTestId('checkout-loading')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId('editor-page-stub')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/billing/session/cs_test_123', expect.any(Object));
    expect(refresh).toHaveBeenCalled();
  });

  it('polls the session endpoint until verified, then navigates', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    let calls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/billing/session/cs_test_123') {
        calls += 1;
        return Promise.resolve(sessionResponse(calls >= 3));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: 1 }, isSubscriber: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    vi.useFakeTimers();
    renderPage(auth, '/checkout-return?success=true&session_id=cs_test_123');

    // First verification attempt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);

    // Second attempt after poll interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(calls).toBe(2);

    // Third attempt verifies; refresh + navigation follow
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(calls).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('editor-page-stub')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('shows a pending screen when the session never verifies', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/billing/session/cs_test_123') {
        return Promise.resolve(sessionResponse(false));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: 1 }, isSubscriber: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    vi.useFakeTimers();
    renderPage(auth, '/checkout-return?success=true&session_id=cs_test_123');

    // 10 attempts * 1.5s = ~15s total polling window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByTestId('checkout-pending')).toBeInTheDocument();
    expect(screen.getByText(/still waiting for stripe/i)).toBeInTheDocument();
    expect(screen.getByTestId('checkout-reload')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('falls back to auth refresh polling when the session endpoint fails', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/billing/session/cs_test_123') {
        return Promise.reject(new Error('session lookup failed'));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: 1 }, isSubscriber: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    vi.useFakeTimers();
    renderPage(auth, '/checkout-return?success=true&session_id=cs_test_123');

    // The session endpoint rejects immediately; fallback refresh loop runs
    // 3 times with 750ms delays.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('editor-page-stub')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
