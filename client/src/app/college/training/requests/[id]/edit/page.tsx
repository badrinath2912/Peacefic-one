'use client';

import type { CreateTrainingRequestInput } from '@peacefic/shared';

import type { FormDefaults } from '@/lib/form-types';
import { useParams } from 'next/navigation';

import { useTrainingRequest, useUpdateTrainingRequest } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { TrainingRequestForm } from '@/components/training/training-request-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';

function relationIds(value: Array<string | { id: string }>): string[] {
  return value.map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

export default function EditTrainingRequestPage() {
  const params = useParams<{ id: string }>();
  const request = useTrainingRequest(params.id);
  const updateRequest = useUpdateTrainingRequest(params.id);

  if (request.isLoading) return <FullPageSpinner label="Loading request" />;

  if (request.isError) {
    return (
      <ErrorState
        title="Could not load this request"
        message={request.error.message}
        requestId={request.error.requestId}
        onRetry={() => void request.refetch()}
      />
    );
  }

  if (!request.data) return <FullPageSpinner label="Loading" />;

  const record = request.data;
  const isLocked = !['draft', 'submitted'].includes(record.status);

  return (
    <RouteGuard permissions={['training:update']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Requests', href: '/college/training/requests' },
          { label: record.reference, href: `/college/training/requests/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.reference}`} description={record.title} />

      {/* The server refuses this too; saying so first avoids a wasted round trip. */}
      {isLocked ? (
        <Alert tone="warning" title="This request can no longer be edited">
          A reviewer has already acted on it, so its terms are fixed.
        </Alert>
      ) : (
        <TrainingRequestForm
          mode="edit"
          defaultValues={
            {
              title: record.title,
              description: record.description,
              trainingType: record.trainingType,
              departmentIds: relationIds(record.departmentIds),
              batchIds: relationIds(record.batchIds),
              expectedParticipants: record.expectedParticipants,
              preferredStartDate: record.preferredStartDate.slice(0, 10),
              preferredEndDate: record.preferredEndDate.slice(0, 10),
              durationHours: record.durationHours,
              mode: record.mode,
              topics: record.topics,
              objectives: record.objectives ?? '',
              priority: record.priority,
            } as FormDefaults<CreateTrainingRequestInput>
          }
          onSubmit={(values) => {
            // Status transitions go through their own endpoints.
            const { status: _status, ...patch } = values;
            return updateRequest.mutateAsync(patch as unknown as Record<string, unknown>);
          }}
        />
      )}
    </RouteGuard>
  );
}
