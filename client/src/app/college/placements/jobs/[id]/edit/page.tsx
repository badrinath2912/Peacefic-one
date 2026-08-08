'use client';

import { useParams } from 'next/navigation';

import { useJobPosting, useUpdateJobPosting } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { JobForm, type JobFormValues } from '@/components/placement/job-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import type { FormDefaults } from '@/lib/form-types';
import { toDateInput } from '@/lib/form-types';
import { JOB_STATUS_LABELS } from '@/lib/placement-display';

export default function EditJobPostingPage() {
  const params = useParams<{ id: string }>();

  const job = useJobPosting(params.id);
  const updateJob = useUpdateJobPosting(params.id);

  if (job.isLoading) return <FullPageSpinner label="Loading posting" />;

  if (job.isError) {
    return (
      <ErrorState
        title="Could not load this posting"
        message={job.error.message}
        requestId={job.error.requestId}
        onRetry={() => void job.refetch()}
      />
    );
  }

  if (!job.data) return null;

  const posting = job.data;
  const companyId =
    typeof posting.companyId === 'string' ? posting.companyId : posting.companyId.id;

  // The server refuses an eligibility change once anyone has applied; saying so
  // up front beats a rejected save after a long form.
  const applied = posting.stats.applicationCount;

  const defaults = {
    companyId,
    title: posting.title,
    description: posting.description,
    jobType: posting.jobType,
    workMode: posting.workMode,
    locations: posting.locations,
    openings: posting.openings,
    compensation: posting.compensation,
    eligibility: {
      ...posting.eligibility,
      departmentIds: posting.eligibility.departmentIds.map((entry) =>
        typeof entry === 'string' ? entry : entry.id,
      ),
      batchIds: posting.eligibility.batchIds.map((entry) =>
        typeof entry === 'string' ? entry : entry.id,
      ),
      customCriteria: posting.eligibility.customCriteria ?? '',
    },
    selectionRounds: posting.selectionRounds,
    applicationOpenAt: toDateInput(posting.applicationOpenAt),
    applicationCloseAt: toDateInput(posting.applicationCloseAt),
    driveDate: toDateInput(posting.driveDate) ?? null,
    attachments: [],
    status: posting.status,
  } as unknown as FormDefaults<JobFormValues>;

  return (
    <RouteGuard permissions={['job:update']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Job postings', href: '/college/placements/jobs' },
          { label: posting.title, href: `/college/placements/jobs/${posting.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title="Edit posting" description={posting.title} />

      {posting.status === 'published' ? (
        <Alert tone="warning" title="This posting is live" className="mb-4">
          Changing the closing date or drive date notifies every eligible student.
        </Alert>
      ) : null}

      {posting.status === 'completed' || posting.status === 'cancelled' ? (
        <Alert tone="danger" title={`This posting is ${JOB_STATUS_LABELS[posting.status].toLowerCase()}`} className="mb-4">
          The server will refuse any change. Nothing saved here will be accepted.
        </Alert>
      ) : null}

      <JobForm
        mode="edit"
        lockCompany
        defaultValues={defaults}
        eligibilityLocked={applied > 0}
        eligibilityLockedReason={
          applied > 0
            ? `${applied} student(s) have already applied, so the terms they applied under can no longer change.`
            : undefined
        }
        redirectTo={`/college/placements/jobs/${posting.id}`}
        onSubmit={(values: JobFormValues) => {
          const { companyId: _companyId, attachments: _attachments, ...patch } = values;

          // Eligibility is omitted rather than resent unchanged: the server
          // rejects the key outright once applications exist.
          if (applied > 0) {
            const { eligibility: _eligibility, ...withoutEligibility } = patch;
            return updateJob.mutateAsync(withoutEligibility as unknown as Record<string, unknown>);
          }

          return updateJob.mutateAsync(patch as unknown as Record<string, unknown>);
        }}
      />
    </RouteGuard>
  );
}
