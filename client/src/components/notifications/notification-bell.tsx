'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';

import { useUnreadNotificationCount } from '@/api/notification-queries';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

/**
 * The unread badge in the topbar.
 *
 * Gated on `notification:read` at the call site rather than relying on the
 * server to refuse: a user without it never issues the request. Renders nothing
 * at all in that case, since a bell that cannot be opened is just clutter.
 */
export function NotificationBell({ inboxHref }: { inboxHref: string }) {
  const { user } = useAuth();
  const mayRead = can(user?.permissions, 'notification:read');

  const count = useUnreadNotificationCount(mayRead);

  if (!mayRead) return null;

  const unread = count.data?.unread ?? 0;
  const hasUnread = unread > 0;
  // Three digits is as wide as the badge can stay a circle.
  const label = unread > 99 ? '99+' : String(unread);

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link
        href={inboxHref}
        aria-label={
          hasUnread
            ? `Notifications, ${unread} unread`
            : 'Notifications, none unread'
        }
      >
        <Bell />

        {hasUnread ? (
          <span
            // aria-hidden: the count is already in the link's accessible name,
            // so announcing it twice would be noise.
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground"
          >
            {label}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
