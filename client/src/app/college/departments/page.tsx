'use client';

import { Building2, Download, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useBulkDeleteDepartments, useExportDepartments } from '@/api/admin-mutations';
import { useDepartments, type Department } from '@/api/queries';
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
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function hodName(value: Department['hodId']): string {
  if (value && typeof value === 'object' && 'fullName' in value) {
    return String(value.fullName);
  }
  return '—';
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: 'name' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const departments = useDepartments({ ...params, include: 'hodId' });
  const exportDepartments = useExportDepartments();
  const bulkDelete = useBulkDeleteDepartments();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (department) => (
        <Link
          href={`/college/departments/${department.id}`}
          className="font-medium text-primary hover:underline"
        >
          {department.code}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Department',
      sortable: true,
      render: (department) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{department.name}</p>
          {department.description ? (
            <p className="truncate text-xs text-muted-foreground">{department.description}</p>
          ) : null}
        </div>
      ),
    },
    { key: 'hodId', header: 'Head', render: (department) => hodName(department.hodId) },
    {
      key: 'totalFaculty',
      header: 'Faculty',
      align: 'right',
      render: (department) => <span className="tabular">{department.stats.totalFaculty}</span>,
    },
    {
      key: 'totalStudents',
      header: 'Students',
      align: 'right',
      render: (department) => <span className="tabular">{department.stats.totalStudents}</span>,
    },
    {
      key: 'totalBatches',
      header: 'Batches',
      align: 'right',
      render: (department) => <span className="tabular">{department.stats.totalBatches}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (department) => formatDate(department.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (department) => <StatusBadge status={department.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Departments"
        description={
          departments.data
            ? `${departments.data.pagination.totalItems} department${departments.data.pagination.totalItems === 1 ? '' : 's'}`
            : 'Organise your institution.'
        }
        actions={
          <>
            {can(user?.permissions, 'department:read') ? (
              <Button
                variant="outline"
                onClick={() => exportDepartments.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportDepartments.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'department:create') ? (
              <Button asChild>
                <Link href="/college/departments/new">Add department</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportDepartments.isPending}
        onExport={
          can(user?.permissions, 'department:read')
            ? (format) => exportDepartments.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={
          can(user?.permissions, 'department:delete') ? () => setPendingDelete(true) : undefined
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search name or code"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search departments"
            />
          </div>

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />

          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="justify-self-start">
              <X aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={departments.data?.items}
        rowKey={(department) => department.id}
        pagination={departments.data?.pagination}
        isLoading={departments.isLoading}
        isFetching={departments.isFetching}
        error={departments.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void departments.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={
          activeFilterCount > 0 ? 'No departments match those filters' : 'No departments yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Departments group your batches, students and staff. Add the first one to get started.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'department:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/departments/new">Add department</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} department${selectedIds.length === 1 ? '' : 's'}?`}
        description="A department that still has students, batches or staff will be skipped rather than emptied."
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
