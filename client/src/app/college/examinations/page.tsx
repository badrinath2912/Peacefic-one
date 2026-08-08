'use client';

import {
  Award,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  Plus,
  Scale,
  ScrollText,
} from 'lucide-react';
import Link from 'next/link';

import { useExaminationAnalytics, useExams } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER, LIFECYCLE_TONES } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDateTime, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function ExaminationsDashboardPage() {
  const { user } = useAuth();
  const analytics = useExaminationAnalytics();

  // The two lists that actually need action, rather than a generic recent feed.
  const upcoming = useExams({ limit: 5, status: 'published', sort: 'scheduledAt' });
  const awaitingMarks = useExams({ limit: 5, status: 'completed', sort: '-scheduledAt' });

  return (
    <RouteGuard permissions={['exam:read']}>
      <PageHeader
        title="Examinations"
        description="Schedule sittings, record marks, and release results."
        actions={
          <>
            {can(user?.permissions, 'gradescale:read') ? (
              <Button variant="outline" asChild>
                <Link href="/college/examinations/grade-scales">
                  <Scale aria-hidden />
                  Grade scales
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'exam:create') ? (
              <Button asChild>
                <Link href="/college/examinations/exams/new">
                  <Plus aria-hidden />
                  New exam
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total exams"
          value={analytics.data?.total}
          icon={FileSpreadsheet}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Upcoming"
          value={analytics.data?.upcoming}
          icon={CalendarClock}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Awaiting marks"
          value={analytics.data?.awaitingMarks}
          icon={ClipboardCheck}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Results published"
          value={analytics.data?.published}
          icon={Award}
          isLoading={analytics.isLoading}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Where exams sit</CardTitle>
            <p className="text-sm text-muted-foreground">
              Across the seven stages of the lifecycle.
            </p>
          </CardHeader>

          <CardContent className="space-y-2">
            {analytics.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-6 w-full" />
              ))
            ) : (
              LIFECYCLE_ORDER.map((stage) => {
                const count = analytics.data?.byStatus[stage] ?? 0;
                const total = analytics.data?.total ?? 0;
                const share = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm text-muted-foreground">
                      {LIFECYCLE_LABELS[stage]}
                    </span>

                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${LIFECYCLE_LABELS[stage]}: ${count} of ${total}`}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${share}%` }}
                      />
                    </div>

                    <span className="tabular w-8 shrink-0 text-right text-sm font-medium">
                      {count}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Published, not yet sat</CardTitle>
              <p className="text-sm text-muted-foreground">Candidates can see these already.</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/college/examinations/exams?status=published">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {upcoming.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-12 w-full" />
                ))}
              </div>
            ) : (upcoming.data?.items ?? []).length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled"
                description="Published exams with a future date will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.data?.items.map((exam) => (
                  <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/college/examinations/exams/${exam.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {exam.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{exam.title}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm">{formatDateTime(exam.scheduledAt)}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {exam.stats.registeredCount} registered
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Waiting on marks</CardTitle>
              <p className="text-sm text-muted-foreground">
                Sat, but results cannot move until every candidate who appeared is graded.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/college/examinations/exams?status=completed">View all</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {awaitingMarks.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-12 w-full" />
                ))}
              </div>
            ) : (awaitingMarks.data?.items ?? []).length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing waiting"
                description="Completed exams needing marks entry will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {awaitingMarks.data?.items.map((exam) => (
                  <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/college/examinations/exams/${exam.id}/marks`}
                        className="font-medium text-primary hover:underline"
                      >
                        {exam.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{exam.title}</p>
                    </div>

                    <Badge tone={LIFECYCLE_TONES[exam.status]}>
                      {exam.stats.appearedCount} appeared
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcomes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Across every exam whose results have been released.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pass rate</p>
                <p className="tabular mt-1 text-3xl font-semibold">
                  {analytics.isLoading ? '—' : formatPercent(analytics.data?.passRate)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Average score
                </p>
                <p className="tabular mt-1 text-3xl font-semibold">
                  {analytics.isLoading ? '—' : formatPercent(analytics.data?.averagePercent)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/college/examinations/analytics">
                  <ScrollText aria-hidden />
                  Full analytics
                </Link>
              </Button>

              {can(user?.permissions, 'transcript:read') ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/college/examinations/transcripts">
                    <Award aria-hidden />
                    Transcripts
                  </Link>
                </Button>
              ) : null}

              <Button variant="outline" size="sm" asChild>
                <Link href="/college/examinations/exams">All exams</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
