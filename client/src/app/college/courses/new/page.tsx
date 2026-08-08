'use client';

import type { CreateCourseInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';

import { RouteGuard } from '@/components/auth/route-guard';
import { CourseForm } from '@/components/courses/course-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { apiPost } from '@/lib/api-client';

export default function NewCoursePage() {
  const queryClient = useQueryClient();

  return (
    <RouteGuard permissions={['course:create']}>
      <Breadcrumbs
        items={[{ label: 'Courses', href: '/college/courses' }, { label: 'Add course' }]}
      />

      <PageHeader
        title="Add course"
        description="Courses start as drafts. Only published courses are visible to students."
      />

      <CourseForm
        mode="create"
        onSubmit={async (values: CreateCourseInput) => {
          const created = await apiPost('/courses', values);
          await queryClient.invalidateQueries({ queryKey: ['courses'] });
          return created;
        }}
      />
    </RouteGuard>
  );
}
