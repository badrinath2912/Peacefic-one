'use client';

import { CalendarClock, CheckCircle2, Clock, Video } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { useMyInterviews, type Interview } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_RESULT_TONES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_TONES,
  relationField,
} from '@/lib/placement-display';
import { formatDateTime } from '@/lib/utils';

/** Statuses that still lie ahead, as opposed to a closed round. */
const LIVE = new Set(['scheduled', 'confirmed', 'rescheduled', 'in_progress']);

function InterviewCard({ interview }: { interview: Interview }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/student/interviews/${interview.id}`}
            className="block truncate font-medium text-primary hover:underline"
          >
            {interview.roundName}
          </Link>

          <p className="truncate text-sm text-muted-foreground">
            {relationField(interview.jobPostingId, 'title')} ·{' '}
            {relationField(interview.companyId, 'name')}
          </p>

          <p className="text-xs text-muted-foreground">
            {formatDateTime(interview.scheduledAt)} · {INTERVIEW_MODE_LABELS[interview.mode]} ·{' '}
            {interview.durationMinutes} min
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {interview.result.status !== 'pending' ? (
            <Badge tone={INTERVIEW_RESULT_TONES[interview.result.status]}>
              {INTERVIEW_RESULT_LABELS[interview.result.status]}
            </Badge>
          ) : null}

          <Badge tone={INTERVIEW_STATUS_TONES[interview.status]}>
            {INTERVIEW_STATUS_LABELS[interview.status]}
          </Badge>

          <Button size="sm" variant="outline" asChild>
            <Link href={`/student/interviews/${interview.id}`}>Open</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The signed-in student's own interviews.
 *
 * `GET /interviews/me` carries no student parameter — the server reads identity
 * from the token, so there is nothing for the browser to substitute.
 */
export default function StudentInterviewsPage() {
  const interviews = useMyInterviews();

  const { upcoming, past } = useMemo(() => {
    const rows = interviews.data ?? [];

    return {
      upcoming: rows
        .filter((entry) => LIVE.has(entry.status))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
      past: rows.filter((entry) => !LIVE.has(entry.status)),
    };
  }, [interviews.data]);

  const awaitingConfirmation = upcoming.filter(
    (entry) => entry.status === 'scheduled' || entry.status === 'rescheduled',
  ).length;

  return (
    <RouteGuard permissions={['interview:read']}>
      <PageHeader
        title="My interviews"
        description="Every round you have been scheduled for."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Coming up"
          value={upcoming.length}
          icon={CalendarClock}
          isLoading={interviews.isLoading}
        />
        <StatCard
          label="Needing your confirmation"
          value={awaitingConfirmation}
          icon={Clock}
          isLoading={interviews.isLoading}
        />
        <StatCard
          label="Completed"
          value={past.length}
          icon={CheckCircle2}
          isLoading={interviews.isLoading}
        />
      </div>

      {interviews.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Card key={key} className="p-5">
              <div className="skeleton h-5 w-1/2 rounded" />
              <div className="skeleton mt-3 h-4 w-1/3 rounded" />
            </Card>
          ))}
        </div>
      ) : interviews.isError ? (
        <ErrorState
          title="Could not load your interviews"
          message={interviews.error.message}
          requestId={interviews.error.requestId}
          onRetry={() => void interviews.refetch()}
        />
      ) : (interviews.data ?? []).length === 0 ? (
        <EmptyState
          icon={Video}
          title="No interviews yet"
          description="Interviews appear here once the placement office schedules you for a round."
          action={
            <Button size="sm" asChild>
              <Link href="/student/applications">My applications</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Coming up</h2>

            {upcoming.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled at the moment.
                </p>
              </Card>
            ) : (
              upcoming.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))
            )}
          </section>

          {past.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Past</h2>
              {past.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </RouteGuard>
  );
}
