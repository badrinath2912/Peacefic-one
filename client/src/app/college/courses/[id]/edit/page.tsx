'use client';

import type { CreateCourseInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { useCourse } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { CourseForm } from '@/components/courses/course-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { apiPatch } from '@/lib/api-client';

/** Relations may arrive populated or as bare ids; the form needs ids. */
function toIds(value: Array<string | { id: string }>): string[] {
  return value.map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const course = useCourse(params.id);

  if (course.isLoading) return <FullPageSpinner label="Loading course" />;

  if (course.isError) {
    return (
      <ErrorState
        title="Could not load this course"
        message={course.error.message}
        requestId={course.error.requestId}
        onRetry={() => void course.refetch()}
      />
    );
  }

  if (!course.data) return <FullPageSpinner label="Loading" />;

  const record = course.data;

  return (
    <RouteGuard permissions={['course:update']}>
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/college/courses' },
          { label: record.code, href: `/college/courses/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.code}`} description={record.title} />

      <CourseForm
        mode="edit"
        courseId={params.id}
        defaultValues={
          {
            title: record.title,
            code: record.code,
            description: record.description,
            category: record.category,
            level: record.level,
            durationHours: record.durationHours,
            credits: record.credits,
            semester: record.semester,
            status: record.status,
            tags: record.tags,
            learningOutcomes: record.learningOutcomes,
            departmentIds: toIds(record.departmentIds),
            batchIds: toIds(record.batchIds),
            instructorIds: toIds(record.instructorIds),
            prerequisites: toIds(record.prerequisites),
          } as Partial<CreateCourseInput>
        }
        onSubmit={async (values) => {
          const updated = await apiPatch(`/courses/${params.id}`, values);
          await queryClient.invalidateQueries({ queryKey: ['courses'] });
          return updated;
        }}
      />
    </RouteGuard>
  );
}
