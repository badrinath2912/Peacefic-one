'use client';

import { EXAM_LIFECYCLE, EXAM_TYPE } from '@peacefic/shared';
import { Download, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

import {
  useBulkDeleteExams,
  useExams,
  useExportExams,
  type Exam,
} from '@/api/examination-queries';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { LIFECYCLE_LABELS, LIFECYCLE_TONES, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDateTime, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function ExamListInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  // Seeded from the URL so the dashboard cards can deep-link into a filtered
  // list. Read once as the initial value — after that the list owns its state,
  // or clearing a filter would be undone on the next render.
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({
      sort: '-scheduledAt',
      status: searchParams.get('status') ?? undefined,
    });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);

  const exams = useExams({ ...params, include: 'courseId,departmentId' });
  const departments = useDepartments({ limit: 100, status: 'active' });
  const exportExams = useExportExams();
  const bulkDelete = useBulkDeleteExams();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<Exam>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (exam) => (
        <Link
          href={`/college/examinations/exams/${exam.id}`}
          className="font-medium text-primary hover:underline"
        >
          {exam.code}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Examination',
      sortable: true,
      render: (exam) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{exam.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {toTitleCase(exam.examType)} · {relationField(exam.courseId, 'code')}
          </p>
        </div>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (exam) => (
        <span className="text-muted-foreground">{relationField(exam.departmentId, 'code')}</span>
      ),
    },
    {
      key: 'semester',
      header: 'Sem',
      sortable: true,
      align: 'center',
      render: (exam) => <span className="tabular">{exam.semester}</span>,
    },
    {
      key: 'scheduledAt',
      header: 'Scheduled',
      sortable: true,
      render: (exam) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(exam.scheduledAt)}
        </span>
      ),
    },
    {
      key: 'totalMarks',
      header: 'Marks',
      align: 'right',
      render: (exam) => <span className="tabular">{exam.totalMarks}</span>,
    },
    {
      key: 'registered',
      header: 'Registered',
      align: 'right',
      render: (exam) => <span className="tabular">{exam.stats.registeredCount}</span>,
    },
    {
      key: 'outcome',
      header: 'Pass / fail',
      align: 'right',
      render: (exam) =>
        exam.stats.passCount + exam.stats.failCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular">
            <span className="text-success">{exam.stats.passCount}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-danger">{exam.stats.failCount}</span>
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Stage',
      sortable: true,
      render: (exam) => (
        <Badge tone={LIFECYCLE_TONES[exam.status]}>{LIFECYCLE_LABELS[exam.status]}</Badge>
      ),
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams' },
        ]}
      />

      <PageHeader
        title="Exams"
        description="Every sitting, from draft through to archived."
        actions={
          <>
            {can(user?.permissions, 'exam:read') ? (
              <Button
                variant="outline"
                onClick={() => exportExams.mutate({ format: 'xlsx', filters: params })}
                isLoading={exportExams.isPending}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'exam:create') ? (
              <Button asChild>
                <Link href="/college/examinations/exams/new">
                  <Plus aria-hidden />
                  New exam
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <SelectionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        isExporting={exportExams.isPending}
        onExport={
          can(user?.permissions, 'exam:read')
            ? (format) => exportExams.mutate({ format, ids: selectedIds })
            : undefined
        }
        onDelete={can(user?.permissions, 'exam:delete') ? () => setPendingDelete(true) : undefined}
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
              aria-label="Search exams"
            />
          </div>

          <Select
            placeholder="All stages"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by stage"
            options={EXAM_LIFECYCLE.map((status) => ({
              value: status,
              label: LIFECYCLE_LABELS[status],
            }))}
          />

          <Select
            placeholder="All types"
            value={(params.examType as string) ?? ''}
            onChange={(event) => setFilter('examType', event.target.value)}
            aria-label="Filter by type"
            options={EXAM_TYPE.map((type) => ({ value: type, label: toTitleCase(type) }))}
          />

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
        rows={exams.data?.items}
        rowKey={(exam) => exam.id}
        pagination={exams.data?.pagination}
        isLoading={exams.isLoading}
        isFetching={exams.isFetching}
        error={exams.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void exams.refetch()}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No exams match those filters' : 'No exams yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Create an exam to register candidates and record marks against it.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'exam:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/examinations/exams/new">New exam</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${selectedIds.length} exam${selectedIds.length === 1 ? '' : 's'}?`}
        description="Only drafts with nobody registered can be deleted. Anything further along is skipped and reported rather than removed."
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

export default function ExamListPage() {
  return (
    <RouteGuard permissions={['exam:read']}>
      {/* `useSearchParams` needs a Suspense boundary in the app router. */}
      <Suspense fallback={null}>
        <ExamListInner />
      </Suspense>
    </RouteGuard>
  );
}
