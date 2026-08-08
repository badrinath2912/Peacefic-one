'use client';

import {
  Briefcase,
  CircleDot,
  Download,
  FileEdit,
  Plus,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import {
  useBulkDeleteJobPostings,
  useCompanies,
  useExportJobPostings,
  useJobAnalytics,
  useJobPostings,
  type JobPosting,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { SelectionBar } from '@/components/common/selection-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_OPTIONS,
  JOB_STATUS_TONES,
  JOB_TYPE_LABELS,
  JOB_TYPE_OPTIONS,
  WORK_MODE_LABELS,
  WORK_MODE_OPTIONS,
  formatCtc,
  formatCtcRange,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function JobPostingsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: '-createdAt' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const jobs = useJobPostings(params);
  const analytics = useJobAnalytics();
  const companies = useCompanies({ limit: 200, sort: 'name' });
  const exportJobs = useExportJobPostings();
  const bulkDelete = useBulkDeleteJobPostings();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<JobPosting>[] = [
    {
      key: 'title',
      header: 'Role',
      sortable: true,
      render: (job) => (
        <div className="min-w-0">
          <Link
            href={`/college/placements/jobs/${job.id}`}
            className="block truncate font-medium text-primary hover:underline"
          >
            {job.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {relationField(job.companyId, 'name')}
          </p>
        </div>
      ),
    },
    {
      key: 'jobType',
      header: 'Engagement',
      render: (job) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{JOB_TYPE_LABELS[job.jobType]}</p>
          <p className="truncate text-xs text-muted-foreground">{WORK_MODE_LABELS[job.workMode]}</p>
        </div>
      ),
    },
    {
      key: 'locations',
      header: 'Location',
      render: (job) => (
        <span className="text-muted-foreground">
          {job.locations.length > 0 ? job.locations.join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'compensation.ctcMax',
      header: 'Package',
      sortable: true,
      align: 'right',
      render: (job) => (
        <span className="whitespace-nowrap tabular">
          {formatCtcRange(job.compensation.ctcMin, job.compensation.ctcMax, job.compensation.currency)}
        </span>
      ),
    },
    {
      key: 'openings',
      header: 'Openings',
      sortable: true,
      align: 'right',
      render: (job) => <span className="tabular">{job.openings}</span>,
    },
    {
      key: 'applications',
      header: 'Applied',
      align: 'right',
      render: (job) => <span className="tabular">{job.stats.applicationCount}</span>,
    },
    {
      key: 'applicationCloseAt',
      header: 'Closes',
      sortable: true,
      render: (job) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(job.applicationCloseAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (job) => (
        <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['job:read']}>
      <Breadcrumbs
        items={[{ label: 'Placement', href: '/college/placements' }, { label: 'Job postings' }]}
      />

      <PageHeader
        title="Job postings"
        description="Every drive your college is running, from draft to completed."
        actions={
          <>
            {can(user?.permissions, 'job:read') ? (
              <Button
                variant="outline"
                onClick={() => exportJobs.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportJobs.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'job:create') ? (
              <Button asChild>
                <Link href="/college/placements/jobs/new">
                  <Plus aria-hidden />
                  New posting
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Postings"
          value={analytics.data?.total}
          icon={Briefcase}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Accepting applications"
          value={analytics.data?.open}
          icon={CircleDot}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Drafts"
          value={analytics.data?.draft}
          icon={FileEdit}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Total openings"
          value={analytics.data?.totalOpenings}
          icon={Users}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Highest package"
          value={analytics.data ? formatCtc(analytics.data.highestCtc) : undefined}
          icon={TrendingUp}
          isLoading={analytics.isLoading}
        />
      </div>

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportJobs.isPending}
        onExport={
          can(user?.permissions, 'job:read')
            ? (format) => exportJobs.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={can(user?.permissions, 'job:delete') ? () => setPendingDelete(true) : undefined}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search by job title"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search job postings"
            />
          </div>

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

          <Select
            placeholder="All engagements"
            value={(params.jobType as string) ?? ''}
            onChange={(event) => setFilter('jobType', event.target.value)}
            aria-label="Filter by engagement"
            options={JOB_TYPE_OPTIONS}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={JOB_STATUS_OPTIONS}
          />

          <Select
            placeholder="All work modes"
            value={(params.workMode as string) ?? ''}
            onChange={(event) => setFilter('workMode', event.target.value)}
            aria-label="Filter by work mode"
            options={WORK_MODE_OPTIONS}
          />
        </div>

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
        rows={jobs.data?.items}
        rowKey={(job) => job.id}
        pagination={jobs.data?.pagination}
        isLoading={jobs.isLoading}
        isFetching={jobs.isFetching}
        error={jobs.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void jobs.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No postings match those filters' : 'No job postings yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Create a posting against one of your companies to open a drive.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'job:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/placements/jobs/new">New posting</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} posting${selectedIds.length === 1 ? '' : 's'}?`}
        description="Only a draft with no applications can be deleted. Anything already announced is skipped — cancel it instead, so students are told."
        confirmLabel={`Delete ${selectedIds.length}`}
        typeToConfirm={selectedIds.length >= 3 ? 'DELETE' : undefined}
        isPending={bulkDelete.isPending}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() =>
          bulkDelete.mutate(selectedIds, {
            onSuccess: () => {
              setPendingDelete(false);
              setSelectedIds([]);
            },
          })
        }
      />
    </RouteGuard>
  );
}
