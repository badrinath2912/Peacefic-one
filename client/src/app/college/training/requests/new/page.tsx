'use client';

import type { CreateTrainingRequestInput } from '@peacefic/shared';

import { useCreateTrainingRequest } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { TrainingRequestForm } from '@/components/training/training-request-form';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function NewTrainingRequestPage() {
  const createRequest = useCreateTrainingRequest();

  return (
    <RouteGuard permissions={['training:create']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Requests', href: '/college/training/requests' },
          { label: 'New request' },
        ]}
      />

      <PageHeader
        title="New training request"
        description="Save it as a draft, or submit it straight for approval."
      />

      <TrainingRequestForm
        mode="create"
        onSubmit={(values: CreateTrainingRequestInput) =>
          createRequest.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
