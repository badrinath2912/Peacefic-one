'use client';

import { Briefcase, CircleCheck, MapPin, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useMyApplications, useMyOpenings } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  JOB_TYPE_LABELS,
  JOB_TYPE_OPTIONS,
  WORK_MODE_LABELS,
  WORK_MODE_OPTIONS,
  formatCtcRange,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';

/**
 * The drives a student can see.
 *
 * `GET /jobs/me/openings` returns one array of every open posting with this
 * student's eligibility already decided by the shared engine — no pagination,
 * no server-side search. So the filtering below runs over what arrived, and no
 * control is offered that the endpoint could not honour.
 */
export default function StudentJobsPage() {
  const openings = useMyOpenings();
  const applications = useMyApplications();

  const [search, setSearch] = useState('');
  const [jobType, setJobType] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [onlyEligible, setOnlyEligible] = useState(false);

  /**
   * The openings endpoint does not say whether you have applied, so it is read
   * off your own applications — two responses you are already entitled to,
   * joined here rather than invented.
   */
  const applied = useMemo(() => {
    const entries = new Map<string, { id: string; status: string }>();

    for (const application of applications.data ?? []) {
      const jobId =
        typeof application.jobPostingId === 'string'
          ? application.jobPostingId
          : application.jobPostingId.id;

      entries.set(jobId, { id: application.id, status: application.status });
    }

    return entries;
  }, [applications.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (openings.data ?? []).filter(({ job, eligible }) => {
      if (jobType && job.jobType !== jobType) return false;
      if (workMode && job.workMode !== workMode) return false;
      if (onlyEligible && !eligible) return false;
      if (!term) return true;

      return (
        job.title.toLowerCase().includes(term) ||
        relationField(job.companyId, 'name').toLowerCase().includes(term) ||
        job.locations.some((location) => location.toLowerCase().includes(term))
      );
    });
  }, [openings.data, search, jobType, workMode, onlyEligible]);

  const filtered = Boolean(search.trim() || jobType || workMode || onlyEligible);
  const eligibleCount = (openings.data ?? []).filter((entry) => entry.eligible).length;

  function clearFilters(): void {
    setSearch('');
    setJobType('');
    setWorkMode('');
    setOnlyEligible(false);
  }

  return (
    <RouteGuard permissions={['job:read']}>
      <PageHeader
        title="Opportunities"
        description="Drives that are open right now, with whether you qualify for each."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Open drives"
          value={openings.data?.length}
          icon={Briefcase}
          isLoading={openings.isLoading}
        />
        <StatCard
          label="You qualify for"
          value={eligibleCount}
          icon={CircleCheck}
          isLoading={openings.isLoading}
        />
        <StatCard
          label="You have applied to"
          value={applications.data?.length}
          isLoading={applications.isLoading}
        />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search role, company or location"
              leadingIcon={<Search />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search opportunities"
            />
          </div>

          <Select
            placeholder="All engagements"
            value={jobType}
            onChange={(event) => setJobType(event.target.value)}
            aria-label="Filter by engagement"
            options={JOB_TYPE_OPTIONS}
          />

          <Select
            placeholder="All work modes"
            value={workMode}
            onChange={(event) => setWorkMode(event.target.value)}
            aria-label="Filter by work mode"
            options={WORK_MODE_OPTIONS}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              checked={onlyEligible}
              onChange={(event) => setOnlyEligible(event.target.checked)}
            />
            Only roles I qualify for
          </label>

          {filtered ? (
            <>
              <span className="text-xs text-muted-foreground">
                Showing {visible.length} of {openings.data?.length ?? 0}
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden />
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      {openings.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <Card key={key} className="p-5">
              <div className="skeleton h-5 w-2/3 rounded" />
              <div className="skeleton mt-3 h-4 w-1/2 rounded" />
              <div className="skeleton mt-6 h-4 w-full rounded" />
            </Card>
          ))}
        </div>
      ) : openings.isError ? (
        <ErrorState
          title="Could not load opportunities"
          message={openings.error.message}
          requestId={openings.error.requestId}
          onRetry={() => void openings.refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={filtered ? 'Nothing matches those filters' : 'No drives are open right now'}
          description={
            filtered
              ? 'Try clearing a filter — you may qualify for something you have hidden.'
              : 'New opportunities appear here as the placement office publishes them.'
          }
          action={
            filtered ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(({ job, eligible }) => {
            const application = applied.get(job.id);

            return (
              <Card key={job.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/student/jobs/${job.id}`}
                        className="block truncate font-medium text-primary hover:underline"
                      >
                        {job.title}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">
                        {relationField(job.companyId, 'name')}
                      </p>
                    </div>

                    {application ? (
                      <Badge
                        tone={
                          APPLICATION_STATUS_TONES[
                            application.status as keyof typeof APPLICATION_STATUS_TONES
                          ]
                        }
                      >
                        {
                          APPLICATION_STATUS_LABELS[
                            application.status as keyof typeof APPLICATION_STATUS_LABELS
                          ]
                        }
                      </Badge>
                    ) : eligible ? (
                      <Badge tone="success">You qualify</Badge>
                    ) : (
                      <Badge tone="neutral">Not eligible</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{JOB_TYPE_LABELS[job.jobType]}</Badge>
                    <Badge tone="neutral">{WORK_MODE_LABELS[job.workMode]}</Badge>
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Package</dt>
                      <dd className="tabular">
                        {formatCtcRange(
                          job.compensation.ctcMin,
                          job.compensation.ctcMax,
                          job.compensation.currency,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Applications close</dt>
                      <dd>{formatDate(job.applicationCloseAt)}</dd>
                    </div>
                  </dl>

                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">{job.locations.join(', ')}</span>
                  </p>

                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/student/jobs/${job.id}`}>
                        {application ? 'View drive' : 'View and apply'}
                      </Link>
                    </Button>

                    {application ? (
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/student/applications/${application.id}`}>
                          My application
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </RouteGuard>
  );
}
