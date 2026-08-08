'use client';

import { CheckCircle2, ClipboardList, Download, Eye, ListChecks, UserCheck, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  useApplicationAnalytics,
  useApplications,
  useBulkApplicationAction,
  useCompanies,
  useExportApplications,
  useJobPostings,
  type JobApplication,
} from '@/api/placement-queries';
import { useDepartments } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { SelectionBar } from '@/components/common/selection-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_STATUS_TONES,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function ApplicationsPage() {
  const { user } = useAuth();

  /**
   * No search box: `JobApplicationRepository` declares no searchable fields, so
   * `?search=` is dropped server-side. Everything offered here is a real filter.
   */
  const { params, setPage, setSort, setFilter, resetFilters, activeFilterCount } = useListParams({
    sort: '-appliedAt',
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingBulk, setPendingBulk] = useState<'shortlist' | 'reject' | null>(null);

  /**
   * `application:read_all` opens this page, but it does not imply the rest.
   * A HOD holds it without `company:read` or `job:read`, so those two lookups
   * are gated — an ungated hook would fire a request the server answers with a
   * 403 and leave the filter looking merely empty.
   */
  const mayReadCompanies = can(user?.permissions, 'company:read');
  const mayReadJobs = can(user?.permissions, 'job:read');
  const mayReadDepartments = can(user?.permissions, 'department:read');

  const applications = useApplications(params);
  const analytics = useApplicationAnalytics(params);
  const companies = useCompanies({ limit: 200, sort: 'name' }, mayReadCompanies);
  const jobs = useJobPostings({ limit: 200, sort: 'title' }, mayReadJobs);
  const departments = useDepartments({ limit: 100 }, { enabled: mayReadDepartments });
  const exportApplications = useExportApplications();

  const bulkShortlist = useBulkApplicationAction('shortlist');
  const bulkReject = useBulkApplicationAction('reject');

  const maySortlist = can(user?.permissions, 'application:shortlist');
  const mayReject = can(user?.permissions, 'application:reject');

  const columns: Column<JobApplication>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (application) => {
        const student =
          typeof application.studentId === 'object' ? application.studentId : null;

        return (
          <div className="min-w-0">
            <Link
              href={`/college/placements/applications/${application.id}`}
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
      key: 'job',
      header: 'Role',
      render: (application) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{relationField(application.jobPostingId, 'title')}</p>
          <p className="truncate text-xs text-muted-foreground">
            {relationField(application.companyId, 'name')}
          </p>
        </div>
      ),
    },
    {
      key: 'cgpa',
      header: 'CGPA at apply',
      align: 'right',
      render: (application) => (
        <span className="tabular">
          {application.eligibilitySnapshot.cgpa === null
            ? '—'
            : application.eligibilitySnapshot.cgpa.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'currentRound',
      header: 'Round',
      sortable: true,
      align: 'right',
      render: (application) => (
        <span className="tabular">
          {application.currentRound === 0 ? '—' : application.currentRound}
        </span>
      ),
    },
    {
      key: 'appliedAt',
      header: 'Applied',
      sortable: true,
      render: (application) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(application.appliedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (application) => (
        <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
          {APPLICATION_STATUS_LABELS[application.status]}
        </Badge>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['application:read_all']}>
      <Breadcrumbs
        items={[{ label: 'Placement', href: '/college/placements' }, { label: 'Applications' }]}
      />

      <PageHeader
        title="Applications"
        description="Every application across your drives, from applied to selected."
        actions={
          <Button
            variant="outline"
            onClick={() => exportApplications.mutate({ format: 'xlsx', filters: params })}
            isLoading={exportApplications.isPending}
            loadingText="Exporting"
          >
            <Download aria-hidden />
            Export
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          label="Applications"
          value={analytics.data?.total}
          icon={ClipboardList}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Awaiting review"
          value={analytics.data?.applied}
          icon={Eye}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Under review"
          value={analytics.data?.underReview}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Shortlisted"
          value={analytics.data?.shortlisted}
          icon={ListChecks}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="In process"
          value={analytics.data?.inProcess}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Selected"
          value={analytics.data?.selected}
          icon={CheckCircle2}
          isLoading={analytics.isLoading}
        />
      </div>

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportApplications.isPending}
        onExport={(format) => exportApplications.mutate({ format, ids: selectedIds })}
      >
        {maySortlist ? (
          <Button variant="outline" size="sm" onClick={() => setPendingBulk('shortlist')}>
            <UserCheck aria-hidden />
            Shortlist
          </Button>
        ) : null}

        {mayReject ? (
          <Button variant="outline" size="sm" onClick={() => setPendingBulk('reject')}>
            <XCircle aria-hidden />
            Reject
          </Button>
        ) : null}
      </SelectionBar>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={APPLICATION_STATUS_OPTIONS}
          />

          {/* Offered only where the caller can actually list drives. */}
          {mayReadJobs ? (
            <Select
              placeholder="All roles"
              value={(params.jobPostingId as string) ?? ''}
              onChange={(event) => setFilter('jobPostingId', event.target.value)}
              aria-label="Filter by role"
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

          {mayReadDepartments ? (
            <Select
              placeholder="All departments"
              value={(params.departmentId as string) ?? ''}
              onChange={(event) => setFilter('departmentId', event.target.value)}
              aria-label="Filter by department"
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />
          ) : null}
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
        rows={applications.data?.items}
        rowKey={(application) => application.id}
        pagination={applications.data?.pagination}
        isLoading={applications.isLoading}
        isFetching={applications.isFetching}
        error={applications.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void applications.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={
          activeFilterCount > 0 ? 'No applications match those filters' : 'No applications yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Applications appear here as students apply to your published drives.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingBulk === 'shortlist'}
        tone="primary"
        title={`Shortlist ${selectedIds.length} candidate${selectedIds.length === 1 ? '' : 's'}?`}
        description="Anyone whose current status does not allow shortlisting is skipped, and the result says which."
        confirmLabel={`Shortlist ${selectedIds.length}`}
        isPending={bulkShortlist.isPending}
        onCancel={() => setPendingBulk(null)}
        onConfirm={() =>
          bulkShortlist.mutate(
            { ids: selectedIds },
            {
              onSuccess: () => {
                setPendingBulk(null);
                setSelectedIds([]);
              },
            },
          )
        }
      />

      <ReasonDialog
        open={pendingBulk === 'reject'}
        tone="danger"
        title={`Reject ${selectedIds.length} candidate${selectedIds.length === 1 ? '' : 's'}?`}
        description="Each student is notified. Anyone whose status does not allow rejection is skipped."
        label="Reason"
        placeholder="Shared with the students you reject."
        confirmLabel={`Reject ${selectedIds.length}`}
        isPending={bulkReject.isPending}
        onCancel={() => setPendingBulk(null)}
        onConfirm={(reason) =>
          bulkReject.mutate(
            { ids: selectedIds, reason },
            {
              onSuccess: () => {
                setPendingBulk(null);
                setSelectedIds([]);
              },
            },
          )
        }
      />
    </RouteGuard>
  );
}
