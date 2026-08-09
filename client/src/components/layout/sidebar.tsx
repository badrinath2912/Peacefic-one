'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useUnreadNotificationCount } from '@/api/notification-queries';
import { BrandLogo } from '@/components/layout/brand-logo';
import { COLLEGE_NAV, STUDENT_NAV, type NavItem, type NavSection } from '@/config/navigation';
import { canAny } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useAppDispatch, useAppSelector } from '@/store';
import { setMobileNavOpen, toggleSidebar } from '@/store/ui-slice';

import { Button } from '../ui/button';

export type Portal = 'college' | 'student';

/**
 * Resolved here rather than passed in: the nav config contains icon components,
 * and a server component cannot hand functions to a client component.
 */
const PORTAL_NAV: Record<Portal, { sections: NavSection[]; home: string }> = {
  college: { sections: COLLEGE_NAV, home: '/college' },
  student: { sections: STUDENT_NAV, home: '/student' },
};

interface SidebarProps {
  portal: Portal;
}

export function Sidebar({ portal }: SidebarProps) {
  const { sections, home: homeHref } = PORTAL_NAV[portal];
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((state) => state.ui.mobileNavOpen);
  const { user } = useAuth();

  // Items the user cannot use are removed, not disabled — a greyed-out list of
  // things you may never do is noise.
  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permissions || canAny(user?.permissions, item.permissions),
      ),
    }))
    .filter((section) => section.items.length > 0);

  function isActive(href: string): boolean {
    if (href === homeHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Scrim closes the drawer on small screens. */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => dispatch(setMobileNavOpen(false))}
          aria-label="Close navigation"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface transition-[width,transform] duration-200',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Link href={homeHref} className="overflow-hidden">
            <BrandLogo size="sm" showWordmark={!collapsed} />
          </Link>
        </div>

        <nav
          className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4"
          aria-label="Main navigation"
        >
          {visible.map((section) => (
            <div key={section.label} className="space-y-1">
              {!collapsed ? (
                <p className="px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              ) : null}

              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => dispatch(setMobileNavOpen(false))}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-subtle text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      collapsed && 'justify-center',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}

                    {item.badgeKey ? (
                      <NavBadge badgeKey={item.badgeKey} collapsed={collapsed} />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-border p-2 lg:block">
          <Button
            variant="ghost"
            size="sm"
            block
            onClick={() => dispatch(toggleSidebar())}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(collapsed && 'px-0')}
          >
            <ChevronLeft
              className={cn('transition-transform', collapsed && 'rotate-180')}
              aria-hidden
            />
            {!collapsed ? 'Collapse' : null}
          </Button>
        </div>
      </aside>
    </>
  );
}

/**
 * Makes `badgeKey` real.
 *
 * Each key gets its own component so the data hook is called unconditionally
 * inside it — a `switch` around a hook would break the rules of hooks.
 *
 * `tickets` renders nothing on purpose: there is no ticket backend, so there is
 * no count to show. The key stays in the nav config for when that module lands.
 */
function NavBadge({ badgeKey, collapsed }: { badgeKey: NonNullable<NavItem['badgeKey']>; collapsed: boolean }) {
  if (badgeKey === 'notifications') return <NotificationNavBadge collapsed={collapsed} />;
  return null;
}

function NotificationNavBadge({ collapsed }: { collapsed: boolean }) {
  // Only mounted for a user who holds `notification:read`: the item is filtered
  // out above otherwise, so no request is made for someone who cannot read it.
  const count = useUnreadNotificationCount();
  const unread = count.data?.unread ?? 0;

  if (unread === 0) return null;

  const label = unread > 99 ? '99+' : String(unread);

  return (
    <span
      className={cn(
        'grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground',
        // Collapsed to an icon rail, the badge rides the top-right corner.
        collapsed ? 'absolute right-1 top-1' : 'ml-auto',
      )}
    >
      {label}
      <span className="sr-only"> unread</span>
    </span>
  );
}
