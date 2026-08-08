'use client';

import type { CreateTrainingSessionInput } from '@peacefic/shared';

import type { FormDefaults } from '@/lib/form-types';
import { useSearchParams } from 'next/navigation';

import { useTrainingRequest } from '@/api/training-queries';
import { useCreateTrainingSession } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { TrainingSessionForm } from '@/components/training/training-session-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { FullPageSpinner } from '@/components/ui/spinner';

function relationIds(value: Array<string | { id: string }> | undefined): string[] {
  return (value ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

export default function NewTrainingSessionPage() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get('requestId');

  const createSession = useCreateTrainingSession();
  // When scheduling against an approved request, the session inherits its
  // terms so the organiser is not retyping what was already agreed.
  const request = useTrainingRequest(requestId ?? '');

  if (requestId && request.isLoading) return <FullPageSpinner label="Loading request" />;

  const seeded = request.data;

  return (
    <RouteGuard permissions={['training:assign_trainer']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Sessions', href: '/college/training/sessions' },
          { label: 'New session' },
        ]}
      />

      <PageHeader
        title="Schedule a training session"
        description={
          seeded ? `Delivering ${seeded.reference}` : 'A standalone session, or one from a request.'
        }
      />

      {seeded ? (
        <Alert tone="info" title={`Pre-filled from ${seeded.reference}`} className="mb-4">
          The dates, scale and audience come from the approved request. Adjust anything that has
          changed before scheduling.
        </Alert>
      ) : null}

      <TrainingSessionForm
        mode="create"
        defaultValues={
          seeded
            ? ({
                requestId: seeded.id,
                title: seeded.title,
                description: seeded.description,
                trainingType: seeded.trainingType,
                mode: seeded.mode,
                capacity: seeded.expectedParticipants,
                startDate: seeded.preferredStartDate.slice(0, 10),
                endDate: seeded.preferredEndDate.slice(0, 10),
                topics: seeded.topics,
                departmentIds: relationIds(seeded.departmentIds),
                batchIds: relationIds(seeded.batchIds),
              } as FormDefaults<CreateTrainingSessionInput>)
            : undefined
        }
        onSubmit={(values) =>
          createSession.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
