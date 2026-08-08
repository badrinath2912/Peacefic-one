'use client';

import type { CreateTrainingSessionInput } from '@peacefic/shared';

import type { FormDefaults } from '@/lib/form-types';
import { useParams } from 'next/navigation';

import { useTrainingSession, useUpdateTrainingSession } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { TrainingSessionForm } from '@/components/training/training-session-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';

function relationIds(value: Array<string | { id: string }>): string[] {
  return value.map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

export default function EditTrainingSessionPage() {
  const params = useParams<{ id: string }>();
  const session = useTrainingSession(params.id);
  const updateSession = useUpdateTrainingSession(params.id);

  if (session.isLoading) return <FullPageSpinner label="Loading session" />;

  if (session.isError) {
    return (
      <ErrorState
        title="Could not load this session"
        message={session.error.message}
        requestId={session.error.requestId}
        onRetry={() => void session.refetch()}
      />
    );
  }

  if (!session.data) return <FullPageSpinner label="Loading" />;

  const record = session.data;
  const isLocked = record.status === 'completed' || record.status === 'cancelled';

  return (
    <RouteGuard permissions={['training:update']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Sessions', href: '/college/training/sessions' },
          { label: record.title, href: `/college/training/sessions/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.title}`} />

      {isLocked ? (
        <Alert tone="warning" title={`A ${record.status} session cannot be edited`}>
          Its record is now fixed.
        </Alert>
      ) : (
        <TrainingSessionForm
          mode="edit"
          defaultValues={
            {
              title: record.title,
              description: record.description ?? '',
              trainingType: record.trainingType,
              departmentIds: relationIds(record.departmentIds),
              batchIds: relationIds(record.batchIds),
              trainerIds: relationIds(record.trainerIds),
              startDate: record.startDate.slice(0, 10),
              endDate: record.endDate.slice(0, 10),
              capacity: record.capacity,
              mode: record.mode,
              location: record.location ?? '',
              meetingLink: record.meetingLink ?? '',
              learningObjectives: record.learningObjectives,
              topics: record.topics,
              status: record.status,
            } as FormDefaults<CreateTrainingSessionInput>
          }
          onSubmit={(values) =>
            updateSession.mutateAsync(values as unknown as Record<string, unknown>)
          }
        />
      )}
    </RouteGuard>
  );
}
