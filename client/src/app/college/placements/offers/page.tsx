'use client';

import { Award, BadgeCheck, Building2, Download, TrendingUp, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  useCompanies,
  useExportPlacements,
  usePlacementAnalytics,
  usePlacements,
  type Placement,
} from '@/api/placement-queries';
import { useDepartments } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { SelectionBar } from '@/components/common/selection-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import {
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_OPTIONS,
  PLACEMENT_STATUS_TONES,
  formatCtc,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function OffersPage() {
  const { user } = useAuth();

  const { params, setPage, setSort, setFilter, resetFilters, activeFilterCount } = useListParams({
    sort: '-offerDate',
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** Analytics needs `placement:report`, which is narrower than `read_all`. */
  const mayReport = can(user?.permissions, 'placement:report');
  const mayReadCompanies = can(user?.permissions, 'company:read');

  const placements = usePlacements(params);
  const analytics = usePlacementAnalytics(params, mayReport);
  const companies = useCompanies({ limit: 200, sort: 'name' }, mayReadCompanies);
  const departments = useDepartments({ limit: 100 });
  const exportPlacements = useExportPlacements();

  const columns: Column<Placement>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (placement) => {
        const student = typeof placement.studentId === 'object' ? placement.studentId : null;

        return (
          <div className="min-w-0">
            <Link
              href={`/college/placements/offers/${placement.id}`}
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
      key: 'company',
      header: 'Company',
      render: (placement) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{relationField(placement.companyId, 'name')}</p>
          <p className="truncate text-xs text-muted-foreground">{placement.designation}</p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (placement) => (
        <span className="text-muted-foreground">{placement.location}</span>
      ),
    },
    {
      key: 'package.ctc',
      header: 'Package',
      sortable: true,
      align: 'right',
      render: (placement) => (
        <span className="whitespace-nowrap tabular">
          {formatCtc(placement.package.ctc, placement.package.currency)}
        </span>
      ),
    },
    {
      key: 'offerDate',
      header: 'Offered',
      sortable: true,
      render: (placement) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(placement.offerDate)}
        </span>
      ),
    },
    {
      key: 'joiningDate',
      header: 'Joining',
      sortable: true,
      render: (placement) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(placement.joiningDate)}
        </span>
      ),
    },
    {
      key: 'isPrimaryOffer',
      header: 'Primary',
      align: 'center',
      render: (placement) =>
        placement.isPrimaryOffer ? (
          <BadgeCheck className="mx-auto size-4 text-success" aria-label="Primary offer" />
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (placement) => (
        <Badge tone={PLACEMENT_STATUS_TONES[placement.status]}>
          {PLACEMENT_STATUS_LABELS[placement.status]}
        </Badge>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['placement:read_all']}>
      <Breadcrumbs
        items={[{ label: 'Placement', href: '/college/placements' }, { label: 'Offers' }]}
      />

      <PageHeader
        title="Offers"
        description="Every offer your college has recorded, from made to joined."
        actions={
          <Button
            variant="outline"
            onClick={() => exportPlacements.mutate({ format: 'xlsx', filters: params })}
            isLoading={exportPlacements.isPending}
            loadingText="Exporting"
          >
            <Download aria-hidden />
            Export
          </Button>
        }
      />

      {mayReport ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Offers"
            value={analytics.data?.totalOffers}
            icon={Award}
            isLoading={analytics.isLoading}
          />
          <StatCard
            label="Accepted"
            value={analytics.data?.accepted}
            isLoading={analytics.isLoading}
          />
          <StatCard
            label="Joined"
            value={analytics.data?.joined}
            icon={Users}
            isLoading={analytics.isLoading}
          />
          <StatCard
            label="Students placed"
            value={analytics.data?.placedStudents}
            icon={Building2}
            isLoading={analytics.isLoading}
          />
          <StatCard
            label="Highest package"
            value={analytics.data ? formatCtc(analytics.data.highestCtc) : undefined}
            icon={TrendingUp}
            isLoading={analytics.isLoading}
          />
        </div>
      ) : null}

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportPlacements.isPending}
        onExport={(format) => exportPlacements.mutate({ format, ids: selectedIds })}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={PLACEMENT_STATUS_OPTIONS}
          />

          {/* Offered only where the caller may read companies at all. */}
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

          <Select
            placeholder="All engagements"
            value={(params.jobType as string) ?? ''}
            onChange={(event) => setFilter('jobType', event.target.value)}
            aria-label="Filter by engagement"
            options={[
              { value: 'full_time', label: 'Full time' },
              { value: 'internship', label: 'Internship' },
              { value: 'internship_ppo', label: 'Internship with PPO' },
            ]}
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
        rows={placements.data?.items}
        rowKey={(placement) => placement.id}
        pagination={placements.data?.pagination}
        isLoading={placements.isLoading}
        isFetching={placements.isFetching}
        error={placements.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void placements.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No offers match those filters' : 'No offers yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'An offer is recorded against a selected application, from the application itself.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    </RouteGuard>
  );
}
