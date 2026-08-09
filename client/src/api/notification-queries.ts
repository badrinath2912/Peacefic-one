'use client';

import type { NotificationCategory, NotificationPriority } from '@peacefic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiDelete, apiGet, apiGetPaginated, apiPatch, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

export const notificationKeys = {
  all: () => ['notifications'] as const,
  list: (params?: Record<string, unknown>) => ['notifications', 'list', params ?? {}] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};

/** One notification, as `GET /notifications` returns it. */
export interface Notification {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Every mutation answers with the caller's remaining unread count. */
interface UnreadResult {
  unread: number;
}

/**
 * The caller's own inbox.
 *
 * `params` carries only `page`, `limit`, `category` and `unread` — the four the
 * route accepts. It declares no `priority`, `sort` or `search`, because
 * `findForUser` cannot honour them and would drop them silently.
 */
export function useNotifications(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: notificationKeys.list(params),
    queryFn: () => apiGetPaginated<Notification>(`/notifications${buildQuery(params)}`),
  });
}

/** Drives the topbar badge. The user is resolved from the token. */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    enabled,
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiGet<UnreadResult>('/notifications/unread-count'),
  });
}

/**
 * Applies the count the server just returned, then refreshes the list.
 *
 * Writing the count through rather than only invalidating keeps the badge from
 * flickering to a stale number while the refetch is in flight.
 */
function useNotificationMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<UnreadResult>,
  successMessage?: (result: UnreadResult) => string | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      queryClient.setQueryData(notificationKeys.unreadCount(), { unread: result.unread });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });

      const message = successMessage?.(result);
      if (message) toast.success(message);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useMarkNotificationRead() {
  return useNotificationMutation<string>((id) =>
    apiPatch<UnreadResult>(`/notifications/${id}/read`),
  );
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPatch<{ updated: number; unread: number }>('/notifications/read-all'),

    onSuccess: (result) => {
      queryClient.setQueryData(notificationKeys.unreadCount(), { unread: result.unread });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });

      toast.success(
        result.updated === 0
          ? 'Nothing was unread.'
          : `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`,
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/** Archiving is the server's idea of dismissal — the row is kept, not deleted. */
export function useArchiveNotification() {
  return useNotificationMutation<string>(
    (id) => apiDelete<UnreadResult>(`/notifications/${id}`),
    () => 'Notification dismissed.',
  );
}
