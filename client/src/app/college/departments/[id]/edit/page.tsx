'use client';

import type { CreateDepartmentInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { useDepartment } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { DepartmentForm } from '@/components/departments/department-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { apiPatch } from '@/lib/api-client';

export default function EditDepartmentPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const department = useDepartment(params.id);

  if (department.isLoading) return <FullPageSpinner label="Loading department" />;

  if (department.isError) {
    return (
      <ErrorState
        title="Could not load this department"
        message={department.error.message}
        requestId={department.error.requestId}
        onRetry={() => void department.refetch()}
      />
    );
  }

  if (!department.data) return <FullPageSpinner label="Loading" />;

  const record = department.data;
  const hodId =
    typeof record.hodId === 'object' && record.hodId ? record.hodId.id : (record.hodId ?? null);

  return (
    <RouteGuard permissions={['department:update']}>
      <Breadcrumbs
        items={[
          { label: 'Departments', href: '/college/departments' },
          { label: record.code, href: `/college/departments/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.name}`} description={record.code} />

      <DepartmentForm
        mode="edit"
        defaultValues={
          {
            name: record.name,
            code: record.code,
            description: record.description ?? '',
            hodId,
            establishedYear: record.establishedYear,
            status: record.status,
          } as Partial<CreateDepartmentInput>
        }
        onSubmit={async (values) => {
          // The HOD is assigned through its own endpoint, because doing so
          // grants a role and is audited separately.
          const { hodId: nextHodId, ...patch } = values;

          const updated = await apiPatch(`/departments/${params.id}`, patch);

          if ((nextHodId ?? null) !== hodId) {
            await apiPatch(`/departments/${params.id}/hod`, { hodId: nextHodId ?? null });
          }

          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          await queryClient.invalidateQueries({ queryKey: ['faculty'] });
          return updated;
        }}
      />
    </RouteGuard>
  );
}
