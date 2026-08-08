'use client';

import { BadgeCheck, Building2, Download, Plus, Search, ShieldOff, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import {
  useBulkDeleteCompanies,
  useCompanies,
  useCompanyAnalytics,
  useExportCompanies,
  type Company,
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
  COMPANY_STATUS_LABELS,
  COMPANY_STATUS_OPTIONS,
  COMPANY_STATUS_TONES,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPE_OPTIONS,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function CompaniesPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: 'name' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const companies = useCompanies(params);
  const analytics = useCompanyAnalytics();
  const exportCompanies = useExportCompanies();
  const bulkDelete = useBulkDeleteCompanies();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Company>[] = [
    {
      key: 'name',
      header: 'Company',
      sortable: true,
      render: (company) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt=""
              className="size-8 shrink-0 rounded-md border border-border object-contain"
            />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="size-4" aria-hidden />
            </span>
          )}

          <div className="min-w-0">
            <Link
              href={`/college/placements/companies/${company.id}`}
              className="block truncate font-medium text-primary hover:underline"
            >
              {company.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {COMPANY_TYPE_LABELS[company.companyType]}
              {company.headquarters ? ` · ${company.headquarters}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      render: (company) => <span className="text-muted-foreground">{company.industry}</span>,
    },
    {
      key: 'sizeRange',
      header: 'Headcount',
      render: (company) => (
        <span className="text-muted-foreground">{company.sizeRange ?? '—'}</span>
      ),
    },
    {
      key: 'jobCount',
      header: 'Drives',
      align: 'right',
      render: (company) => <span className="tabular">{company.stats.jobCount}</span>,
    },
    {
      key: 'offerCount',
      header: 'Offers',
      align: 'right',
      render: (company) => <span className="tabular">{company.stats.offerCount}</span>,
    },
    {
      key: 'lastDriveAt',
      header: 'Last drive',
      sortable: true,
      render: (company) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(company.stats.lastDriveAt)}
        </span>
      ),
    },
    {
      key: 'isVerified',
      header: 'Verified',
      align: 'center',
      render: (company) =>
        company.isVerified ? (
          <BadgeCheck className="mx-auto size-4 text-success" aria-label="Verified" />
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (company) => (
        <Badge tone={COMPANY_STATUS_TONES[company.status]}>
          {COMPANY_STATUS_LABELS[company.status]}
        </Badge>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['company:read']}>
      <Breadcrumbs
        items={[{ label: 'Placement', href: '/college/placements' }, { label: 'Companies' }]}
      />

      <PageHeader
        title="Companies"
        description="The recruiters your college works with."
        actions={
          <>
            {can(user?.permissions, 'company:read') ? (
              <Button
                variant="outline"
                onClick={() => exportCompanies.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportCompanies.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'company:create') ? (
              <Button asChild>
                <Link href="/college/placements/companies/new">
                  <Plus aria-hidden />
                  Add company
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Companies"
          value={analytics.data?.total}
          icon={Building2}
          isLoading={analytics.isLoading}
        />
        <StatCard label="Active" value={analytics.data?.active} isLoading={analytics.isLoading} />
        <StatCard
          label="Verified"
          value={analytics.data?.verified}
          icon={BadgeCheck}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Blacklisted"
          value={analytics.data?.blacklisted}
          icon={ShieldOff}
          isLoading={analytics.isLoading}
          invertDelta
        />
      </div>

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportCompanies.isPending}
        onExport={
          can(user?.permissions, 'company:read')
            ? (format) => exportCompanies.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={
          can(user?.permissions, 'company:update') ? () => setPendingDelete(true) : undefined
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search name or industry"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search companies"
            />
          </div>

          <Select
            placeholder="All industries"
            value={(params.industry as string) ?? ''}
            onChange={(event) => setFilter('industry', event.target.value)}
            aria-label="Filter by industry"
            options={(analytics.data?.industries ?? []).map((industry) => ({
              value: industry,
              label: industry,
            }))}
          />

          <Select
            placeholder="All types"
            value={(params.companyType as string) ?? ''}
            onChange={(event) => setFilter('companyType', event.target.value)}
            aria-label="Filter by type"
            options={COMPANY_TYPE_OPTIONS}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={COMPANY_STATUS_OPTIONS}
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
        rows={companies.data?.items}
        rowKey={(company) => company.id}
        pagination={companies.data?.pagination}
        isLoading={companies.isLoading}
        isFetching={companies.isFetching}
        error={companies.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void companies.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={
          activeFilterCount > 0 ? 'No companies match those filters' : 'No companies yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Add the recruiters you work with so drives can be posted against them.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'company:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/placements/companies/new">Add company</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Remove ${selectedIds.length} compan${selectedIds.length === 1 ? 'y' : 'ies'}?`}
        description="A company with any drive history is skipped rather than removed — blacklisting is the way to stop a recruiter without erasing the record."
        confirmLabel={`Remove ${selectedIds.length}`}
        typeToConfirm={selectedIds.length >= 3 ? 'REMOVE' : undefined}
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
