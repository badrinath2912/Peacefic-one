'use client';

import { CheckCircle2, MapPin, Pencil, UserMinus, UserPlus, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { useBatches } from '@/api/queries';
import {
  useCancelTrainingSession,
  useCompleteTrainingSession,
  useEnrolStudents,
  useTrainingSessionProfile,
  useWithdrawStudents,
} from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { Select } from '@/components/ui/select';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { formatDate, formatPercent, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relationLabels(value: Array<string | { code?: string; name?: string }>): string {
  const labels = value
    .map((entry) => (typeof entry === 'object' && entry ? (entry.name ?? entry.code ?? null) : null))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(', ') : 'College-wide';
}

export default function TrainingSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const profile = useTrainingSessionProfile(params.id);
  const batches = useBatches({ limit: 200, status: 'active' });

  const enrol = useEnrolStudents(params.id);
  const withdraw = useWithdrawStudents(params.id);
  const cancelSession = useCancelTrainingSession(params.id);
  const complete = useCompleteTrainingSession(params.id);

  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'cancel' | 'withdraw' | null>(null);
  const [enrolBatch, setEnrolBatch] = useState('');

  if (profile.isLoading) return <FullPageSpinner label="Loading session" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this session"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { session, counts, seatsRemaining, roster } = profile.data;

  const isOpen = session.status === 'scheduled' || session.status === 'in_progress';
  const canManage = can(user?.permissions, 'training:update');
  const activeRoster = roster.filter((entry) => entry.status !== 'withdrawn');

  return (
    <RouteGuard permissions={['training:read']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Sessions', href: '/college/training/sessions' },
          { label: session.title },
        ]}
      />

      <PageHeader
        title={session.title}
        description={`${formatDate(session.startDate)} – ${formatDate(session.endDate)} · ${toTitleCase(session.mode)}`}
        actions={
          <>
            {canManage && isOpen ? (
              <Button variant="outline" asChild>
                <Link href={`/college/training/sessions/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {canManage && isOpen ? (
              <Button
                onClick={() =>
                  complete.mutate({
                    // Everyone still enrolled is recorded as having completed.
                    // Withdrawals are already excluded from this list.
                    completedStudentIds: activeRoster.map((entry) => entry.studentId),
                  })
                }
                isLoading={complete.isPending}
              >
                <CheckCircle2 aria-hidden />
                Mark complete
              </Button>
            ) : null}

            {canManage && isOpen ? (
              <Button variant="ghost" onClick={() => setDialog('cancel')}>
                Cancel session
              </Button>
            ) : null}
          </>
        }
      />

      {session.status === 'cancelled' && session.cancellationReason ? (
        <Alert tone="danger" title="This session was cancelled" className="mb-4">
          {session.cancellationReason}
        </Alert>
      ) : null}

      {session.status === 'completed' ? (
        <Alert tone="success" title="Completed" className="mb-4">
          {counts.completed} of {counts.completed + counts.enrolled} enrolled students completed
          this session
          {session.feedbackScore !== null ? `, rated ${session.feedbackScore} / 5` : ''}.
          {session.report ? ` ${session.report}` : ''}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrolled" value={counts.enrolled} icon={Users} />
        <StatCard label="Seats remaining" value={seatsRemaining} />
        <StatCard label="Completed" value={counts.completed} icon={CheckCircle2} />
        <StatCard
          label="Completion rate"
          value={
            counts.completed + counts.enrolled > 0
              ? formatPercent((counts.completed / (counts.completed + counts.enrolled)) * 100)
              : '—'
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Category', value: toTitleCase(session.trainingType) },
                { label: 'Mode', value: toTitleCase(session.mode) },
                { label: 'Capacity', value: session.capacity },
                { label: 'Departments', value: relationLabels(session.departmentIds) },
                { label: 'Batches', value: relationLabels(session.batchIds) },
                { label: 'Trainers', value: session.trainerIds.length },
                { label: 'Description', value: session.description, full: true },
              ]}
            />

            <div className="mt-4 space-y-2 text-sm">
              {session.location ? (
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {session.location}
                </p>
              ) : null}

              {session.meetingLink ? (
                <p className="flex items-center gap-2">
                  <Video className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a
                    href={session.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary hover:underline"
                  >
                    Join the meeting
                  </a>
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <StatusBadge status={session.status} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Roster</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {activeRoster.length} enrolled · {seatsRemaining} seat
                {seatsRemaining === 1 ? '' : 's'} remaining
              </p>
            </div>

            {canManage && selectedStudents.length > 0 ? (
              <Button variant="danger" size="sm" onClick={() => setDialog('withdraw')}>
                <UserMinus aria-hidden />
                Withdraw {selectedStudents.length}
              </Button>
            ) : null}
          </CardHeader>

          <CardContent className="px-0">
            {canManage && isOpen ? (
              <div className="mb-3 flex flex-wrap items-end gap-2 px-5">
                <label className="min-w-48 flex-1 space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Enrol a whole batch
                  </span>
                  <Select
                    value={enrolBatch}
                    onChange={(event) => setEnrolBatch(event.target.value)}
                    placeholder="Choose a batch"
                    aria-label="Batch to enrol"
                    options={(batches.data?.items ?? []).map((batch) => ({
                      value: batch.id,
                      label: `${batch.code} (${batch.stats.totalStudents} students)`,
                    }))}
                  />
                </label>

                <Button
                  size="sm"
                  disabled={!enrolBatch}
                  isLoading={enrol.isPending}
                  onClick={() =>
                    enrol.mutate(
                      { batchIds: [enrolBatch] },
                      { onSuccess: () => setEnrolBatch('') },
                    )
                  }
                >
                  <UserPlus aria-hidden />
                  Enrol batch
                </Button>
              </div>
            ) : null}

            {roster.length > 0 ? (
              <ul className="divide-y divide-border">
                {roster.map((entry) => {
                  const isSelected = selectedStudents.includes(entry.studentId);

                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-5 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {canManage && entry.status !== 'withdrawn' ? (
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            checked={isSelected}
                            onChange={() =>
                              setSelectedStudents((current) =>
                                current.includes(entry.studentId)
                                  ? current.filter((id) => id !== entry.studentId)
                                  : [...current, entry.studentId],
                              )
                            }
                            aria-label={`Select ${entry.rollNumber}`}
                          />
                        ) : null}

                        <div className="min-w-0">
                          <Link
                            href={`/college/students/${entry.studentId}`}
                            className="truncate text-sm font-medium text-primary hover:underline"
                          >
                            {entry.rollNumber}
                          </Link>
                          {entry.name ? (
                            <p className="truncate text-xs text-muted-foreground">{entry.name}</p>
                          ) : null}
                        </div>
                      </div>

                      <StatusBadge status={entry.status} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Users}
                title="Nobody enrolled yet"
                description={
                  canManage && isOpen
                    ? 'Enrol a batch above to fill this session.'
                    : 'Students appear here once enrolled.'
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ReasonDialog
        open={dialog === 'cancel'}
        title="Cancel this session?"
        description={`Every one of the ${counts.enrolled} enrolled students is notified, and the reason you give is included.`}
        label="Reason for cancelling"
        placeholder="The trainer withdrew at short notice."
        confirmLabel="Cancel session"
        tone="danger"
        minLength={10}
        isPending={cancelSession.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          cancelSession.mutate(reason, { onSuccess: () => setDialog(null) })
        }
      />

      <ReasonDialog
        open={dialog === 'withdraw'}
        title={`Withdraw ${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'}?`}
        description="Their seats are freed immediately and can be filled by someone else."
        label="Reason"
        placeholder="Timetable clash with laboratory sessions."
        confirmLabel="Withdraw"
        tone="danger"
        minLength={0}
        isPending={withdraw.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          withdraw.mutate(
            { studentIds: selectedStudents, reason: reason || undefined },
            {
              onSuccess: () => {
                setDialog(null);
                setSelectedStudents([]);
              },
            },
          )
        }
      />
    </RouteGuard>
  );
}
