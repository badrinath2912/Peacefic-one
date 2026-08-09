'use client';

import { NOTIFICATION_CATEGORY } from '@peacefic/shared';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import Link from 'next/link';

import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type Notification,
} from '@/api/notification-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { formatDateTime, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const CATEGORY_OPTIONS = NOTIFICATION_CATEGORY.map((value) => ({
  value,
  label: toTitleCase(value),
}));

const READ_OPTIONS = [
  { value: 'true', label: 'Unread only' },
  { value: '', label: 'All' },
];

/**
 * The notification inbox, shared by both portals.
 *
 * The two portal routes render this inside their own layout, so the shell,
 * sidebar and permissions all come from the portal the user is already in.
 *
 * Only the four filters the API supports are offered — `page`, `limit`,
 * `category` and `unread`. There is deliberately no priority, sort or search
 * control: the server pins the order to newest-first and ignores the rest, so
 * offering them would be a promise the backend does not keep.
 */
export function NotificationInbox() {
  const { user } = useAuth();
  const mayRead = can(user?.permissions, 'notification:read');

  const { params, setPage, setFilter, activeFilterCount } = useListParams({ limit: 20 });

  const notifications = useNotifications(params, mayRead);
  const unreadCount = useUnreadNotificationCount(mayRead);

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const archive = useArchiveNotification();

  const items = notifications.data?.items ?? [];
  const pagination = notifications.data?.pagination;
  const unread = unreadCount.data?.unread ?? 0;

  return (
    <RouteGuard permissions={['notification:read']}>
      <PageHeader
        title="Notifications"
        description="Everything your institution has sent you."
        actions={
          unread > 0 ? (
            <Button
              variant="outline"
              onClick={() => markAllRead.mutate()}
              isLoading={markAllRead.isPending}
              loadingText="Marking"
            >
              <CheckCheck aria-hidden />
              Mark all as read
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Select
            placeholder="All categories"
            value={(params.category as string) ?? ''}
            onChange={(event) => setFilter('category', event.target.value)}
            aria-label="Filter by category"
            options={CATEGORY_OPTIONS}
          />

          <Select
            value={(params.unread as string) ?? ''}
            onChange={(event) => setFilter('unread', event.target.value)}
            aria-label="Filter by read state"
            options={READ_OPTIONS}
          />
        </div>
      </Card>

      {notifications.isError ? (
        <ErrorState
          title="Could not load your notifications"
          message="Something went wrong while fetching them. Please try again."
          requestId={notifications.error.requestId}
          onRetry={() => void notifications.refetch()}
        />
      ) : notifications.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Bell}
              title={activeFilterCount > 0 ? 'Nothing matches those filters' : 'No notifications'}
              description={
                activeFilterCount > 0
                  ? 'Try clearing a filter.'
                  : 'Anything your institution sends you will appear here.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={() => markRead.mutate(notification.id)}
                onArchive={() => archive.mutate(notification.id)}
                isMarking={markRead.isPending && markRead.variables === notification.id}
                isArchiving={archive.isPending && archive.variables === notification.id}
              />
            ))}
          </ul>

          {pagination && pagination.totalPages > 1 ? (
            <nav
              className="mt-4 flex items-center justify-between gap-3"
              aria-label="Notification pages"
            >
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </RouteGuard>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
  onArchive,
  isMarking,
  isArchiving,
}: {
  notification: Notification;
  onMarkRead: () => void;
  onArchive: () => void;
  isMarking: boolean;
  isArchiving: boolean;
}) {
  const isUnread = notification.readAt === null;

  return (
    <li>
      <Card className={isUnread ? 'border-primary/40 p-4' : 'p-4'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* A dot rather than a word: the unread state is already carried
                  by the border and the bold title. */}
              {isUnread ? (
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              ) : null}

              <p className={isUnread ? 'font-semibold' : 'font-medium'}>{notification.title}</p>

              <Badge tone="neutral">{toTitleCase(notification.category)}</Badge>
              {isUnread ? <span className="sr-only">Unread</span> : null}
            </div>

            <p className="text-sm text-muted-foreground">{notification.message}</p>

            <p className="text-xs text-muted-foreground">
              {formatDateTime(notification.createdAt)}
            </p>

            {notification.actionUrl ? (
              <Link
                href={notification.actionUrl}
                className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {notification.actionLabel ?? 'Open'}
              </Link>
            ) : null}
          </div>

          <div className="flex shrink-0 gap-2">
            {isUnread ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkRead}
                isLoading={isMarking}
                aria-label={`Mark "${notification.title}" as read`}
              >
                <Check aria-hidden />
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={onArchive}
              isLoading={isArchiving}
              aria-label={`Dismiss "${notification.title}"`}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}
