'use client';

import type { ReactNode } from 'react';

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
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
