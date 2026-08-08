'use client';

import type { AuthenticatedUser, LoginResponse } from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import {
  apiGet,
  apiPost,
  bootstrapSession,
  setAccessToken,
  setUnauthenticatedHandler,
} from '@/lib/api-client';
import { homeRouteFor } from '@/lib/permissions';
import { useAppDispatch, useAppSelector } from '@/store';
import { sessionResolved, signedOut, userUpdated } from '@/store/auth-slice';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (patch: Partial<AuthenticatedUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, isAuthenticated, isBootstrapping } = useAppSelector((state) => state.auth);
  const bootstrapped = useRef(false);

  /**
   * Restores the session from the httpOnly refresh cookie. This is why a page
   * reload does not sign the user out even though the access token only ever
   * lived in memory.
   */
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    let cancelled = false;

    void (async () => {
      const token = await bootstrapSession();

      if (!token) {
        if (!cancelled) dispatch(sessionResolved(null));
        return;
      }

      try {
        const data = await apiGet<{ user: AuthenticatedUser }>('/auth/session');
        if (!cancelled) dispatch(sessionResolved(data.user));
      } catch {
        setAccessToken(null);
        if (!cancelled) dispatch(sessionResolved(null));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // The api client cannot import the store without a cycle, so it calls back
  // here when a request proves the session is gone.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      dispatch(signedOut());
      router.replace('/login');
    });
  }, [dispatch, router]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const data = await apiPost<LoginResponse>('/auth/login', { email, password, rememberMe });
      setAccessToken(data.accessToken);
      dispatch(sessionResolved(data.user));
      return data.user;
    },
    [dispatch],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      // Local state is cleared even if the network call fails — the user asked
      // to sign out and must not be left looking signed in.
      setAccessToken(null);
      dispatch(signedOut());
      router.replace('/login');
    }
  }, [dispatch, router]);

  const refreshUser = useCallback(async () => {
    const data = await apiGet<{ user: AuthenticatedUser }>('/auth/session');
    dispatch(sessionResolved(data.user));
  }, [dispatch]);

  const updateUser = useCallback(
    (patch: Partial<AuthenticatedUser>) => {
      dispatch(userUpdated(patch));
    },
    [dispatch],
  );

  const value = useMemo(
    () => ({ user, isAuthenticated, isBootstrapping, login, logout, refreshUser, updateUser }),
    [user, isAuthenticated, isBootstrapping, login, logout, refreshUser, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

/** Convenience for the very common "can this user do X" check in a component. */
export function usePermissions(): string[] {
  return useAuth().user?.permissions ?? [];
}

export function useHomeRoute(): string {
  return homeRouteFor(useAuth().user?.roleKey);
}
