'use client';

import { Columns3, Download, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useBatches, useDepartments, useStudents, type Student } from '@/api/queries';
import { useExportStudents } from '@/api/student-mutations';
import { BulkActionBar } from '@/components/students/bulk-action-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

/** Populated relations arrive as objects; unpopulated ones as an id string. */
function relationLabel(
  value: unknown,
  key: 'name' | 'code' | 'fullName' | 'email',
): string {
  if (value && typeof value === 'object' && key in value) {
    return String((value as Record<string, unknown>)[key] ?? '—');
  }
  return '—';
}

const OPTIONAL_COLUMNS = [
  { key: 'departmentId', label: 'Department' },
  { key: 'batchId', label: 'Batch' },
  { key: 'currentSemester', label: 'Semester' },
  { key: 'academics.currentCgpa', label: 'CGPA' },
  { key: 'backlogs', label: 'Backlogs' },
  { key: 'placement', label: 'Placement' },
  { key: 'status', label: 'Status' },
];

export default function StudentsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: 'rollNumber' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const students = useStudents(params);
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 100, status: 'active' });
  const exportStudents = useExportStudents();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  function toggleColumn(key: string): void {
    setHiddenColumns((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  const columns: Column<Student>[] = [
    {
      key: 'rollNumber',
      header: 'Roll number',
      sortable: true,
      render: (student) => (
        <Link
          href={`/college/students/${student.id}`}
          className="font-medium text-primary hover:underline"
        >
          {student.rollNumber}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (student) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{relationLabel(student.userId, 'fullName')}</p>
          <p className="truncate text-xs text-muted-foreground">
            {relationLabel(student.userId, 'email')}
          </p>
        </div>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (student) => relationLabel(student.departmentId, 'code'),
    },
    {
      key: 'batchId',
      header: 'Batch',
      render: (student) => relationLabel(student.batchId, 'code'),
    },
    {
      key: 'currentSemester',
      header: 'Sem',
      sortable: true,
      align: 'center',
      render: (student) => <span className="tabular">{student.currentSemester}</span>,
    },
    {
      key: 'academics.currentCgpa',
      header: 'CGPA',
      sortable: true,
      align: 'right',
      render: (student) => (
        <span className="tabular">
          {student.academics.currentCgpa?.toFixed(2) ?? '—'}
        </span>
      ),
    },
    {
      key: 'backlogs',
      header: 'Backlogs',
      align: 'right',
      render: (student) => (
        <span
          className={student.academics.activeBacklogs > 0 ? 'tabular text-danger' : 'tabular'}
        >
          {student.academics.activeBacklogs}
        </span>
      ),
    },
    {
      key: 'placement',
      header: 'Placement',
      render: (student) =>
        student.placement.isPlaced ? (
          <StatusBadge status="selected" />
        ) : student.placement.isEligible ? (
          <span className="text-xs text-muted-foreground">Eligible</span>
        ) : (
          <span className="text-xs text-muted-foreground">Not eligible</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (student) => <StatusBadge status={student.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Students"
        description={
          students.data
            ? `${students.data.pagination.totalItems} student${students.data.pagination.totalItems === 1 ? '' : 's'} in scope`
            : 'Manage student records.'
        }
        actions={
          <>
            {can(user?.permissions, 'student:export') ? (
              <Button
                variant="outline"
                onClick={() => exportStudents.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportStudents.isPending}
                loadingText="Exporting"
                // Exports what the filters currently show, not the page.
                title="Export all rows matching the current filters"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'student:import') ? (
              <Button variant="outline" asChild>
                <Link href="/college/students/import">Import</Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'student:create') ? (
              <Button asChild>
                <Link href="/college/students/new">Add student</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <BulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        filters={params}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search roll or register number"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search students"
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
            placeholder="All batches"
            value={(params.batchId as string) ?? ''}
            onChange={(event) => setFilter('batchId', event.target.value)}
            aria-label="Filter by batch"
            options={(batches.data?.items ?? []).map((batch) => ({
              value: batch.id,
              label: batch.code,
            }))}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'on_leave', label: 'On leave' },
              { value: 'graduated', label: 'Graduated' },
              { value: 'dropped', label: 'Dropped' },
              { value: 'suspended', label: 'Suspended' },
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
              {hiddenColumns.length > 0 ? (
                <span className="text-muted-foreground">({hiddenColumns.length} hidden)</span>
              ) : null}
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
                        onChange={() => toggleColumn(column.key)}
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
        rows={students.data?.items}
        rowKey={(student) => student.id}
        pagination={students.data?.pagination}
        isLoading={students.isLoading}
        isFetching={students.isFetching}
        error={students.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void students.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        hiddenColumns={hiddenColumns}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No students match those filters' : 'No students yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter to widen the search.'
            : 'Add your first student or import a roster to get started.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'student:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/students/new">Add student</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
