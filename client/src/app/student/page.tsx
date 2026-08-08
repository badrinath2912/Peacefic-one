'use client';

import { CalendarCheck, CheckCircle2, TriangleAlert } from 'lucide-react';

import { useOwnAttendance, useOwnStudentProfile } from '@/api/queries';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/badge';
import { formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const profile = useOwnStudentProfile();
  const attendance = useOwnAttendance();

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.firstName ?? 'there'}`}
        description={
          profile.data ? `Roll number ${profile.data.rollNumber}` : 'Your learning at a glance.'
        }
      />

      {/* The single most actionable thing a student can be told. */}
      {attendance.data?.isBelowThreshold ? (
        <Alert tone="warning" title="Your attendance is below the requirement" className="mb-4">
          You are at {formatPercent(attendance.data.percentage)} against a required{' '}
          {formatPercent(attendance.data.threshold, 0)}. Attending your next{' '}
          {attendance.data.sessionsNeededForThreshold} session
          {attendance.data.sessionsNeededForThreshold === 1 ? '' : 's'} brings you back above it.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance"
          value={
            attendance.data ? formatPercent(attendance.data.percentage) : undefined
          }
          icon={CalendarCheck}
          isLoading={attendance.isLoading}
        />
        <StatCard
          label="Sessions attended"
          value={
            attendance.data
              ? `${attendance.data.counts.present + attendance.data.counts.late + attendance.data.counts.onDuty} / ${attendance.data.counts.total}`
              : undefined
          }
          icon={CheckCircle2}
          isLoading={attendance.isLoading}
        />
        <StatCard
          label="Current CGPA"
          value={profile.data?.academics.currentCgpa ?? '—'}
          isLoading={profile.isLoading}
        />
        <StatCard
          label="Active backlogs"
          value={profile.data?.academics.activeBacklogs}
          icon={TriangleAlert}
          isLoading={profile.isLoading}
          invertDelta
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent attendance</CardTitle>
          <CardDescription>Your most recently marked sessions.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {attendance.isLoading ? (
            <div className="space-y-2 px-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-10" />
              ))}
            </div>
          ) : attendance.isError ? (
            <ErrorState
              message={attendance.error.message}
              requestId={attendance.error.requestId}
              onRetry={() => void attendance.refetch()}
            />
          ) : attendance.data && attendance.data.sessions.length > 0 ? (
            <ul className="divide-y divide-border">
              {attendance.data.sessions.slice(0, 8).map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(session.date)}</p>
                    {session.wasModified ? (
                      <p className="text-xs text-muted-foreground">Corrected after marking</p>
                    ) : null}
                  </div>
                  <StatusBadge status={session.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No attendance has been recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
