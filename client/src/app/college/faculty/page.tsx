'use client';

import { Columns3, Download, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useDepartments, useFaculty, type FacultyMember } from '@/api/queries';
import { useBulkDeleteFaculty, useExportFaculty } from '@/api/faculty-mutations';
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
import { initials } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relation(value: unknown, key: string): string {
  if (value && typeof value === 'object' && key in value) {
    const found = (value as Record<string, unknown>)[key];
    return found ? String(found) : '—';
  }
  return '—';
}

const OPTIONAL_COLUMNS = [
  { key: 'departmentId', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'type', label: 'Type' },
  { key: 'employmentType', label: 'Employment' },
  { key: 'experienceYears', label: 'Experience' },
  { key: 'batches', label: 'Batches' },
  { key: 'status', label: 'Status' },
];

export default function FacultyListPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: 'employeeId' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const faculty = useFaculty(params);
  const departments = useDepartments({ limit: 100, status: 'active' });
  const exportFaculty = useExportFaculty();
  const bulkDelete = useBulkDeleteFaculty();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<FacultyMember>[] = [
    {
      key: 'employeeId',
      header: 'Employee ID',
      sortable: true,
      render: (member) => (
        <Link
          href={`/college/faculty/${member.id}`}
          className="font-medium text-primary hover:underline"
        >
          {member.employeeId}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (member) => (
        <div className="flex items-center gap-2">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-subtle text-2xs font-semibold text-primary"
              aria-hidden
            >
              {initials(relation(member.userId, 'firstName'), relation(member.userId, 'lastName'))}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {`${relation(member.userId, 'firstName')} ${relation(member.userId, 'lastName')}`.trim()}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {relation(member.userId, 'email')}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (member) => relation(member.departmentId, 'code'),
    },
    { key: 'designation', header: 'Designation', sortable: true, render: (m) => m.designation },
    {
      key: 'type',
      header: 'Type',
      render: (member) => <span className="capitalize">{member.type}</span>,
    },
    {
      key: 'employmentType',
      header: 'Employment',
      render: (member) => <span className="capitalize">{member.employmentType}</span>,
    },
    {
      key: 'experienceYears',
      header: 'Experience',
      sortable: true,
      align: 'right',
      render: (member) => <span className="tabular">{member.experienceYears} yr</span>,
    },
    {
      key: 'batches',
      header: 'Batches',
      align: 'right',
      render: (member) => <span className="tabular">{member.assignedBatchIds.length}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (member) => <StatusBadge status={member.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Faculty"
        description={
          faculty.data
            ? `${faculty.data.pagination.totalItems} staff member${faculty.data.pagination.totalItems === 1 ? '' : 's'} in scope`
            : 'Manage teaching and training staff.'
        }
        actions={
          <>
            {can(user?.permissions, 'faculty:read') ? (
              <Button
                variant="outline"
                onClick={() => exportFaculty.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportFaculty.isPending}
                loadingText="Exporting"
                title="Export all rows matching the current filters"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'faculty:create') ? (
              <Button asChild>
                <Link href="/college/faculty/new">Add staff member</Link>
              </Button>
            ) : null}
          </>
        }
      />

      {selectedIds.length > 0 ? (
        <div
          role="region"
          aria-label={`${selectedIds.length} staff selected`}
          className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-subtle px-3 py-2"
        >
          <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {can(user?.permissions, 'faculty:read') ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportFaculty.mutate({ format: 'csv', ids: selectedIds })}
                >
                  <Download aria-hidden />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportFaculty.mutate({ format: 'xlsx', ids: selectedIds })}
                >
                  <Download aria-hidden />
                  Excel
                </Button>
              </>
            ) : null}

            {can(user?.permissions, 'faculty:delete') ? (
              <Button variant="danger" size="sm" onClick={() => setPendingDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              aria-label="Clear selection"
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search employee ID or designation"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search faculty"
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
            placeholder="All types"
            value={(params.type as string) ?? ''}
            onChange={(event) => setFilter('type', event.target.value)}
            aria-label="Filter by type"
            options={[
              { value: 'faculty', label: 'Faculty' },
              { value: 'trainer', label: 'Trainer' },
            ]}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'on_leave', label: 'On leave' },
              { value: 'resigned', label: 'Resigned' },
              { value: 'retired', label: 'Retired' },
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">
                {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
              </span>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X aria-hidden />
                Clear
              </Button>
            </>
          ) : null}

          <div className="relative ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnMenuOpen((open) => !open)}
              aria-expanded={columnMenuOpen}
              aria-haspopup="menu"
            >
              <Columns3 aria-hidden />
              Columns
            </Button>

            {columnMenuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setColumnMenuOpen(false)}
                  aria-hidden
                  tabIndex={-1}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-52 rounded-md border border-border bg-popover p-1 shadow-overlay"
                >
                  {OPTIONAL_COLUMNS.map((column) => (
                    <label
                      key={column.key}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        checked={!hiddenColumns.includes(column.key)}
                        onChange={() =>
                          setHiddenColumns((current) =>
                            current.includes(column.key)
                              ? current.filter((item) => item !== column.key)
                              : [...current, column.key],
                          )
                        }
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={faculty.data?.items}
        rowKey={(member) => member.id}
        pagination={faculty.data?.pagination}
        isLoading={faculty.isLoading}
        isFetching={faculty.isFetching}
        error={faculty.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void faculty.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        hiddenColumns={hiddenColumns}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No staff match those filters' : 'No staff yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter to widen the search.'
            : 'Add your first staff member to get started.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'faculty:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/faculty/new">Add staff member</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} staff member${selectedIds.length === 1 ? '' : 's'}?`}
        description="Their accounts will stop working. Attendance and records they created are retained for audit. Anyone still heading a department will be skipped."
        confirmLabel={`Delete ${selectedIds.length}`}
        typeToConfirm={selectedIds.length >= 5 ? 'DELETE' : undefined}
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
