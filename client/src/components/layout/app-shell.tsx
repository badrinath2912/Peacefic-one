'use client';

import type { ReactNode } from 'react';

import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store';

import { Sidebar, type Portal } from './sidebar';
import { Topbar } from './topbar';

/**
 * Takes a portal name rather than a nav array.
 *
 * The layouts that render this are server components, and the nav config holds
 * icon *components* — functions cannot cross the server/client boundary, so
 * passing the config as a prop fails the build. A plain string crosses fine and
 * the client-side sidebar resolves it to the real config.
 */
interface AppShellProps {
  children: ReactNode;
  portal: Portal;
}

/**
 * `profile` is null for the college portal because no college profile page
 * exists. The menu item is hidden rather than pointed at a route that would
 * 404 — which is what it did before, via `${settings}/profile`.
 */
const PORTAL_ROUTES: Record<
  Portal,
  { home: string; settings: string; profile: string | null; notifications: string }
> = {
  college: {
    home: '/college',
    settings: '/college/settings',
    profile: null,
    notifications: '/college/notifications',
  },
  student: {
    home: '/student',
    settings: '/student/settings',
    profile: '/student/profile',
    notifications: '/student/notifications',
  },
};

export function AppShell({ children, portal }: AppShellProps) {
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const routes = PORTAL_ROUTES[portal];

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar portal={portal} />

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <Topbar
          settingsHref={routes.settings}
          profileHref={routes.profile}
          notificationsHref={routes.notifications}
        />
        <main id="main" className="p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * Small contextual label above the title — the portal or area the page sits
   * in, such as "College" or "Student". Optional: 92 pages already call this
   * component with title/description/actions only, and must keep rendering
   * unchanged.
   */
  eyebrow?: string;
  /**
   * Rendered through the existing `Breadcrumbs` primitive rather than a second
   * trail implementation. Only supply these where hierarchy genuinely helps —
   * a top-level page does not need a one-item breadcrumb.
   */
  breadcrumbs?: Crumb[];
}

/**
 * The heading block every page opens with.
 *
 * Deliberately not wrapped in a `Card`: the header is the page's opening
 * statement, and boxing it flattens the hierarchy between it and the content
 * that follows. Separation comes from whitespace and a hairline rule instead.
 *
 * All four optional props are additive — `eyebrow` and `breadcrumbs` render
 * nothing when absent, so existing callers are untouched.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <div className="mb-6 border-b border-border pb-5">
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}

      {/* `items-start` with wrapping, so a long title and its actions stack on
          narrow screens rather than the actions being pushed off-screen. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? <p className="type-overline">{eyebrow}</p> : null}

          {/* The semantic scale rather than ad-hoc sizes: every page title in
              the product moves together from here, and later phases have one
              place to change rather than a hundred. */}
          <h1 className="type-h1">{title}</h1>

          {description ? (
            <p className="type-body-sm max-w-2xl text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
