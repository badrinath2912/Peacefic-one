'use client';

import { Download, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useBulkDeleteBatches, useExportBatches } from '@/api/admin-mutations';
import { useBatches, useDepartments, type Batch } from '@/api/queries';
import { SelectionBar } from '@/components/common/selection-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function departmentLabel(value: Batch['departmentId']): string {
  if (value && typeof value === 'object' && 'code' in value) return String(value.code);
  return '—';
}

export default function BatchesPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: '-admissionYear' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const batches = useBatches({ ...params, include: 'departmentId' });
  const departments = useDepartments({ limit: 100, status: 'active' });
  const exportBatches = useExportBatches();
  const bulkDelete = useBulkDeleteBatches();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Batch>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (batch) => (
        <Link
          href={`/college/batches/${batch.id}`}
          className="font-medium text-primary hover:underline"
        >
          {batch.code}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Batch',
      sortable: true,
      render: (batch) => <span className="font-medium">{batch.name}</span>,
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (batch) => departmentLabel(batch.departmentId),
    },
    {
      key: 'academicYear',
      header: 'Academic year',
      sortable: true,
      render: (batch) => (
        <span className="tabular">
          {batch.admissionYear}–{batch.graduationYear}
        </span>
      ),
    },
    {
      key: 'currentSemester',
      header: 'Sem',
      sortable: true,
      align: 'center',
      render: (batch) => <span className="tabular">{batch.currentSemester}</span>,
    },
    {
      key: 'strength',
      header: 'Strength',
      align: 'right',
      render: (batch) => {
        const utilisation =
          batch.capacity > 0 ? (batch.stats.totalStudents / batch.capacity) * 100 : 0;

        return (
          <div className="flex items-center justify-end gap-2">
            <span className="tabular">
              {batch.stats.totalStudents}
              <span className="text-muted-foreground"> / {batch.capacity}</span>
            </span>
            {/* A batch at or over capacity is worth seeing at a glance. */}
            <span
              className={cn(
                'inline-block h-1.5 w-10 overflow-hidden rounded-full bg-muted',
              )}
              aria-hidden
            >
              <span
                className={cn(
                  'block h-full rounded-full',
                  utilisation >= 100 ? 'bg-danger' : utilisation >= 85 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${Math.min(100, utilisation)}%` }}
              />
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (batch) => <StatusBadge status={batch.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Batches"
        description={
          batches.data
            ? `${batches.data.pagination.totalItems} batch${batches.data.pagination.totalItems === 1 ? '' : 'es'}`
            : 'Cohorts within each department.'
        }
        actions={
          <>
            {can(user?.permissions, 'batch:read') ? (
              <Button
                variant="outline"
                onClick={() => exportBatches.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportBatches.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'batch:create') ? (
              <Button asChild>
                <Link href="/college/batches/new">Add batch</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportBatches.isPending}
        onExport={
          can(user?.permissions, 'batch:read')
            ? (format) => exportBatches.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={can(user?.permissions, 'batch:delete') ? () => setPendingDelete(true) : undefined}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search name or code"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search batches"
            />
          </div>

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
            placeholder="All semesters"
            value={(params.currentSemester as string) ?? ''}
            onChange={(event) => setFilter('currentSemester', event.target.value)}
            aria-label="Filter by semester"
            options={Array.from({ length: 12 }, (_, index) => ({
              value: String(index + 1),
              label: `Semester ${index + 1}`,
            }))}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
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
        rows={batches.data?.items}
        rowKey={(batch) => batch.id}
        pagination={batches.data?.pagination}
        isLoading={batches.isLoading}
        isFetching={batches.isFetching}
        error={batches.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void batches.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No batches match those filters' : 'No batches yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Batches hold students and drive attendance. Create one to get started.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'batch:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/batches/new">Add batch</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} batch${selectedIds.length === 1 ? '' : 'es'}?`}
        description="A batch that still has enrolled students will be skipped. Move them to another batch first."
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
    </>
  );
}
