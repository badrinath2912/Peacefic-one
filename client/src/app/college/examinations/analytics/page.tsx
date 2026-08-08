'use client';

import { Award, CalendarClock, ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

import { useExaminationAnalytics, useExams } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER, relationField } from '@/lib/examination-display';
import { formatPercent } from '@/lib/utils';

export default function ExaminationAnalyticsPage() {
  const analytics = useExaminationAnalytics();

  // Published exams carry the per-exam outcome stats worth comparing.
  const published = useExams({ limit: 50, status: 'results_published', include: 'courseId' });

  const rows = published.data?.items ?? [];

  const bestPerforming = [...rows]
    .filter((exam) => exam.stats.passCount + exam.stats.failCount > 0)
    .sort((a, b) => {
      const rate = (exam: (typeof rows)[number]) =>
        exam.stats.passCount / (exam.stats.passCount + exam.stats.failCount);
      return rate(b) - rate(a);
    });

  return (
    <RouteGuard permissions={['exam:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Analytics' },
        ]}
      />

      <PageHeader
        title="Examination analytics"
        description="Across every exam in your college."
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

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle distribution</CardTitle>
            <p className="text-sm text-muted-foreground">
              Where every exam currently sits. A pile-up at one stage is usually a bottleneck.
            </p>
          </CardHeader>

          <CardContent className="space-y-2">
            {analytics.isLoading ? (
              Array.from({ length: 7 }).map((_, index) => (
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

                    <span className="tabular w-16 shrink-0 text-right text-sm">
                      <strong>{count}</strong>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcomes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Averaged across exams whose results have been released.
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pass rate</p>
                <p className="tabular mt-1 text-4xl font-semibold">
                  {analytics.isLoading ? '—' : formatPercent(analytics.data?.passRate)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Average score
                </p>
                <p className="tabular mt-1 text-4xl font-semibold">
                  {analytics.isLoading ? '—' : formatPercent(analytics.data?.averagePercent)}
                </p>
              </div>
            </div>

            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              The pass rate is the mean of each exam&rsquo;s own rate, so a 20-candidate exam counts
              as much as a 200-candidate one. Read it as &ldquo;how the typical exam went&rdquo;,
              not as a cohort-wide figure.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Published exams by pass rate</CardTitle>
          <p className="text-sm text-muted-foreground">
            The bottom of this list is where an intervention is usually worth the effort.
          </p>
        </CardHeader>

        <CardContent>
          {published.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : published.isError ? (
            <ErrorState
              title="Could not load exams"
              message={published.error.message}
              onRetry={() => void published.refetch()}
            />
          ) : bestPerforming.length === 0 ? (
            <EmptyState
              icon={Award}
              title="Nothing published yet"
              description="Once results are released, each exam's outcome appears here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {bestPerforming.map((exam) => {
                const sat = exam.stats.passCount + exam.stats.failCount;
                const rate = sat > 0 ? (exam.stats.passCount / sat) * 100 : 0;

                return (
                  <li key={exam.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/college/examinations/exams/${exam.id}/results`}
                        className="font-medium text-primary hover:underline"
                      >
                        {exam.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {exam.title} · {relationField(exam.courseId, 'code')} · semester{' '}
                        {exam.semester}
                      </p>
                    </div>

                    <div className="w-32 shrink-0">
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${rate.toFixed(0)}% pass rate`}
                      >
                        <div
                          className={`h-full rounded-full ${rate >= 60 ? 'bg-success' : rate >= 40 ? 'bg-warning' : 'bg-danger'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>

                    <span className="tabular w-14 shrink-0 text-right text-sm font-medium">
                      {rate.toFixed(0)}%
                    </span>

                    <Badge tone={rate >= 60 ? 'success' : rate >= 40 ? 'warning' : 'danger'}>
                      {exam.stats.passCount}/{sat}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/college/examinations/exams">All exams</Link>
        </Button>
      </div>
    </RouteGuard>
  );
}
