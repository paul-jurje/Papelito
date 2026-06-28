import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';
import SubscribeButton from './SubscribeButton';

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: overrides.user ?? {
      id: 1,
      email: 'test@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    isLoading: overrides.isLoading ?? false,
    isAuthenticated: overrides.isAuthenticated ?? true,
    isSubscriber: overrides.isSubscriber ?? false,
    login: overrides.login ?? (vi.fn() as AuthContextValue['login']),
    register: overrides.register ?? (vi.fn() as AuthContextValue['register']),
    logout: overrides.logout ?? (vi.fn() as AuthContextValue['logout']),
    refresh: overrides.refresh ?? (vi.fn(async () => undefined) as AuthContextValue['refresh']),
  };
}

function renderButton(
  authValue: AuthContextValue,
  props: React.ComponentProps<typeof SubscribeButton> = {},
) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/']}>
        <SubscribeButton {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('SubscribeButton', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // jsdom doesn't allow reassigning `window.location`, so we replace it
    // with a stub that exposes the methods we touch.
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { assign: (url: string) => void; href: string } }).location = {
      assign: vi.fn(),
      href: '',
    };
  });

  afterEach(() => {
    (window as unknown as { location: Location }).location = originalLocation;
    vi.unstubAllGlobals();
  });

  it('renders nothing for active subscribers', () => {
    const auth = makeAuthValue({ isSubscriber: true });

    const { container } = renderButton(auth);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('subscribe-button')).not.toBeInTheDocument();
  });

  it('renders an unauthenticated link to /register?next=...', () => {
    const auth = makeAuthValue({ isAuthenticated: false });

    renderButton(auth, { returnTo: '/editor' });

    const link = screen.getByTestId('subscribe-button');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/register?next=%2Feditor');
    expect(link).toHaveAttribute('data-state', 'unauthenticated');
  });

  it('can be configured to link to /login instead of /register', () => {
    const auth = makeAuthValue({ isAuthenticated: false });

    renderButton(auth, { unauthenticatedRedirect: 'login', returnTo: '/editor' });

    const link = screen.getByTestId('subscribe-button');
    expect(link).toHaveAttribute('href', '/login?next=%2Feditor');
  });

  it('calls /api/billing/checkout-session and redirects to the returned URL', async () => {
    const user = userEvent.setup();
    const auth = makeAuthValue({ isAuthenticated: true });

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ url: 'https://checkout.stripe.com/c/cs_test_abc' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderButton(auth);

    const button = screen.getByTestId('subscribe-button');
    expect(button).toHaveAttribute('data-state', 'authenticated');

    await user.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toBe('/api/billing/checkout-session');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/cs_test_abc',
    );
  });

  it('shows an error message when the checkout API fails', async () => {
    const user = userEvent.setup();
    const auth = makeAuthValue({ isAuthenticated: true });

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Server is down' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    renderButton(auth);

    await user.click(screen.getByTestId('subscribe-button'));

    const error = await screen.findByTestId('subscribe-error');
    expect(error).toHaveTextContent(/server is down/i);
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
