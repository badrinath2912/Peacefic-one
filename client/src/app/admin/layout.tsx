import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/auth/route-guard';
import { ROLE_KEYS } from '@peacefic/shared';

/**
 * The platform console.
 *
 * Deliberately **not** wrapped in `AppShell`. That component is built around
 * the `college` and `student` portals — it reads a sidebar route map keyed by
 * portal, and a platform administrator belongs to neither: they have no college,
 * so every tenant-scoped link in those menus would be meaningless or broken.
 *
 * This is where `homeRouteFor('platform_admin')` has always pointed. Until the
 * first platform administrator existed there was no way to reach it, so the
 * route was never created and signing in landed on a 404.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={[ROLE_KEYS.PLATFORM_ADMIN]}>
      <div className="min-h-dvh bg-background">
        {/* `layout-page` rather than bespoke widths, so the platform console
            shares the same horizontal rhythm as the tenant portals even though
            it deliberately keeps its own standalone shell. */}
        <main id="main" className="layout-page py-8 sm:py-10">
          {children}
        </main>
      </div>
    </RouteGuard>
  );
}
