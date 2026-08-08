import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/auth/route-guard';
import { AppShell } from '@/components/layout/app-shell';
import { COLLEGE_ROLES } from '@/lib/permissions';

export default function CollegeLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={COLLEGE_ROLES}>
      <AppShell portal="college">{children}</AppShell>
    </RouteGuard>
  );
}
