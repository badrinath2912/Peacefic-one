'use client';

import { useParams } from 'next/navigation';

import { useGradeScale, useUpdateGradeScale } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import {
  GradeScaleForm,
  type GradeScaleFormValues,
} from '@/components/examinations/grade-scale-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';

export default function EditGradeScalePage() {
  const params = useParams<{ id: string }>();
  const scale = useGradeScale(params.id);
  const updateScale = useUpdateGradeScale(params.id);

  if (scale.isLoading) return <FullPageSpinner label="Loading grade scale" />;

  if (scale.isError) {
    return (
      <ErrorState
        title="Could not load this grade scale"
        message={scale.error.message}
        requestId={scale.error.requestId}
        onRetry={() => void scale.refetch()}
      />
    );
  }

  if (!scale.data) return <FullPageSpinner label="Loading" />;

  return (
    <RouteGuard permissions={['gradescale:manage']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Grade scales', href: '/college/examinations/grade-scales' },
          { label: scale.data.code },
        ]}
      />

      <PageHeader
        title={`Edit ${scale.data.name}`}
        description="A scale that has already graded published results will refuse a band or policy change — create a new scale instead."
      />

      <GradeScaleForm
        mode="edit"
        defaultValues={{
          name: scale.data.name,
          code: scale.data.code,
          description: scale.data.description ?? '',
          bands: scale.data.bands,
          policy: scale.data.policy,
          isDefault: scale.data.isDefault,
          status: scale.data.status,
        }}
        onSubmit={(values: GradeScaleFormValues) => {
          // `code` is immutable once the scale exists; the update schema does
          // not accept it.
          const { code: _code, ...updatable } = values;
          return updateScale.mutateAsync(updatable as unknown as Record<string, unknown>);
        }}
      />
    </RouteGuard>
  );
}
