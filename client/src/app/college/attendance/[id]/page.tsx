'use client';

import type { AttendanceStatus } from '@peacefic/shared';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useMarkAttendance } from '@/api/mutations';
import { useAttendanceSheet } from '@/api/queries';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/badge';
import { cn, formatDate, formatPercent } from '@/lib/utils';

/** Ordered so the common actions sit leftmost under the thumb. */
const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; short: string }> = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'absent', label: 'Absent', short: 'A' },
  { value: 'late', label: 'Late', short: 'L' },
  { value: 'on_duty', label: 'On duty', short: 'OD' },
  { value: 'excused', label: 'Excused', short: 'E' },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-success text-success-foreground border-success',
  absent: 'bg-danger text-danger-foreground border-danger',
  late: 'bg-warning text-warning-foreground border-warning',
  on_duty: 'bg-info text-info-foreground border-info',
  excused: 'bg-muted text-foreground border-border',
};

export default function MarkAttendancePage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const sheet = useAttendanceSheet(sessionId);
  const markAttendance = useMarkAttendance(sessionId);

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [touched, setTouched] = useState(false);

  // Seeded from whatever is already saved so a partially marked session
  // reopens in the state it was left in.
  useEffect(() => {
    if (!sheet.data) return;

    const initial: Record<string, AttendanceStatus> = {};
    for (const row of sheet.data.roster) {
      if (row.status) initial[row.studentId] = row.status as AttendanceStatus;
    }
    setMarks(initial);
    setTouched(false);
  }, [sheet.data]);

  const roster = sheet.data?.roster ?? [];
  const markedCount = Object.keys(marks).length;
  const allMarked = roster.length > 0 && markedCount === roster.length;

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const status of Object.values(marks)) {
      tally[status] = (tally[status] ?? 0) + 1;
    }
    return tally;
  }, [marks]);

  function setStatus(studentId: string, status: AttendanceStatus): void {
    setMarks((current) => ({ ...current, [studentId]: status }));
    setTouched(true);
  }

  /** Marking 60 students individually is the slow path; this is the fast one. */
  function markAllPresent(): void {
    const next: Record<string, AttendanceStatus> = {};
    for (const row of roster) next[row.studentId] = 'present';
    setMarks(next);
    setTouched(true);
  }

  function submit(lockAfterMarking: boolean): void {
    markAttendance.mutate({
      entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
      lockAfterMarking,
    });
    setTouched(false);
  }

  if (sheet.isLoading) return <FullPageSpinner label="Loading the roster" />;

  if (sheet.isError) {
    return (
      <ErrorState
        title="Could not load this session"
        message={sheet.error.message}
        requestId={sheet.error.requestId}
        onRetry={() => void sheet.refetch()}
      />
    );
  }

  if (!sheet.data) return <FullPageSpinner label="Loading" />;

  const { session } = sheet.data;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3" asChild>
        <Link href="/college/attendance">
          <ArrowLeft aria-hidden />
          Back to sessions
        </Link>
      </Button>

      <PageHeader
        title={`Attendance · ${formatDate(session.date)}`}
        description={`${session.startTime}–${session.endTime} · ${session.topic ?? session.type}`}
        actions={<StatusBadge status={session.status} />}
      />

      {session.isLocked ? (
        <Alert tone="info" title="This session is locked" className="mb-4">
          It can no longer be changed here. An administrator with the override permission can
          unlock it if a correction is genuinely needed.
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
                  {option.label}: <strong className="text-foreground">{counts[option.value]}</strong>
                </span>
              ) : null,
            )}
          </div>

          {!session.isLocked ? (
            <Button variant="outline" size="sm" onClick={markAllPresent}>
              <Check aria-hidden />
              Mark all present
            </Button>
          ) : null}
        </CardContent>
      </Card>

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
                  <p className="font-medium">{row.rollNumber}</p>
                  {row.remarks ? (
                    <p className="text-xs text-muted-foreground">{row.remarks}</p>
                  ) : null}
                </div>

                {/* A radio group, not five buttons: exactly one status applies,
                    and arrow keys move between them. */}
                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${row.rollNumber}`}
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
                        disabled={session.isLocked}
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

      {!session.isLocked ? (
        // Sticky so the action stays reachable on a 60-row roster without
        // scrolling back to the top.
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {allMarked
              ? 'Everyone has been marked.'
              : `${roster.length - markedCount} student${roster.length - markedCount === 1 ? '' : 's'} still unmarked.`}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => submit(true)}
              disabled={markedCount === 0 || markAttendance.isPending}
              title="Save and prevent further changes"
            >
              <Lock aria-hidden />
              Save and lock
            </Button>

            <Button
              onClick={() => submit(false)}
              isLoading={markAttendance.isPending}
              loadingText="Saving"
              disabled={markedCount === 0}
            >
              Save attendance
            </Button>
          </div>
        </div>
      ) : null}

      {touched && !markAttendance.isPending ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          You have unsaved changes.
        </p>
      ) : null}

      {session.stats.totalStudents > 0 ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Last saved: {formatPercent(session.stats.percentage)} attendance across{' '}
          {session.stats.totalStudents} students.
        </p>
      ) : null}
    </>
  );
}
