import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api } from '../lib/api';

/**
 * Shape of the user returned by the API. The server strips the password hash
 * (see `toSafeUser` in `apps/api/src/types/express.ts`). Timestamps are
 * serialized as ISO 8601 strings by `JSON.stringify`.
 */
export interface AuthUser {
  id: number;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when the server reports the session user has an active subscription
   * (see `apps/api/src/routes/auth.ts` `/me`). Defaults to `false` until the
   * initial `/api/auth/me` call resolves.
   */
  isSubscriber: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /**
   * Re-fetch `/api/auth/me` and reconcile `user` + `isSubscriber` with the
   * server. Used after Stripe Checkout completes so the UI picks up the
   * webhook-driven subscription change without a full reload.
   */
  refresh: () => Promise<void>;
}

interface AuthResponse {
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
  isSubscriber?: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on mount by calling /api/auth/me.
  useEffect(() => {
    let cancelled = false;

    api<MeResponse>('/api/auth/me')
      .then((data) => {
        if (!cancelled) {
          setUser(data.user);
          setIsSubscriber(data.isSubscriber === true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          setIsSubscriber(false);
          return;
        }
        // Unexpected error (network, 5xx, etc). Treat as unauthenticated but
        // surface to the console so devs can see it.
        // eslint-disable-next-line no-console
        console.error('Failed to restore auth session', err);
        setUser(null);
        setIsSubscriber(false);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const data = await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setUser(data.user);
      // Re-fetch /me to pick up an existing subscription, since the login
      // response itself does not include it.
      try {
        const me = await api<MeResponse>('/api/auth/me');
        setIsSubscriber(me.isSubscriber === true);
      } catch {
        setIsSubscriber(false);
      }
      return data.user;
    },
    [],
  );

  const register = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const data = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: { email, password },
      });
      setUser(data.user);
      setIsSubscriber(false);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setIsSubscriber(false);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await api<MeResponse>('/api/auth/me');
      setUser(data.user);
      setIsSubscriber(data.isSubscriber === true);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setIsSubscriber(false);
        return;
      }
      // Network / 5xx: leave existing state untouched so the user isn't
      // logged out by a transient failure.
      // eslint-disable-next-line no-console
      console.error('Failed to refresh auth session', err);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      isSubscriber,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, isSubscriber, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
