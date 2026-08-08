'use client';

import type { ChangePasswordInput } from '@peacefic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiDelete, apiGet, apiPatch, apiPost, type ApiError } from '@/lib/api-client';

export const authKeys = {
  sessions: () => ['auth', 'sessions'] as const,
};

/**
 * One active session, exactly as `AuthService.listSessions` returns it.
 *
 * The user agent string is deliberately absent from the server's projection —
 * `deviceLabel` is the readable form of it — so there is nothing here to
 * display beyond these fields.
 */
export interface AuthSession {
  id: string;
  deviceLabel: string;
  ip: string;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  /** Resolved server-side from the request's own session id. */
  isCurrent: boolean;
}

/**
 * The caller's own sessions. The server reads the user from the token, so there
 * is no id to send and no way to ask for anyone else's.
 */
export function useAuthSessions(enabled = true) {
  return useQuery({
    enabled,
    queryKey: authKeys.sessions(),
    queryFn: () => apiGet<AuthSession[]>('/auth/sessions'),
  });
}

/**
 * Changes the caller's password.
 *
 * The server keeps this browser signed in and revokes every other session, so
 * the session list is refetched rather than the user being redirected.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ChangePasswordInput) =>
      apiPatch<{ message: string }>('/auth/change-password', payload),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
      toast.success('Password changed. Your other devices have been signed out.');
    },

    // Field-level messages are mapped onto the form by `useApiForm`; this is
    // the fallback for anything without a field path.
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/** Signs out one other device. The server refuses an id that is not the caller's. */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => apiDelete<{ message: string }>(`/auth/sessions/${sessionId}`),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
      toast.success('That device has been signed out.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/**
 * Signs out every session, **including this one**.
 *
 * `AuthService.logoutAll` calls `revokeAllForUser` with no exception, and the
 * controller clears the refresh cookie — so unlike a password change, this ends
 * the current session too. `onSignedOut` hands control back to the app's normal
 * sign-out flow.
 */
export function useSignOutEverywhere(onSignedOut: () => void) {
  return useMutation({
    mutationFn: () => apiPost<{ message: string; revoked: number }>('/auth/logout-all'),

    onSuccess: () => {
      toast.success('Signed out on every device.');
      onSignedOut();
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}
