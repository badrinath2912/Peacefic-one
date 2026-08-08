'use client';

import { BookOpen, Download, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useBulkDeleteCourses, useExportCourses } from '@/api/admin-mutations';
import { useCourseAnalytics, useCourses, useDepartments, type Course } from '@/api/queries';
import { SelectionBar } from '@/components/common/selection-bar';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** Relations arrive populated on the list; falls back to a count if not. */
function relationCodes(value: Course['departmentIds']): string {
  const codes = value
    .map((entry) => (entry && typeof entry === 'object' && 'code' in entry ? entry.code : null))
    .filter(Boolean);

  if (codes.length === 0) return value.length === 0 ? 'All' : `${value.length}`;
  return codes.join(', ');
}

export default function CoursesPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: 'code' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const courses = useCourses({ ...params, include: 'departmentIds,instructorIds' });
  const analytics = useCourseAnalytics();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const exportCourses = useExportCourses();
  const bulkDelete = useBulkDeleteCourses();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Course>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (course) => (
        <Link
          href={`/college/courses/${course.id}`}
          className="font-medium text-primary hover:underline"
        >
          {course.code}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Course',
      sortable: true,
      render: (course) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{course.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {toTitleCase(course.category)} · {toTitleCase(course.level)}
          </p>
        </div>
      ),
    },
    {
      key: 'departmentIds',
      header: 'Departments',
      render: (course) => (
        <span className="text-muted-foreground">{relationCodes(course.departmentIds)}</span>
      ),
    },
    {
      key: 'semester',
      header: 'Sem',
      sortable: true,
      align: 'center',
      render: (course) => <span className="tabular">{course.semester ?? '—'}</span>,
    },
    {
      key: 'credits',
      header: 'Credits',
      sortable: true,
      align: 'right',
      render: (course) => <span className="tabular">{course.credits ?? '—'}</span>,
    },
    {
      key: 'durationHours',
      header: 'Hours',
      sortable: true,
      align: 'right',
      render: (course) => <span className="tabular">{course.durationHours}</span>,
    },
    {
      key: 'instructors',
      header: 'Instructors',
      align: 'right',
      render: (course) => <span className="tabular">{course.instructorIds.length}</span>,
    },
    {
      key: 'stats.enrolledCount',
      header: 'Enrolled',
      sortable: true,
      align: 'right',
      render: (course) => <span className="tabular">{course.stats.enrolledCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (course) => <StatusBadge status={course.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Courses"
        description="The catalogue students learn from."
        actions={
          <>
            {can(user?.permissions, 'course:read') ? (
              <Button
                variant="outline"
                onClick={() => exportCourses.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportCourses.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'course:create') ? (
              <Button asChild>
                <Link href="/college/courses/new">Add course</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total courses"
          value={analytics.data?.total}
          icon={BookOpen}
          isLoading={analytics.isLoading}
        />
        <StatCard
          label="Published"
          value={analytics.data?.published}
          isLoading={analytics.isLoading}
        />
        <StatCard label="Drafts" value={analytics.data?.draft} isLoading={analytics.isLoading} />
      </div>

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportCourses.isPending}
        onExport={
          can(user?.permissions, 'course:read')
            ? (format) => exportCourses.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={can(user?.permissions, 'course:delete') ? () => setPendingDelete(true) : undefined}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search title or code"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search courses"
            />
          </div>

          <Select
            placeholder="All departments"
            value={(params.departmentIds as string) ?? ''}
            onChange={(event) => setFilter('departmentIds', event.target.value)}
            aria-label="Filter by department"
            options={(departments.data?.items ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />

          <Select
            placeholder="All categories"
            value={(params.category as string) ?? ''}
            onChange={(event) => setFilter('category', event.target.value)}
            aria-label="Filter by category"
            options={[
              { value: 'technical', label: 'Technical' },
              { value: 'aptitude', label: 'Aptitude' },
              { value: 'soft_skills', label: 'Soft skills' },
              { value: 'domain', label: 'Domain' },
              { value: 'certification', label: 'Certification' },
            ]}
          />

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
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
        rows={courses.data?.items}
        rowKey={(course) => course.id}
        pagination={courses.data?.pagination}
        isLoading={courses.isLoading}
        isFetching={courses.isFetching}
        error={courses.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void courses.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No courses match those filters' : 'No courses yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Build your catalogue so students have something to learn from.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'course:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/courses/new">Add course</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} course${selectedIds.length === 1 ? '' : 's'}?`}
        description="A course used as a prerequisite, or with students enrolled, will be skipped rather than removed."
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
