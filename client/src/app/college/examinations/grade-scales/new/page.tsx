'use client';

import { useCreateGradeScale } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import {
  GradeScaleForm,
  type GradeScaleFormValues,
} from '@/components/examinations/grade-scale-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function NewGradeScalePage() {
  const createScale = useCreateGradeScale();

  return (
    <RouteGuard permissions={['gradescale:manage']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Grade scales', href: '/college/examinations/grade-scales' },
          { label: 'New' },
        ]}
      />

      <PageHeader
        title="New grade scale"
        description="Starts from a ten-point scale. Every value is editable, and the preview below shows exactly how it will grade."
      />

      <GradeScaleForm
        mode="create"
        onSubmit={(values: GradeScaleFormValues) =>
          createScale.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
