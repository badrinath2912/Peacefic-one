'use client';

import type { CreateFacultyInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';

import { RouteGuard } from '@/components/auth/route-guard';
import { FacultyForm } from '@/components/faculty/faculty-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { apiPost } from '@/lib/api-client';

export default function NewFacultyPage() {
  const queryClient = useQueryClient();

  return (
    <RouteGuard permissions={['faculty:create']}>
      <Breadcrumbs
        items={[{ label: 'Faculty', href: '/college/faculty' }, { label: 'Add staff member' }]}
      />

      <PageHeader
        title="Add staff member"
        description="Create the record and send an invitation to activate their account."
      />

      <FacultyForm
        mode="create"
        onSubmit={async (values: CreateFacultyInput) => {
          const created = await apiPost('/faculty', values);
          await queryClient.invalidateQueries({ queryKey: ['faculty'] });
          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          return created;
        }}
      />
    </RouteGuard>
  );
}
