'use client';

import { CalendarClock, Link2, Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDeleteExam, useExamProfile } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { LifecycleStepper } from '@/components/examinations/lifecycle-stepper';
import { TransitionControl } from '@/components/examinations/transition-control';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { LIFECYCLE_LABELS, LIFECYCLE_TONES, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDateTime, formatPercent, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function ExamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const profile = useExamProfile(params.id);
  const deleteExam = useDeleteExam();
  const [pendingDelete, setPendingDelete] = useState(false);

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

  const { exam, gradeScale, counts, results, allowedTransitions } = profile.data;
  const batchCodes = exam.batchIds
    .map((batch) => relationField(batch, 'code'))
    .filter((code) => code !== '—');

  return (
    <RouteGuard permissions={['exam:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code },
        ]}
      />

      <PageHeader
        title={exam.title}
        description={`${exam.code} · ${toTitleCase(exam.examType)} · Semester ${exam.semester} · ${exam.academicYear}`}
        actions={
          <>
            <Badge tone={LIFECYCLE_TONES[exam.status]}>{LIFECYCLE_LABELS[exam.status]}</Badge>

            {can(user?.permissions, 'exam:update') && exam.status !== 'archived' ? (
              <Button variant="outline" asChild>
                <Link href={`/college/examinations/exams/${exam.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'exam:delete') && exam.status === 'draft' ? (
              <Button variant="outline" onClick={() => setPendingDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <ExamTabs examId={exam.id} />

      <Card className="mb-4">
        <CardContent className="space-y-4 p-5">
          <LifecycleStepper status={exam.status} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {allowedTransitions.length === 0
                ? 'This exam is archived and closed to further change.'
                : 'Move the exam along when the current stage is genuinely finished.'}
            </p>

            <TransitionControl
              examId={exam.id}
              allowedTransitions={allowedTransitions}
              canPublish={can(user?.permissions, 'exam:publish')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered" value={counts.registered} icon={Users} />
        <StatCard label="Appeared" value={counts.present} />
        <StatCard
          label="Absent or barred"
          value={counts.absent + counts.debarred + counts.malpractice}
          invertDelta
        />
        <StatCard label="Marks entered" value={counts.marksEntered} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>

          <CardContent>
            <DescriptionList
              items={[
                { label: 'Course', value: relationField(exam.courseId, 'title') },
                { label: 'Department', value: relationField(exam.departmentId, 'name') },
                { label: 'Batches', value: batchCodes.join(', ') || 'None' },
                { label: 'Scheduled', value: formatDateTime(exam.scheduledAt) },
                {
                  label: 'Duration',
                  value: exam.durationMinutes ? `${exam.durationMinutes} minutes` : null,
                },
                { label: 'Venue', value: exam.venue },
                {
                  label: 'Marks',
                  value: `${exam.totalMarks} total — theory ${exam.maxMarks.theory}, practical ${exam.maxMarks.practical}, internal ${exam.maxMarks.internal}`,
                  full: true,
                },
                { label: 'Credits', value: exam.credits },
                {
                  label: 'Grade scale',
                  value: gradeScale
                    ? `${gradeScale.name}${gradeScale.isDefault ? ' (college default)' : ''}`
                    : 'None configured',
                },
                { label: 'Instructions', value: exam.instructions, full: true },
              ]}
            />

            {exam.trainingSessionId ? (
              <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
                <Link2 className="size-4" aria-hidden />
                This exam is the assessment for a training session.
                <Link
                  href={`/college/training/sessions/${exam.trainingSessionId}`}
                  className="text-primary hover:underline"
                >
                  Open the session
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {results.currentVersion === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing published yet. Results appear here once released.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Passed
                      </p>
                      <p className="tabular text-2xl font-semibold text-success">
                        {results.passCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Failed
                      </p>
                      <p className="tabular text-2xl font-semibold text-danger">
                        {results.failCount}
                      </p>
                    </div>
                  </div>

                  <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Average</dt>
                      <dd className="tabular font-medium">
                        {formatPercent(results.averagePercent)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Highest</dt>
                      <dd className="tabular font-medium">
                        {formatPercent(results.highestPercent)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="tabular font-medium">{results.currentVersion}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Published</dt>
                      <dd className="font-medium">{formatDateTime(results.publishedAt)}</dd>
                    </div>
                  </dl>
                </>
              )}

              <Button variant="outline" size="sm" block asChild>
                <Link href={`/college/examinations/exams/${exam.id}/results`}>
                  Open results
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next step</CardTitle>
            </CardHeader>

            <CardContent>
              <NextStep examId={exam.id} status={exam.status} counts={counts} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${exam.code}?`}
        description="Only a draft with nobody registered can be deleted. This cannot be undone."
        confirmLabel="Delete exam"
        isPending={deleteExam.isPending}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() =>
          deleteExam.mutate(exam.id, {
            onSuccess: () => router.push('/college/examinations/exams'),
          })
        }
      />
    </RouteGuard>
  );
}

/**
 * The single most useful thing to do from here, given the stage. A detail page
 * that only reports state leaves the user to work out the workflow themselves.
 */
function NextStep({
  examId,
  status,
  counts,
}: {
  examId: string;
  status: string;
  counts: { registered: number; present: number; marksEntered: number };
}) {
  const base = `/college/examinations/exams/${examId}`;

  const step = (() => {
    switch (status) {
      case 'draft':
      case 'scheduled':
        return counts.registered === 0
          ? { label: 'Register candidates', href: `${base}/registrations`, icon: Users }
          : { label: 'Review registrations', href: `${base}/registrations`, icon: Users };
      case 'published':
        return { label: 'Record attendance', href: `${base}/attendance`, icon: CalendarClock };
      case 'completed':
        return { label: 'Enter marks', href: `${base}/marks`, icon: Pencil };
      case 'marks_entered':
        return { label: 'Publish results', href: `${base}/results`, icon: CalendarClock };
      case 'results_published':
        return { label: 'Review published results', href: `${base}/results`, icon: CalendarClock };
      default:
        return null;
    }
  })();

  if (!step) {
    return (
      <p className="text-sm text-muted-foreground">
        This exam is archived. Its records stay readable but nothing further is required.
      </p>
    );
  }

  const Icon = step.icon;

  return (
    <Button variant="outline" block asChild>
      <Link href={step.href}>
        <Icon aria-hidden />
        {step.label}
      </Link>
    </Button>
  );
}
