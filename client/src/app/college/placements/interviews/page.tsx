'use client';

import { CalendarClock, CheckCircle2, ClipboardList, Clock, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

import {
  useCompanies,
  useInterviewAnalytics,
  useInterviews,
  useJobPostings,
  type Interview,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_MODE_OPTIONS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_RESULT_TONES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_OPTIONS,
  INTERVIEW_STATUS_TONES,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function InterviewsPage() {
  const { user } = useAuth();

  /**
   * `JobApplicationRepository` aside, the interview repository does declare a
   * searchable field — `roundName` — so the search box here is real. Everything
   * else offered is a filter the endpoint actually honours.
   */
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } = useListParams({
    sort: '-scheduledAt',
  });

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const mayReadAll = can(user?.permissions, 'interview:read_all');
  const mayReadCompanies = can(user?.permissions, 'company:read');
  const mayReadJobs = can(user?.permissions, 'job:read');

  const interviews = useInterviews(params, mayReadAll);
  // Analytics needs the same permission as the list, so it rides along.
  const analytics = useInterviewAnalytics({}, mayReadAll);
  // A HOD reaches this page on `interview:read_all` alone, holding neither of
  // these — so both lookups are gated rather than left to earn a 403.
  const companies = useCompanies({ limit: 200, sort: 'name' }, mayReadCompanies);
  const jobs = useJobPostings({ limit: 200, sort: 'title' }, mayReadJobs);

  const columns: Column<Interview>[] = [
    {
      key: 'student',
      header: 'Candidate',
      render: (interview) => {
        const student = typeof interview.studentId === 'object' ? interview.studentId : null;

        return (
          <div className="min-w-0">
            <Link
              href={`/college/placements/interviews/${interview.id}`}
              className="block truncate font-medium text-primary hover:underline"
            >
              {personName(student)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{student?.rollNumber ?? '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'round',
      header: 'Round',
      render: (interview) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{interview.roundName}</p>
          <p className="truncate text-xs text-muted-foreground">Round {interview.roundOrder}</p>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Drive',
      render: (interview) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{relationField(interview.jobPostingId, 'title')}</p>
          <p className="truncate text-xs text-muted-foreground">
            {relationField(interview.companyId, 'name')}
          </p>
        </div>
      ),
    },
    {
      key: 'scheduledAt',
      header: 'When',
      sortable: true,
      render: (interview) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-sm">{formatDateTime(interview.scheduledAt)}</p>
          <p className="text-xs text-muted-foreground">
            {INTERVIEW_MODE_LABELS[interview.mode]}
            {interview.panelNumber ? ` · panel ${interview.panelNumber}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (interview) => (
        <Badge tone={INTERVIEW_STATUS_TONES[interview.status]}>
          {INTERVIEW_STATUS_LABELS[interview.status]}
        </Badge>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (interview) => (
        <Badge tone={INTERVIEW_RESULT_TONES[interview.result.status]}>
          {INTERVIEW_RESULT_LABELS[interview.result.status]}
        </Badge>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['interview:read_all']}>
      <Breadcrumbs
        items={[{ label: 'Placement', href: '/college/placements' }, { label: 'Interviews' }]}
      />

      <PageHeader
        title="Interviews"
        description="Every round scheduled across your drives."
        actions={
          can(user?.permissions, 'interview:schedule') ? (
            <Button asChild>
              <Link href="/college/placements/interviews/schedule">Schedule</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Interviews"
          value={analytics.data?.total}
          icon={ClipboardList}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Upcoming"
          value={analytics.data?.upcoming}
          icon={CalendarClock}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Awaiting result"
          value={analytics.data?.pendingResult}
          icon={Clock}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Cleared"
          value={analytics.data?.cleared}
          icon={CheckCircle2}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Did not attend"
          value={analytics.data?.noShow}
          isLoading={analytics.isLoading}
          invertDelta
        />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* `roundName` is the repository's one searchable field. */}
          <Input
            type="search"
            placeholder="Search round name"
            leadingIcon={<Search />}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            aria-label="Search interviews by round name"
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={INTERVIEW_STATUS_OPTIONS}
          />

          <Select
            placeholder="All modes"
            value={(params.mode as string) ?? ''}
            onChange={(event) => setFilter('mode', event.target.value)}
            aria-label="Filter by mode"
            options={INTERVIEW_MODE_OPTIONS}
          />

          {mayReadJobs ? (
            <Select
              placeholder="All drives"
              value={(params.jobPostingId as string) ?? ''}
              onChange={(event) => setFilter('jobPostingId', event.target.value)}
              aria-label="Filter by drive"
              options={(jobs.data?.items ?? []).map((job) => ({
                value: job.id,
                label: job.title,
              }))}
            />
          ) : null}

          {mayReadCompanies ? (
            <Select
              placeholder="All companies"
              value={(params.companyId as string) ?? ''}
              onChange={(event) => setFilter('companyId', event.target.value)}
              aria-label="Filter by company"
              options={(companies.data?.items ?? []).map((company) => ({
                value: company.id,
                label: company.name,
              }))}
            />
          ) : null}
        </div>

        {/*
          No date filter: `interviewListQuerySchema` carries no `scheduledAt`,
          and `validate` strips unknown query keys, so the control would look
          like it worked and change nothing. Sorting by date is supported and
          is offered on the column instead.
        */}
        {activeFilterCount > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
            </span>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X aria-hidden />
              Clear
            </Button>
          </div>
        ) : null}
      </Card>

      <DataTable
        columns={columns}
        rows={interviews.data?.items}
        rowKey={(interview) => interview.id}
        pagination={interviews.data?.pagination}
        isLoading={interviews.isLoading}
        isFetching={interviews.isFetching}
        error={interviews.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void interviews.refetch()}
        stickyHeader
        emptyTitle={
          activeFilterCount > 0 ? 'No interviews match those filters' : 'No interviews scheduled'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Schedule a round against the candidates shortlisted for a drive.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'interview:schedule') ? (
            <Button size="sm" asChild>
              <Link href="/college/placements/interviews/schedule">Schedule interviews</Link>
            </Button>
          ) : undefined
        }
      />
    </RouteGuard>
  );
}
