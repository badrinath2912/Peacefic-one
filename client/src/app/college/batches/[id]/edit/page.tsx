'use client';

import type { CreateBatchInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { useBatch } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { BatchForm } from '@/components/batches/batch-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { apiPatch } from '@/lib/api-client';

function relationId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id ?? '');
  }
  return null;
}

export default function EditBatchPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const batch = useBatch(params.id);

  if (batch.isLoading) return <FullPageSpinner label="Loading batch" />;

  if (batch.isError) {
    return (
      <ErrorState
        title="Could not load this batch"
        message={batch.error.message}
        requestId={batch.error.requestId}
        onRetry={() => void batch.refetch()}
      />
    );
  }

  if (!batch.data) return <FullPageSpinner label="Loading" />;

  const record = batch.data;

  return (
    <RouteGuard permissions={['batch:update']}>
      <Breadcrumbs
        items={[
          { label: 'Batches', href: '/college/batches' },
          { label: record.code, href: `/college/batches/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.name}`} description={record.code} />

      <BatchForm
        mode="edit"
        defaultValues={
          {
            name: record.name,
            code: record.code,
            departmentId: relationId(record.departmentId) ?? '',
            admissionYear: record.admissionYear,
            graduationYear: record.graduationYear,
            currentSemester: record.currentSemester,
            section: record.section ?? '',
            capacity: record.capacity,
            classAdvisorId: relationId(record.classAdvisorId),
            status: record.status,
          } as Partial<CreateBatchInput>
        }
        onSubmit={async (values) => {
          const updated = await apiPatch(`/batches/${params.id}`, values);
          await queryClient.invalidateQueries({ queryKey: ['batches'] });
          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          return updated;
        }}
      />
    </RouteGuard>
  );
}
