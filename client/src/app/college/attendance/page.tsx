'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';

import { useAttendanceSessions, useBatches, type AttendanceSession } from '@/api/queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { cn, formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function batchLabel(value: unknown): string {
  if (value && typeof value === 'object' && 'code' in value) {
    return String((value as { code: unknown }).code ?? '—');
  }
  return '—';
}

export default function AttendanceSessionsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setFilter, resetFilters, activeFilterCount } = useListParams({
    sort: '-date',
  });

  const sessions = useAttendanceSessions(params);
  const batches = useBatches({ limit: 100, status: 'active' });

  const canMark = can(user?.permissions, 'attendance:mark');

  const columns: Column<AttendanceSession>[] = [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (session) => (
        <div>
          <p className="font-medium">{formatDate(session.date)}</p>
          <p className="text-xs text-muted-foreground">
            {session.startTime}–{session.endTime}
          </p>
        </div>
      ),
    },
    {
      key: 'batchId',
      header: 'Batch',
      render: (session) => batchLabel(session.batchId),
    },
    {
      key: 'topic',
      header: 'Topic',
      render: (session) => (
        <span className="text-muted-foreground">{session.topic ?? session.type}</span>
      ),
    },
    {
      key: 'marked',
      header: 'Marked',
      align: 'right',
      render: (session) =>
        session.status === 'pending_marking' ? (
          <span className="text-xs text-muted-foreground">Not marked</span>
        ) : (
          <span className="tabular text-sm">
            {session.stats.presentCount + session.stats.lateCount} / {session.stats.totalStudents}
          </span>
        ),
    },
    {
      key: 'percentage',
      header: 'Attendance',
      align: 'right',
      render: (session) =>
        session.status === 'pending_marking' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              'tabular font-medium',
              session.stats.percentage < 75 ? 'text-danger' : 'text-foreground',
            )}
          >
            {formatPercent(session.stats.percentage)}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (session) => (
        <span className="flex items-center gap-1.5">
          <StatusBadge status={session.status} />
          {session.isLocked ? (
            <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" />
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (session) =>
        canMark ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/college/attendance/${session.id}`}>
              {session.status === 'pending_marking' ? 'Mark' : 'View'}
            </Link>
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Sessions for the batches you can see."
        actions={
          canMark ? (
            <Button asChild>
              <Link href="/college/attendance/new">New session</Link>
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              { value: 'pending_marking', label: 'Not marked' },
              { value: 'marked', label: 'Marked' },
              { value: 'locked', label: 'Locked' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />

          <Select
            placeholder="All types"
            value={(params.type as string) ?? ''}
            onChange={(event) => setFilter('type', event.target.value)}
            aria-label="Filter by session type"
            options={[
              { value: 'lecture', label: 'Lecture' },
              { value: 'lab', label: 'Lab' },
              { value: 'tutorial', label: 'Tutorial' },
              { value: 'live_class', label: 'Live class' },
              { value: 'training', label: 'Training' },
            ]}
          />

          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="justify-self-start">
              Clear filters
            </Button>
          ) : null}
        </div>
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
        emptyTitle={
          activeFilterCount > 0 ? 'No sessions match those filters' : 'No sessions recorded yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Create a session to start marking attendance.'
        }
        emptyAction={
          canMark && activeFilterCount === 0 ? (
            <Button size="sm" asChild>
              <Link href="/college/attendance/new">New session</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
