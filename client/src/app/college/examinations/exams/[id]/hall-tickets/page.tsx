'use client';

import { Printer, TicketX } from 'lucide-react';
import { useParams } from 'next/navigation';

import { useExamProfile, useHallTickets } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { relationField } from '@/lib/examination-display';
import { formatDateTime } from '@/lib/utils';

export default function HallTicketsPage() {
  const params = useParams<{ id: string }>();
  const profile = useExamProfile(params.id);

  // Available only from `published` onward; asking earlier answers 422, which
  // is a legitimate state rather than a fault.
  const eligible = ['published', 'completed', 'marks_entered', 'results_published'].includes(
    profile.data?.exam.status ?? '',
  );

  const tickets = useHallTickets(params.id, eligible);

  if (profile.isLoading) return <FullPageSpinner label="Loading exam" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this exam"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { exam } = profile.data;

  return (
    <RouteGuard permissions={['exam:read']}>
      <div className="print:hidden">
        <Breadcrumbs
          items={[
            { label: 'Examinations', href: '/college/examinations' },
            { label: 'Exams', href: '/college/examinations/exams' },
            { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
            { label: 'Hall tickets' },
          ]}
        />

        <PageHeader
          title="Hall tickets"
          description={`${exam.title} · ${formatDateTime(exam.scheduledAt)}`}
          actions={
            eligible && (tickets.data ?? []).length > 0 ? (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer aria-hidden />
                Print
              </Button>
            ) : null
          }
        />

        <ExamTabs examId={exam.id} />
      </div>

      {!eligible ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={TicketX}
              title="Hall tickets are not valid yet"
              description="They become available once the exam is published, so a ticket cannot circulate before the sitting is confirmed."
            />
          </CardContent>
        </Card>
      ) : tickets.isLoading ? (
        <FullPageSpinner label="Loading hall tickets" />
      ) : tickets.isError ? (
        <ErrorState
          title="Could not load hall tickets"
          message={tickets.error.message}
          requestId={tickets.error.requestId}
          onRetry={() => void tickets.refetch()}
        />
      ) : (tickets.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="No candidates registered"
              description="Register candidates first — each is issued a hall ticket number."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {tickets.data?.map((ticket) => (
            <Card key={ticket.id} className="break-inside-avoid">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
                  <div className="min-w-0">
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Hall ticket
                    </p>
                    <p className="truncate font-semibold">{ticket.hallTicketNumber}</p>
                  </div>
                  {ticket.attempt > 1 ? (
                    <Badge tone="warning">Attempt {ticket.attempt}</Badge>
                  ) : null}
                </div>

                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Roll number</dt>
                    <dd className="font-medium">{ticket.rollNumber}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Batch</dt>
                    <dd>{ticket.batch}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Seat</dt>
                    <dd>{ticket.seatNumber ?? 'Unassigned'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Venue</dt>
                    <dd className="text-right">{exam.venue ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="text-right">{formatDateTime(exam.scheduledAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd>{exam.durationMinutes ? `${exam.durationMinutes} min` : '—'}</dd>
                  </div>
                </dl>

                <div className="border-t border-border pt-2 text-2xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {exam.code} · {relationField(exam.courseId, 'code')}
                  </p>
                  <p className="truncate">{exam.title}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {eligible && exam.instructions ? (
        <Card className="mt-4 print:hidden">
          <CardContent className="p-4">
            <h2 className="mb-1 text-sm font-semibold">Instructions to candidates</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {exam.instructions}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </RouteGuard>
  );
}
