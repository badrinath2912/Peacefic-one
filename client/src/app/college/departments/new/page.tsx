'use client';

import type { CreateDepartmentInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';

import { RouteGuard } from '@/components/auth/route-guard';
import { DepartmentForm } from '@/components/departments/department-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { apiPost } from '@/lib/api-client';

export default function NewDepartmentPage() {
  const queryClient = useQueryClient();

  return (
    <RouteGuard permissions={['department:create']}>
      <Breadcrumbs
        items={[
          { label: 'Departments', href: '/college/departments' },
          { label: 'Add department' },
        ]}
      />

      <PageHeader
        title="Add department"
        description="Departments group batches, students and staff."
      />

      <DepartmentForm
        mode="create"
        onSubmit={async (values: CreateDepartmentInput) => {
          const created = await apiPost('/departments', values);
          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          return created;
        }}
      />
    </RouteGuard>
  );
}
