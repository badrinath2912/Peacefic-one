'use client';

import { Check } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  useExamAttendance,
  useExamProfile,
  useExamRegistrations,
  useMarkExamAttendance,
} from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { personName, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

type ExamAttendanceStatus = 'present' | 'absent' | 'debarred' | 'malpractice';

/** Ordered so the two common outcomes sit leftmost. */
const STATUS_OPTIONS: Array<{ value: ExamAttendanceStatus; label: string; short: string }> = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'absent', label: 'Absent', short: 'A' },
  { value: 'debarred', label: 'Debarred', short: 'D' },
  { value: 'malpractice', label: 'Malpractice', short: 'M' },
];

const STATUS_STYLES: Record<ExamAttendanceStatus, string> = {
  present: 'bg-success text-success-foreground border-success',
  absent: 'bg-danger text-danger-foreground border-danger',
  debarred: 'bg-warning text-warning-foreground border-warning',
  malpractice: 'bg-danger text-danger-foreground border-danger',
};

export default function ExamAttendancePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const profile = useExamProfile(params.id);
  const registrations = useExamRegistrations(params.id, { limit: 500, include: 'studentId' });
  const attendance = useExamAttendance(params.id);
  const markAttendance = useMarkExamAttendance(params.id);

  const [marks, setMarks] = useState<Record<string, ExamAttendanceStatus>>({});
  const [touched, setTouched] = useState(false);

  // Seeded from what is already saved so a partly marked hall reopens as left.
  useEffect(() => {
    if (!attendance.data) return;

    const initial: Record<string, ExamAttendanceStatus> = {};
    for (const record of attendance.data) {
      const studentId =
        typeof record.studentId === 'string' ? record.studentId : record.studentId.id;
      initial[studentId] = record.status;
    }

    setMarks(initial);
    setTouched(false);
  }, [attendance.data]);

  const roster = useMemo(
    () =>
      (registrations.data?.items ?? [])
        .filter((row) => row.status !== 'withdrawn')
        .map((row) => ({
          studentId: typeof row.studentId === 'string' ? row.studentId : row.studentId.id,
          rollNumber: relationField(row.studentId, 'rollNumber'),
          name: personName(row.studentId),
          hallTicketNumber: row.hallTicketNumber,
          isBlocked: row.status === 'blocked',
        })),
    [registrations.data],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const status of Object.values(marks)) tally[status] = (tally[status] ?? 0) + 1;
    return tally;
  }, [marks]);

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
  const editable =
    ['published', 'completed'].includes(exam.status) && can(user?.permissions, 'attendance:mark');

  const markedCount = Object.keys(marks).length;

  function setStatus(studentId: string, status: ExamAttendanceStatus): void {
    setMarks((current) => ({ ...current, [studentId]: status }));
    setTouched(true);
  }

  /** Marking 200 candidates individually is the slow path; this is the fast one. */
  function markAllPresent(): void {
    const next: Record<string, ExamAttendanceStatus> = {};
    for (const row of roster) next[row.studentId] = 'present';
    setMarks(next);
    setTouched(true);
  }

  function submit(): void {
    markAttendance.mutate(
      {
        entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
      },
      { onSuccess: () => setTouched(false) },
    );
  }

  return (
    <RouteGuard permissions={['attendance:read', 'attendance:mark']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Attendance' },
        ]}
      />

      <PageHeader
        title="Exam attendance"
        description={`${exam.title} · absent, debarred and malpractice all fail the paper outright, whatever marks are later recorded.`}
      />

      <ExamTabs examId={exam.id} />

      {!editable ? (
        <Alert tone="info" title="Attendance is read-only here" className="mb-4">
          {exam.status === 'draft' || exam.status === 'scheduled'
            ? 'Publish the exam before recording who sat it.'
            : 'Attendance can only be changed while the exam is published or completed.'}
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="tabular">
              <strong>{markedCount}</strong>
              <span className="text-muted-foreground"> / {roster.length} marked</span>
            </span>

            {STATUS_OPTIONS.map((option) =>
              counts[option.value] ? (
                <span key={option.value} className="tabular text-muted-foreground">
                  {option.label}:{' '}
                  <strong className="text-foreground">{counts[option.value]}</strong>
                </span>
              ) : null,
            )}
          </div>

          {editable && roster.length > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllPresent}>
              <Check aria-hidden />
              Mark all present
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {registrations.isLoading ? (
        <FullPageSpinner label="Loading the hall list" />
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="Nobody to mark"
              description="Register candidates for this exam first."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {roster.map((row) => {
              const status = marks[row.studentId];

              return (
                <li
                  key={row.studentId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.hallTicketNumber}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {row.rollNumber}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{row.name}</p>
                    {row.isBlocked ? (
                      <Badge tone="danger" className="mt-1">
                        Blocked
                      </Badge>
                    ) : null}
                  </div>

                  {/* A radio group, not four buttons: exactly one outcome
                      applies, and arrow keys move between them. */}
                  <div
                    role="radiogroup"
                    aria-label={`Attendance for ${row.hallTicketNumber}`}
                    className="flex flex-wrap gap-1.5"
                  >
                    {STATUS_OPTIONS.map((option) => {
                      const selected = status === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!editable}
                          onClick={() => setStatus(row.studentId, option.value)}
                          className={cn(
                            'min-w-11 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            selected
                              ? STATUS_STYLES[option.value]
                              : 'border-border bg-surface text-muted-foreground hover:bg-muted',
                          )}
                          title={option.label}
                        >
                          <span aria-hidden>{option.short}</span>
                          <span className="sr-only">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {editable && roster.length > 0 ? (
        // Sticky so the action stays reachable on a 200-row hall list.
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {markedCount === roster.length
              ? 'Everyone has been marked.'
              : `${roster.length - markedCount} candidate${roster.length - markedCount === 1 ? '' : 's'} still unmarked.`}
          </p>

          <Button
            onClick={submit}
            isLoading={markAttendance.isPending}
            loadingText="Saving"
            disabled={markedCount === 0}
          >
            Save attendance
          </Button>
        </div>
      ) : null}

      {touched && !markAttendance.isPending ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">You have unsaved changes.</p>
      ) : null}
    </RouteGuard>
  );
}
