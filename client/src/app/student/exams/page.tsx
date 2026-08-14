'use client';

import { CalendarClock, FileText, MapPin } from 'lucide-react';
import Link from 'next/link';

import { useExams, type Exam } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useListParams } from '@/hooks/use-list-params';
import { LIFECYCLE_LABELS, LIFECYCLE_TONES, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/**
 * The student's assessment schedule.
 *
 * Visibility is decided entirely by the server: `listExams` narrows to the
 * caller's department and, for anyone without `exam:update`, to the published,
 * completed, marks-entered and results-published states. That filter is applied
 * *after* the caller's own query, so `?status=draft` narrows within the allowed
 * set rather than escaping it.
 *
 * This page therefore renders what it is given and does **not** re-filter. Any
 * client-side status check here would be decoration, not security — and would
 * rot the moment the two definitions drifted apart.
 *
 * Nothing about papers, questions or the cohort is requested. `exam.stats`
 * arrives on the payload but is not rendered: it is aggregate performance data
 * that belongs to the examination office.
 */
export default function StudentExamsPage() {
  const { user } = useAuth();
  const mayRead = can(user?.permissions, 'exam:read');

  const { params, setPage } = useListParams({ limit: 20, sort: '-scheduledAt' });
  const exams = useExams(params, mayRead);

  const items = exams.data?.items ?? [];
  const pagination = exams.data?.pagination;

  return (
    <RouteGuard permissions={['exam:read']}>
      <PageHeader
        title="Assessments"
        description="Examinations scheduled for you, and the results your institution has released."
      />

      {exams.isError ? (
        <ErrorState
          title="Could not load your assessments"
          message="Something went wrong while fetching them. Please try again."
          requestId={exams.error.requestId}
          onRetry={() => void exams.refetch()}
        />
      ) : exams.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No assessments yet"
              description="Examinations appear here once your institution publishes them."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((exam) => (
              <li key={exam.id}>
                <ExamRow exam={exam} />
              </li>
            ))}
          </ul>

          {pagination && pagination.totalPages > 1 ? (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Assessment pages">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </RouteGuard>
  );
}

function ExamRow({ exam }: { exam: Exam }) {
  const course = relationField(exam.courseId, 'title');
  const courseCode = relationField(exam.courseId, 'code');

  return (
    <Card className="p-4 transition-colors hover:border-primary/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/student/exams/${exam.id}`}
              className="font-medium hover:underline"
            >
              {exam.title}
            </Link>
            <Badge tone={LIFECYCLE_TONES[exam.status]}>{LIFECYCLE_LABELS[exam.status]}</Badge>
          </div>

          <p className="truncate text-sm text-muted-foreground">
            {course}
            {courseCode !== '—' ? ` · ${courseCode}` : ''} · Semester {exam.semester}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {exam.scheduledAt ? formatDateTime(exam.scheduledAt) : 'Date to be confirmed'}
            </span>

            {exam.durationMinutes ? <span>{exam.durationMinutes} minutes</span> : null}

            {exam.venue ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {exam.venue}
              </span>
            ) : null}

            <span>{exam.totalMarks} marks</span>
          </div>

          {exam.status === 'results_published' && exam.resultsPublishedAt ? (
            <p className="text-xs text-success">
              Results released {formatDate(exam.resultsPublishedAt)}
            </p>
          ) : null}
        </div>

        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={`/student/exams/${exam.id}`}>View</Link>
        </Button>
      </div>
    </Card>
  );
}
