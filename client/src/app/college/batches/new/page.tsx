'use client';

import type { CreateBatchInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';

import { RouteGuard } from '@/components/auth/route-guard';
import { BatchForm } from '@/components/batches/batch-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { apiPost } from '@/lib/api-client';

export default function NewBatchPage() {
  const queryClient = useQueryClient();

  return (
    <RouteGuard permissions={['batch:create']}>
      <Breadcrumbs
        items={[{ label: 'Batches', href: '/college/batches' }, { label: 'Add batch' }]}
      />

      <PageHeader title="Add batch" description="A cohort within a department." />

      <BatchForm
        mode="create"
        onSubmit={async (values: CreateBatchInput) => {
          const created = await apiPost('/batches', values);
          await queryClient.invalidateQueries({ queryKey: ['batches'] });
          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          return created;
        }}
      />
    </RouteGuard>
  );
}
