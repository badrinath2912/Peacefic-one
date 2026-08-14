'use client';

import { ArrowLeft, CalendarClock, Clock, MapPin, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { useExam, useHallTickets, type HallTicket } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_TONES,
  lifecycleIndex,
  relationField,
} from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/**
 * One assessment, as the student sitting it needs to see it: when, where, how
 * long, what it is worth, and their hall ticket once it exists.
 *
 * Three things are deliberately absent. Papers (`/papers`) are never requested
 * — released or not, the paper is the exam, and a student holding `exam:read`
 * has no business fetching it ahead of the hall. The registration roster is
 * never requested, because it is a list of the student's classmates. And
 * `exam.stats` is not rendered, being cohort performance data.
 *
 * Marks and grades are not duplicated here either: they already live at
 * /student/results, which reads the student-scoped `/examinations/me/results`.
 */
export default function StudentExamDetailPage() {
  const params = useParams<{ id: string }>();
  const examId = params?.id ?? '';

  const { user } = useAuth();
  const mayRead = can(user?.permissions, 'exam:read');

  const exam = useExam(mayRead ? examId : '');

  // A hall ticket only exists once the exam is published, and the server answers
  // 422 before that. Asking anyway would show the student an error for a state
  // that is simply "not yet".
  const isPublished = exam.data ? lifecycleIndex(exam.data.status) >= lifecycleIndex('published') : false;
  const hallTickets = useHallTickets(examId, mayRead && isPublished);

  return (
    <RouteGuard permissions={['exam:read']}>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/student/exams">
          <ArrowLeft className="size-4" aria-hidden />
          All assessments
        </Link>
      </Button>

      {exam.isError ? (
        <ErrorState
          title="Could not load this assessment"
          message="It may have been withdrawn, or you may not have access to it."
          requestId={exam.error.requestId}
          onRetry={() => void exam.refetch()}
        />
      ) : exam.isLoading || !exam.data ? (
        <div className="space-y-4">
          <div className="skeleton h-20 w-full rounded-lg" />
          <div className="skeleton h-56 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <PageHeader
            title={exam.data.title}
            description={`${relationField(exam.data.courseId, 'title')} · Semester ${exam.data.semester} · ${exam.data.academicYear}`}
            actions={
              <Badge tone={LIFECYCLE_TONES[exam.data.status]}>
                {LIFECYCLE_LABELS[exam.data.status]}
              </Badge>
            }
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Schedule</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Detail
                    icon={CalendarClock}
                    label="Date and time"
                    value={
                      exam.data.scheduledAt
                        ? formatDateTime(exam.data.scheduledAt)
                        : 'To be confirmed'
                    }
                  />
                  <Detail
                    icon={Clock}
                    label="Duration"
                    value={
                      exam.data.durationMinutes
                        ? `${exam.data.durationMinutes} minutes`
                        : 'To be confirmed'
                    }
                  />
                  <Detail icon={MapPin} label="Venue" value={exam.data.venue ?? 'To be confirmed'} />
                  <Detail
                    label="Examination type"
                    value={exam.data.examType.replace(/_/g, ' ')}
                    className="capitalize"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Marks and credits</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-4">
                  <Detail label="Theory" value={String(exam.data.maxMarks.theory)} />
                  <Detail label="Practical" value={String(exam.data.maxMarks.practical)} />
                  <Detail label="Internal" value={String(exam.data.maxMarks.internal)} />
                  <Detail label="Total" value={String(exam.data.totalMarks)} />
                  <Detail label="Credits" value={String(exam.data.credits)} />
                  <Detail label="Course code" value={relationField(exam.data.courseId, 'code')} />
                  <Detail
                    label="Department"
                    value={relationField(exam.data.departmentId, 'name')}
                    className="sm:col-span-2"
                  />
                </CardContent>
              </Card>

              {exam.data.instructions ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Instructions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {exam.data.instructions}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {exam.data.status === 'results_published' ? (
                <Alert tone="success" title="Results have been released">
                  <p className="text-sm">
                    {exam.data.resultsPublishedAt
                      ? `Released on ${formatDate(exam.data.resultsPublishedAt)}. `
                      : ''}
                    Your marks and grade are on your results page.
                  </p>
                  <Button variant="outline" size="sm" asChild className="mt-3">
                    <Link href="/student/results">View my results</Link>
                  </Button>
                </Alert>
              ) : null}
            </div>

            <HallTicketPanel
              isPublished={isPublished}
              query={hallTickets}
              examTitle={exam.data.title}
            />
          </div>
        </>
      )}
    </RouteGuard>
  );
}

/**
 * The hall ticket the student carries into the hall. The endpoint is
 * self-service: the server derives the student from the token and returns only
 * their own row, so nothing here identifies anyone else.
 */
function HallTicketPanel({
  isPublished,
  query,
  examTitle,
}: {
  isPublished: boolean;
  query: ReturnType<typeof useHallTickets>;
  examTitle: string;
}) {
  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="size-4" aria-hidden />
          Hall ticket
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!isPublished ? (
          <p className="text-sm text-muted-foreground">
            Your hall ticket will appear here once the examination is published.
          </p>
        ) : query.isLoading ? (
          <div className="skeleton h-32 w-full rounded-lg" />
        ) : query.isError ? (
          <p className="text-sm text-muted-foreground">
            Your hall ticket is not available yet. Please check back closer to the examination, or
            contact the examination office.
          </p>
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No hall ticket"
            description="You are not registered for this examination. Contact the examination office if that looks wrong."
          />
        ) : (
          <div className="space-y-4">
            {query.data?.map((ticket) => (
              <HallTicketCard key={ticket.id} ticket={ticket} examTitle={examTitle} />
            ))}

            <p className="text-xs text-muted-foreground">
              Carry a printed or on-screen copy along with your college ID card.
            </p>

            <Button variant="outline" size="sm" block onClick={() => window.print()}>
              Print hall ticket
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HallTicketCard({ ticket, examTitle }: { ticket: HallTicket; examTitle: string }) {
  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Hall ticket number</p>
      <p className="font-mono text-lg font-semibold">{ticket.hallTicketNumber}</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Field label="Roll number" value={ticket.rollNumber} />
        <Field label="Seat" value={ticket.seatNumber ?? 'To be allotted'} />
        <Field label="Batch" value={ticket.batch} />
        <Field label="Attempt" value={String(ticket.attempt)} />
      </dl>

      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{examTitle}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`flex items-center gap-1.5 text-sm font-medium ${className ?? ''}`}>
        {Icon ? <Icon className="size-3.5 text-muted-foreground" aria-hidden /> : null}
        {value}
      </p>
    </div>
  );
}
