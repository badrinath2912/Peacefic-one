'use client';

import {
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Info,
  PencilLine,
  Target,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useOwnAttendance, type OwnAttendance } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

type Session = OwnAttendance['sessions'][number];

/** The five statuses the server tallies, in the order a student reads them. */
const BREAKDOWN: Array<{ key: keyof OwnAttendance['counts']; label: string; status: string }> = [
  { key: 'present', label: 'Present', status: 'present' },
  { key: 'absent', label: 'Absent', status: 'absent' },
  { key: 'late', label: 'Late', status: 'late' },
  { key: 'excused', label: 'Excused', status: 'excused' },
  { key: 'onDuty', label: 'On duty', status: 'on_duty' },
];

/**
 * A `type="date"` input reports every keystroke, so a half-typed value arrives
 * here as something `new Date()` cannot parse — and `toISOString()` throws on an
 * invalid date. Nothing is sent until the value is a complete, real date.
 *
 * `end` pushes the value to the last moment of the chosen day, because the
 * server compares against `$lte`: a "to" of 15 March should include 15 March.
 */
function parseDateInput(value: string, end = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  if (Number.isNaN(parsed.getTime())) return undefined;
  // Rejects a real-looking but impossible date, e.g. 2026-02-31.
  if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return undefined;

  return parsed;
}

/**
 * The student's own attendance.
 *
 * Everything shown is read from `GET /attendance/me`, which resolves the student
 * from the token. The percentage, the threshold and the shortfall are all server
 * values — none of that arithmetic is repeated here, so the page cannot disagree
 * with the record.
 *
 * The figures are overall attendance. The server queries `courseId: null`, so
 * there is no per-subject breakdown to show and none is fabricated.
 */
export default function StudentAttendancePage() {
  const { user } = useAuth();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const mayRead = can(user?.permissions, 'attendance:read_own');

  // Only complete dates reach the query key, so a half-typed value neither
  // refetches nor throws.
  const params = useMemo(() => {
    const range: Record<string, unknown> = {};

    const fromDate = parseDateInput(from);
    const toDate = parseDateInput(to, true);

    if (fromDate) range.from = fromDate;
    if (toDate) range.to = toDate;

    return range;
  }, [from, to]);

  const attendance = useOwnAttendance(params, mayRead);
  const data = attendance.data;

  const hasRange = Boolean(params.from || params.to);
  const invalidRange =
    Boolean(params.from && params.to) && (params.from as Date) > (params.to as Date);

  const columns: Column<Session>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (session) => (
        <span className="whitespace-nowrap font-medium">{formatDate(session.date)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (session) => <StatusBadge status={session.status} />,
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (session) =>
        session.remarks ? (
          <span className="text-sm">{session.remarks}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'wasModified',
      header: 'Corrected',
      align: 'center',
      render: (session) =>
        session.wasModified ? (
          <Badge tone="info" className="gap-1">
            <PencilLine className="size-3" aria-hidden />
            Corrected
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  function clearRange(): void {
    setFrom('');
    setTo('');
  }

  return (
    <RouteGuard permissions={['attendance:read_own']}>
      <PageHeader
        title="Attendance"
        description="Track your attendance, session history, and threshold status."
        actions={
          data?.rollNumber ? (
            <Badge tone="outline" className="px-2.5 py-1">
              Roll number {data.rollNumber}
            </Badge>
          ) : null
        }
      />

      {attendance.isError ? (
        <ErrorState
          title="Could not load your attendance"
          message="Something went wrong while fetching your record. Please try again."
          requestId={attendance.error.requestId}
          onRetry={() => void attendance.refetch()}
        />
      ) : (
        <>
          {/* The single most actionable thing this page can say, stated first. */}
          {data?.isBelowThreshold ? (
            <Alert tone="warning" title="Attendance needs attention" className="mb-4">
              Your current attendance is {formatPercent(data.percentage)}, below the required
              threshold of {formatPercent(data.threshold, 0)}.
              {data.sessionsNeededForThreshold > 0
                ? ` Around ${data.sessionsNeededForThreshold} more qualifying session${
                    data.sessionsNeededForThreshold === 1 ? '' : 's'
                  } would bring you back to the threshold.`
                : ''}
            </Alert>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Overall attendance"
              value={data ? formatPercent(data.percentage) : undefined}
              icon={CalendarCheck}
              isLoading={attendance.isLoading}
            />
            <StatCard
              label="Required threshold"
              value={data ? formatPercent(data.threshold, 0) : undefined}
              icon={Target}
              isLoading={attendance.isLoading}
            />
            <StatCard
              label="Total sessions"
              value={data ? data.counts.total : undefined}
              icon={CalendarRange}
              isLoading={attendance.isLoading}
            />
          </div>

          {/* Status and breakdown sit together: the verdict, then the figures
              it was reached from. */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Threshold status</CardTitle>
              </CardHeader>

              <CardContent>
                {attendance.isLoading || !data ? (
                  <div className="space-y-3">
                    <div className="skeleton h-6 w-40" />
                    <div className="skeleton h-2.5 w-full rounded-full" />
                    <div className="skeleton h-4 w-56" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {data.isBelowThreshold ? (
                        <>
                          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                          <span className="font-medium text-warning">Below threshold</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                          <span className="font-medium text-success">Meeting the threshold</span>
                        </>
                      )}
                    </div>

                    {/* The bar shows only the two server values, with the
                        threshold marked so the gap is visible at a glance. */}
                    <div
                      className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`Attendance ${formatPercent(
                        data.percentage,
                      )} against a required ${formatPercent(data.threshold, 0)}`}
                    >
                      <div
                        className={
                          data.isBelowThreshold
                            ? 'h-full rounded-full bg-warning'
                            : 'h-full rounded-full bg-success'
                        }
                        style={{ width: `${Math.min(Math.max(data.percentage, 0), 100)}%` }}
                      />
                      <span
                        className="absolute inset-y-0 w-0.5 bg-foreground/45"
                        style={{ left: `${Math.min(Math.max(data.threshold, 0), 100)}%` }}
                        aria-hidden
                      />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {data.isBelowThreshold
                        ? data.sessionsNeededForThreshold > 0
                          ? `You need approximately ${data.sessionsNeededForThreshold} additional qualifying session${
                              data.sessionsNeededForThreshold === 1 ? '' : 's'
                            } to reach the threshold.`
                          : 'Your institution can tell you what is needed to recover the shortfall.'
                        : `You are at ${formatPercent(
                            data.percentage,
                          )} against a required ${formatPercent(data.threshold, 0)}.`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session breakdown</CardTitle>
              </CardHeader>

              <CardContent>
                {attendance.isLoading || !data ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="skeleton h-9 w-full rounded-md" />
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-2" aria-label="Session breakdown">
                    {BREAKDOWN.map((entry) => (
                      <li
                        key={entry.key}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <StatusBadge status={entry.status} />
                        <span className="tabular text-sm font-medium">
                          {data.counts[entry.key]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ----------------------------- date range ----------------------------- */}

          <Card className="mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-2">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  aria-label="From date"
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-9 rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-2">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  aria-label="To date"
                  onChange={(event) => setTo(event.target.value)}
                  className="h-9 rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              {hasRange ? (
                <Button variant="ghost" size="sm" onClick={clearRange}>
                  <X aria-hidden />
                  Clear dates
                </Button>
              ) : null}
            </div>

            {invalidRange ? (
              <p className="mt-2 text-xs text-danger" role="alert">
                The start date is after the end date, so nothing will match.
              </p>
            ) : null}
          </Card>

          {/* --------------------------- session history --------------------------- */}

          <h2 className="mb-3 text-sm font-semibold">Session history</h2>

          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={data?.sessions}
              rowKey={(session) => session.id}
              isLoading={attendance.isLoading}
              isFetching={attendance.isFetching}
              emptyTitle={
                hasRange ? 'No sessions in the selected period' : 'No attendance recorded yet'
              }
              emptyDescription={
                hasRange
                  ? 'Try a wider date range, or clear the dates.'
                  : 'Sessions appear here once your institution starts marking attendance.'
              }
              emptyAction={
                hasRange ? (
                  <Button variant="outline" size="sm" onClick={clearRange}>
                    Clear dates
                  </Button>
                ) : undefined
              }
            />
          </div>

          {/* Four columns are cramped on a phone, so the same rows become cards. */}
          <div className="space-y-3 lg:hidden">
            {attendance.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="skeleton h-24 w-full rounded-lg" />
              ))
            ) : (data?.sessions.length ?? 0) === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={CalendarCheck}
                    title={
                      hasRange ? 'No sessions in the selected period' : 'No attendance recorded yet'
                    }
                    description={
                      hasRange
                        ? 'Try a wider date range, or clear the dates.'
                        : 'Sessions appear here once your institution starts marking attendance.'
                    }
                    action={
                      hasRange ? (
                        <Button variant="outline" size="sm" onClick={clearRange}>
                          Clear dates
                        </Button>
                      ) : undefined
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              data?.sessions.map((session) => (
                <Card key={session.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{formatDate(session.date)}</p>
                    <StatusBadge status={session.status} />
                  </div>

                  {session.remarks ? (
                    <p className="mt-2 text-sm text-muted-foreground">{session.remarks}</p>
                  ) : null}

                  {session.wasModified ? (
                    <Badge tone="info" className="mt-2 gap-1">
                      <PencilLine className="size-3" aria-hidden />
                      Corrected
                    </Badge>
                  ) : null}
                </Card>
              ))
            )}
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Attendance shown here reflects your overall attendance across all sessions. If a
              record looks wrong, speak to your class advisor — corrections are made by your
              institution.
            </span>
          </p>
        </>
      )}
    </RouteGuard>
  );
}
