'use client';

import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

import {
  useTrainingAnalytics,
  useTrainingRequests,
  useTrainingSessions,
} from '@/api/training-queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function TrainingDashboardPage() {
  const { user } = useAuth();

  const analytics = useTrainingAnalytics();
  // Awaiting review, newest first — the queue an approver actually works from.
  const pending = useTrainingRequests({ limit: 5, status: 'submitted', sort: '-createdAt' });
  const upcoming = useTrainingSessions({ limit: 5, status: 'scheduled', sort: 'startDate' });

  const canApprove = can(user?.permissions, 'training:approve');

  return (
    <>
      <PageHeader
        title="Training"
        description="Requests, scheduled sessions and how they are landing."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/college/training/calendar">
                <CalendarDays aria-hidden />
                Calendar
              </Link>
            </Button>

            {can(user?.permissions, 'training:create') ? (
              <Button asChild>
                <Link href="/college/training/requests/new">
                  <Plus aria-hidden />
                  New request
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting review"
          value={analytics.data?.requests.pending}
          icon={ClipboardList}
          isLoading={analytics.isLoading}
          invertDelta
        />
        <StatCard
          label="Upcoming sessions"
          value={analytics.data?.sessions.upcoming}
          icon={Clock}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Completed"
          value={analytics.data?.sessions.completed}
          icon={CheckCircle2}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Completion rate"
          value={
            analytics.data ? formatPercent(analytics.data.completion.completionRate) : undefined
          }
          icon={TrendingUp}
          isLoading={analytics.isLoading}
        />
      </div>

      {analytics.data && analytics.data.completion.averageFeedback !== null ? (
        <Card className="mt-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted-foreground">
              Average feedback across completed sessions
            </span>
            <span className="tabular text-lg font-semibold">
              {analytics.data.completion.averageFeedback} / 5
            </span>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Awaiting review</CardTitle>
              <CardDescription>
                {canApprove
                  ? 'Requests you can approve or reject.'
                  : 'Requests submitted and waiting on an approver.'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/college/training/requests?status=submitted">View all</Link>
            </Button>
          </CardHeader>

          <CardContent className="px-0">
            {pending.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-12" />
                ))}
              </div>
            ) : pending.isError ? (
              <ErrorState
                message={pending.error.message}
                requestId={pending.error.requestId}
                onRetry={() => void pending.refetch()}
              />
            ) : pending.data && pending.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {pending.data.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/college/training/requests/${item.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.reference} · {item.expectedParticipants} participants ·{' '}
                        {formatDate(item.preferredStartDate)}
                      </p>
                    </div>
                    <StatusBadge status={item.priority} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Nothing awaiting review"
                description="Submitted requests appear here for approval."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Upcoming sessions</CardTitle>
              <CardDescription>Scheduled and not yet started.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/college/training/sessions">View all</Link>
            </Button>
          </CardHeader>

          <CardContent className="px-0">
            {upcoming.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-12" />
                ))}
              </div>
            ) : upcoming.data && upcoming.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {upcoming.data.items.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/college/training/sessions/${session.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {session.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(session.startDate)} · {session.location ?? session.mode}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {session.stats.enrolledCount} / {session.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming sessions"
                description="Schedule a session once a request is approved."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
