'use client';

import { CalendarDays, Download, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useDepartments } from '@/api/queries';
import { useTrainingSessions, type TrainingSession } from '@/api/training-queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { apiClient } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { buildQuery, cn, formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function TrainingSessionsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: '-startDate' });

  const [isExporting, setIsExporting] = useState(false);

  const sessions = useTrainingSessions({ ...params, include: 'departmentIds,trainerIds' });
  const departments = useDepartments({ limit: 100, status: 'active' });

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  async function exportSessions(format: 'csv' | 'xlsx'): Promise<void> {
    setIsExporting(true);
    try {
      const { page: _page, limit: _limit, ...exportable } = params;

      const response = await apiClient.post(
        `/training/sessions/bulk/export${buildQuery({ ...exportable, format })}`,
        {},
        { responseType: 'blob' },
      );

      const disposition = String(response.headers['content-disposition'] ?? '');
      const fileName = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `training.${format}`;

      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  const columns: Column<TrainingSession>[] = [
    {
      key: 'title',
      header: 'Session',
      sortable: true,
      render: (session) => (
        <div className="min-w-0">
          <Link
            href={`/college/training/sessions/${session.id}`}
            className="truncate font-medium text-primary hover:underline"
          >
            {session.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {toTitleCase(session.trainingType)} · {toTitleCase(session.mode)}
          </p>
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Dates',
      sortable: true,
      render: (session) => (
        <div>
          <p className="text-sm">{formatDate(session.startDate)}</p>
          <p className="text-xs text-muted-foreground">to {formatDate(session.endDate)}</p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Where',
      render: (session) => (
        <span className="text-muted-foreground">
          {session.location ?? (session.mode === 'online' ? 'Online' : '—')}
        </span>
      ),
    },
    {
      key: 'trainers',
      header: 'Trainers',
      align: 'right',
      render: (session) => <span className="tabular">{session.trainerIds.length}</span>,
    },
    {
      key: 'enrolment',
      header: 'Enrolled',
      align: 'right',
      render: (session) => {
        const utilisation =
          session.capacity > 0 ? (session.stats.enrolledCount / session.capacity) * 100 : 0;

        return (
          <div className="flex items-center justify-end gap-2">
            <span className="tabular">
              {session.stats.enrolledCount}
              <span className="text-muted-foreground"> / {session.capacity}</span>
            </span>
            <span className="inline-block h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
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
      render: (session) => <StatusBadge status={session.status} />,
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: 'Training', href: '/college/training' }, { label: 'Sessions' }]} />

      <PageHeader
        title="Training sessions"
        description="Scheduled delivery, and how full each session is."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/college/training/calendar">
                <CalendarDays aria-hidden />
                Calendar
              </Link>
            </Button>

            {can(user?.permissions, 'training:read') ? (
              <Button
                variant="outline"
                onClick={() => void exportSessions('xlsx')}
                isLoading={isExporting}
                loadingText="Exporting"
              >
                <Download aria-hidden />
                Export
              </Button>
            ) : null}

            {can(user?.permissions, 'training:assign_trainer') ? (
              <Button asChild>
                <Link href="/college/training/sessions/new">
                  <Plus aria-hidden />
                  New session
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search by title"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search training sessions"
            />
          </div>

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />

          <Select
            placeholder="All modes"
            value={(params.mode as string) ?? ''}
            onChange={(event) => setFilter('mode', event.target.value)}
            aria-label="Filter by mode"
            options={[
              { value: 'offline', label: 'In person' },
              { value: 'online', label: 'Online' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
          />

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
        rows={sessions.data?.items}
        rowKey={(session) => session.id}
        pagination={sessions.data?.pagination}
        isLoading={sessions.isLoading}
        isFetching={sessions.isFetching}
        error={sessions.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void sessions.refetch()}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No sessions match those filters' : 'No sessions yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Schedule a session once a training request has been approved.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'training:assign_trainer') ? (
            <Button size="sm" asChild>
              <Link href="/college/training/sessions/new">New session</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
