'use client';

import { EXAM_REGISTRATION_STATUS } from '@peacefic/shared';
import { Ban, Plus, Search, UserCheck, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import {
  useExamProfile,
  useExamRegistrations,
  useRegisterStudents,
  useUpdateRegistration,
  type ExamRegistration,
} from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { RegisterStudentsDialog } from '@/components/examinations/register-students-dialog';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { Select } from '@/components/ui/select';
import { FullPageSpinner } from '@/components/ui/spinner';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { personName, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** Blocking or withdrawing a candidate demands a reason on the record. */
const STATUSES_NEEDING_REASON = new Set(['blocked', 'withdrawn']);

export default function ExamRegistrationsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const { params: listParams, setPage, setSort, setSearch, setFilter, activeFilterCount } =
    useListParams({ sort: 'hallTicketNumber' });

  const profile = useExamProfile(params.id);
  const registrations = useExamRegistrations(params.id, {
    ...listParams,
    include: 'studentId,batchId',
  });

  const registerStudents = useRegisterStudents(params.id);
  const updateRegistration = useUpdateRegistration();

  const [showRegister, setShowRegister] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{
    registrationId: string;
    status: ExamRegistration['status'];
    label: string;
  } | null>(null);

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const alreadyRegistered = useMemo(
    () =>
      new Set(
        (registrations.data?.items ?? []).map((row) =>
          typeof row.studentId === 'string' ? row.studentId : row.studentId.id,
        ),
      ),
    [registrations.data],
  );

  if (profile.isLoading) return <FullPageSpinner label="Loading exam" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this exam"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { exam } = profile.data;
  const canRegister = ['draft', 'scheduled', 'published'].includes(exam.status);
  const mayEdit = can(user?.permissions, 'exam:update');

  function changeStatus(
    registrationId: string,
    status: ExamRegistration['status'],
    reason?: string,
  ): void {
    updateRegistration.mutate(
      { registrationId, status, reason },
      { onSuccess: () => setPendingStatus(null) },
    );
  }

  const columns: Column<ExamRegistration>[] = [
    {
      key: 'hallTicketNumber',
      header: 'Hall ticket',
      sortable: true,
      render: (row) => <span className="font-medium">{row.hallTicketNumber}</span>,
    },
    {
      key: 'studentId',
      header: 'Candidate',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{relationField(row.studentId, 'rollNumber')}</p>
          <p className="truncate text-xs text-muted-foreground">{personName(row.studentId)}</p>
        </div>
      ),
    },
    {
      key: 'batchId',
      header: 'Batch',
      render: (row) => (
        <span className="text-muted-foreground">{relationField(row.batchId, 'code')}</span>
      ),
    },
    {
      key: 'attempt',
      header: 'Attempt',
      align: 'center',
      render: (row) =>
        row.attempt > 1 ? (
          <Badge tone="warning">{row.attempt}</Badge>
        ) : (
          <span className="tabular text-muted-foreground">1</span>
        ),
    },
    {
      key: 'registeredAt',
      header: 'Registered',
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.registeredAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <div className="space-y-0.5">
          <StatusBadge status={row.status} />
          {row.statusReason ? (
            <p className="max-w-48 truncate text-2xs text-muted-foreground" title={row.statusReason}>
              {row.statusReason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        !mayEdit || exam.status === 'archived' ? null : (
          <div className="flex justify-end gap-1">
            {row.status !== 'approved' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => changeStatus(row.id, 'approved')}
                title="Approve this candidate"
              >
                <UserCheck aria-hidden />
                <span className="sr-only">Approve {row.hallTicketNumber}</span>
              </Button>
            ) : null}

            {row.status !== 'blocked' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPendingStatus({
                    registrationId: row.id,
                    status: 'blocked',
                    label: row.hallTicketNumber,
                  })
                }
                title="Block this candidate"
              >
                <Ban aria-hidden />
                <span className="sr-only">Block {row.hallTicketNumber}</span>
              </Button>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <RouteGuard permissions={['exam:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Registrations' },
        ]}
      />

      <PageHeader
        title="Registrations"
        description={`${exam.title} · a candidate sitting this course again is registered as the next attempt.`}
        actions={
          mayEdit && canRegister ? (
            <Button onClick={() => setShowRegister(true)}>
              <Plus aria-hidden />
              Register candidates
            </Button>
          ) : null
        }
      />

      <ExamTabs examId={exam.id} />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              type="search"
              placeholder="Search hall ticket number"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search registrations"
            />
          </div>

          <Select
            placeholder="All statuses"
            value={(listParams.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={EXAM_REGISTRATION_STATUS.map((status) => ({
              value: status,
              label: toTitleCase(status),
            }))}
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={registrations.data?.items}
        rowKey={(row) => row.id}
        pagination={registrations.data?.pagination}
        isLoading={registrations.isLoading}
        isFetching={registrations.isFetching}
        error={registrations.error}
        sort={listParams.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void registrations.refetch()}
        stickyHeader
        emptyTitle={
          activeFilterCount > 0 ? 'No registrations match those filters' : 'Nobody registered yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing the status filter.'
            : 'Register a batch or individual candidates. Each is issued a hall ticket number.'
        }
        emptyAction={
          mayEdit && canRegister ? (
            <Button size="sm" onClick={() => setShowRegister(true)}>
              Register candidates
            </Button>
          ) : undefined
        }
      />

      <RegisterStudentsDialog
        open={showRegister}
        examBatchIds={exam.batchIds.map((batch) =>
          typeof batch === 'string' ? batch : batch.id,
        )}
        alreadyRegistered={alreadyRegistered}
        isPending={registerStudents.isPending}
        onCancel={() => setShowRegister(false)}
        onConfirm={(payload) =>
          registerStudents.mutate(payload, { onSuccess: () => setShowRegister(false) })
        }
      />

      <ReasonDialog
        open={pendingStatus !== null && STATUSES_NEEDING_REASON.has(pendingStatus.status)}
        title={`Block ${pendingStatus?.label ?? ''}?`}
        description="A blocked candidate is kept off the hall list. The reason is stored on the registration and in the audit log."
        label="Reason"
        placeholder="Outstanding fees"
        confirmLabel="Block candidate"
        tone="danger"
        isPending={updateRegistration.isPending}
        onCancel={() => setPendingStatus(null)}
        onConfirm={(reason) =>
          pendingStatus
            ? changeStatus(pendingStatus.registrationId, pendingStatus.status, reason)
            : undefined
        }
      />
    </RouteGuard>
  );
}
