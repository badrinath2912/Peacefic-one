'use client';

import { useParams } from 'next/navigation';

import { useExamProfile, useUpdateExam } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamForm, type ExamFormValues } from '@/components/examinations/exam-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { LIFECYCLE_LABELS } from '@/lib/examination-display';

/** Reads either the id or the populated document, whichever the API returned. */
function relationId(relation: unknown): string {
  if (!relation) return '';
  if (typeof relation === 'string') return relation;
  return String((relation as { id?: string }).id ?? '');
}

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const profile = useExamProfile(params.id);
  const updateExam = useUpdateExam(params.id);

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

  const { exam, counts } = profile.data;

  // Mirrors the server rule: once marks exist the scheme is fixed, because
  // changing the maximum would rescale every percentage already computed.
  const marksSchemeLocked = counts.marksEntered > 0;
  const frozen = ['marks_entered', 'results_published', 'archived'].includes(exam.status);

  return (
    <RouteGuard permissions={['exam:update']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${exam.code}`} description={exam.title} />

      {frozen ? (
        <Alert tone="warning" title="This exam can no longer be edited" className="mb-4">
          It is {LIFECYCLE_LABELS[exam.status].toLowerCase()}. Reopen it from the overview if a
          correction is genuinely needed — the server will refuse a save until then.
        </Alert>
      ) : null}

      <ExamForm
        mode="edit"
        marksSchemeLocked={marksSchemeLocked}
        redirectTo={`/college/examinations/exams/${exam.id}`}
        defaultValues={{
          title: exam.title,
          code: exam.code,
          examType: exam.examType as ExamFormValues['examType'],
          courseId: relationId(exam.courseId),
          departmentId: relationId(exam.departmentId),
          batchIds: exam.batchIds.map(relationId),
          semester: exam.semester,
          academicYear: exam.academicYear,
          maxMarks: exam.maxMarks,
          credits: exam.credits,
          gradeScaleId: exam.gradeScaleId ? relationId(exam.gradeScaleId) : null,
          scheduledAt: exam.scheduledAt,
          durationMinutes: exam.durationMinutes,
          venue: exam.venue ?? '',
          instructions: exam.instructions ?? '',
          trainingSessionId: exam.trainingSessionId,
        }}
        onSubmit={(values: ExamFormValues) => {
          // Only the fields the update schema accepts — code, course and
          // department are immutable once the exam exists.
          const {
            code: _code,
            courseId: _courseId,
            departmentId: _departmentId,
            academicYear: _academicYear,
            trainingSessionId: _trainingSessionId,
            ...updatable
          } = values;

          return updateExam.mutateAsync(updatable as unknown as Record<string, unknown>);
        }}
      />
    </RouteGuard>
  );
}
