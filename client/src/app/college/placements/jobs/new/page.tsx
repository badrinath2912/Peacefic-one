'use client';

import { useCreateJobPosting } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { JobForm, type JobFormValues } from '@/components/placement/job-form';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function NewJobPostingPage() {
  const createJob = useCreateJobPosting();

  return (
    <RouteGuard permissions={['job:create']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Job postings', href: '/college/placements/jobs' },
          { label: 'New' },
        ]}
      />

      <PageHeader
        title="New job posting"
        description="Saved as a draft. Students see nothing until you publish it."
      />

      <JobForm
        mode="create"
        onSubmit={(values: JobFormValues) =>
          createJob.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
