'use client';

import { useCreateExam } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamForm, type ExamFormValues } from '@/components/examinations/exam-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function NewExamPage() {
  const createExam = useCreateExam();

  return (
    <RouteGuard permissions={['exam:create']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: 'New' },
        ]}
      />

      <PageHeader
        title="New examination"
        description="Created as a draft. Nothing is visible to candidates until you publish it."
      />

      <ExamForm
        mode="create"
        onSubmit={(values: ExamFormValues) =>
          createExam.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
