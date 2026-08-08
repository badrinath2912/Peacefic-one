'use client';

import type { CreateStudentInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '@/components/layout/app-shell';
import { RouteGuard } from '@/components/auth/route-guard';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { StudentForm } from '@/components/students/student-form';
import { apiPost } from '@/lib/api-client';

export default function NewStudentPage() {
  const queryClient = useQueryClient();

  return (
    <RouteGuard permissions={['student:create']}>
      <Breadcrumbs
        items={[
          { label: 'Students', href: '/college/students' },
          { label: 'Add student' },
        ]}
      />

      <PageHeader
        title="Add student"
        description="Create a student record and optionally send them an invitation to activate their account."
      />

      <StudentForm
        mode="create"
        onSubmit={async (values: CreateStudentInput) => {
          const created = await apiPost('/students', values);
          // The list and every dashboard count are now stale.
          await queryClient.invalidateQueries({ queryKey: ['students'] });
          await queryClient.invalidateQueries({ queryKey: ['batches'] });
          await queryClient.invalidateQueries({ queryKey: ['departments'] });
          return created;
        }}
      />
    </RouteGuard>
  );
}
