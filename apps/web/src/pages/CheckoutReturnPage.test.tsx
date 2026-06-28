import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function makeAuthContextValue(
  overrides: AuthStubOverrides = {},
): AuthContextValue {
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

    expect(
      await screen.findByTestId('checkout-cancelled'),
    ).toBeInTheDocument();
    expect(screen.getByText(/checkout cancelled/i)).toBeInTheDocument();
    expect(screen.getByTestId('checkout-back-to-pricing')).toHaveAttribute(
      'href',
      '/#pricing',
    );
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

    expect(
      await screen.findByTestId('checkout-cancelled'),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refetches auth state and navigates to /editor on success', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      isSubscriber: false,
      refresh,
    });

    renderPage(auth, '/checkout-return?success=true&session_id=cs_test_123');

    // First, the loading view is rendered while we wait for the webhook.
    expect(screen.getByTestId('checkout-loading')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(refresh).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    // After the success path completes, the editor stub renders.
    await waitFor(
      () => {
        expect(screen.getByTestId('editor-page-stub')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('still navigates to /editor if the refresh call rejects', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('network down');
    });
    const auth = makeAuthContextValue({
      isAuthenticated: true,
      refresh,
    });

    renderPage(auth, '/checkout-return?success=true');

    // Even if refresh() throws, the page must still redirect the user to
    // /editor so they aren't stuck on a confirmation screen.
    await waitFor(
      () => {
        expect(screen.getByTestId('editor-page-stub')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});
