'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { useApplication, useCreatePlacement } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { OfferForm, type OfferFormValues } from '@/components/placement/offer-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import type { FormDefaults } from '@/lib/form-types';
import { personName, relationField } from '@/lib/placement-display';
import { toDateInput } from '@/lib/form-types';

/**
 * An offer is always recorded against one selected application, so this page
 * reads that application by id and carries its relations through. Arriving
 * without one is a dead end rather than a blank form.
 */
export default function NewOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId') ?? '';

  const application = useApplication(applicationId);
  const createPlacement = useCreatePlacement();

  if (!applicationId) {
    return (
      <RouteGuard permissions={['placement:create']}>
        <Breadcrumbs
          items={[
            { label: 'Placement', href: '/college/placements' },
            { label: 'Offers', href: '/college/placements/offers' },
            { label: 'New' },
          ]}
        />

        <EmptyState
          title="Start from the application"
          description="An offer is recorded against a selected application. Open the application and record the offer from there."
        />
      </RouteGuard>
    );
  }

  if (application.isLoading) return <FullPageSpinner label="Loading application" />;

  if (application.isError) {
    return (
      <ErrorState
        title="Could not load that application"
        message={application.error.message}
        requestId={application.error.requestId}
        onRetry={() => void application.refetch()}
      />
    );
  }

  if (!application.data) return null;

  const record = application.data;
  const student = typeof record.studentId === 'object' ? record.studentId : null;
  const job = typeof record.jobPostingId === 'object' ? record.jobPostingId : null;

  const relationId = (relation: unknown): string =>
    typeof relation === 'object' && relation !== null
      ? String((relation as { id?: string }).id ?? '')
      : String(relation ?? '');

  const defaults = {
    studentId: relationId(record.studentId),
    applicationId: record.id,
    jobPostingId: relationId(record.jobPostingId),
    companyId: relationId(record.companyId),
    designation: job?.title ?? '',
    offerDate: toDateInput(new Date()),
    status: 'offered',
  } as unknown as FormDefaults<OfferFormValues>;

  return (
    <RouteGuard permissions={['placement:create']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Offers', href: '/college/placements/offers' },
          { label: 'New' },
        ]}
      />

      <PageHeader
        title="Record an offer"
        description="What the company put in writing for this candidate."
      />

      {record.status !== 'selected' ? (
        <Alert tone="warning" title="This candidate is not marked as selected" className="mb-4">
          The application is currently {record.status.replace(/_/g, ' ')}. Select the candidate
          first — the server records an offer against a selected application.
        </Alert>
      ) : null}

      <OfferForm
        defaultValues={defaults}
        redirectTo="/college/placements/offers"
        candidate={{
          name: personName(student),
          rollNumber: student?.rollNumber ?? '—',
          company: relationField(record.companyId, 'name'),
          role: job?.title ?? '—',
        }}
        onSubmit={async (values: OfferFormValues) => {
          const created = await createPlacement.mutateAsync(
            values as unknown as Record<string, unknown>,
          );
          router.push(`/college/placements/offers/${created.id}`);
          return created;
        }}
      />
    </RouteGuard>
  );
}
