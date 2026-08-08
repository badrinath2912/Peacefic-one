'use client';

import { Award, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

import { useDepartments, useStudents, type Student } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';

/**
 * Transcripts are keyed by student, so the entry point is a student list rather
 * than a transcript list — most students have none until one is generated.
 */
export default function TranscriptsPage() {
  const { params, setPage, setSort, setSearch, setFilter, activeFilterCount, resetFilters } =
    useListParams({ sort: 'rollNumber' });

  const students = useStudents({ ...params, include: 'userId,batchId,departmentId' });
  const departments = useDepartments({ limit: 100, status: 'active' });

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Student>[] = [
    {
      key: 'rollNumber',
      header: 'Roll number',
      sortable: true,
      render: (student) => (
        <Link
          href={`/college/examinations/transcripts/${student.id}`}
          className="font-medium text-primary hover:underline"
        >
          {student.rollNumber}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Student',
      render: (student) => (
        <span className="truncate">
          {typeof student.userId === 'object' ? student.userId.fullName : '—'}
        </span>
      ),
    },
    {
      key: 'batchId',
      header: 'Batch',
      render: (student) => (
        <span className="text-muted-foreground">
          {typeof student.batchId === 'object' ? student.batchId.code : '—'}
        </span>
      ),
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
      render: (student) =>
        student.academics.currentCgpa === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular font-medium">{student.academics.currentCgpa.toFixed(2)}</span>
        ),
    },
    {
      key: 'backlogs',
      header: 'Backlogs',
      align: 'right',
      render: (student) =>
        student.academics.activeBacklogs > 0 ? (
          <Badge tone="danger">{student.academics.activeBacklogs}</Badge>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (student) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/college/examinations/transcripts/${student.id}`}>Open</Link>
        </Button>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['transcript:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Transcripts' },
        ]}
      />

      <PageHeader
        title="Transcripts"
        description="A transcript is a frozen snapshot of published results. Regenerating one creates a new revision rather than rewriting a document a student may already hold."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              type="search"
              placeholder="Search roll number or name"
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
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No students match those filters' : 'No students yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Transcripts are generated per student from their published results.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href="/college/students">
                <Award aria-hidden />
                Go to students
              </Link>
            </Button>
          )
        }
      />
    </RouteGuard>
  );
}
