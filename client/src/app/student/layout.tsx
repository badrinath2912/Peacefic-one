import type { ReactNode } from 'react';

import { RouteGuard } from '@/components/auth/route-guard';
import { AppShell } from '@/components/layout/app-shell';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['student']}>
      <AppShell portal="student">{children}</AppShell>
    </RouteGuard>
  );
}
