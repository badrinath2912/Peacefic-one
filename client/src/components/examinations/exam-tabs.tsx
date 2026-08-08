'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { canAny } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

interface Tab {
  label: string;
  segment: string;
  permissions?: string[];
}

const TABS: Tab[] = [
  { label: 'Overview', segment: '' },
  { label: 'Registrations', segment: '/registrations', permissions: ['exam:read'] },
  { label: 'Hall tickets', segment: '/hall-tickets', permissions: ['exam:read'] },
  { label: 'Attendance', segment: '/attendance', permissions: ['attendance:read', 'attendance:mark'] },
  { label: 'Marks', segment: '/marks', permissions: ['marks:read', 'marks:enter'] },
  { label: 'Results', segment: '/results', permissions: ['result:read', 'result:read_all'] },
  { label: 'Papers', segment: '/papers', permissions: ['exam:read'] },
];

/**
 * The examination workflow in the order it happens. Tabs the user cannot use
 * are removed rather than disabled — a greyed-out row of things you may never
 * do is noise, and the same rule already governs the sidebar.
 */
export function ExamTabs({ examId }: { examId: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const base = `/college/examinations/exams/${examId}`;

  const visible = TABS.filter(
    (tab) => !tab.permissions || canAny(user?.permissions, tab.permissions),
  );

  return (
    <nav aria-label="Examination sections" className="mb-4 border-b border-border">
      <ul className="scrollbar-thin -mb-px flex gap-1 overflow-x-auto">
        {visible.map((tab) => {
          const href = `${base}${tab.segment}`;
          const active = tab.segment === '' ? pathname === base : pathname === href;

          return (
            <li key={tab.segment}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
