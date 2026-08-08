'use client';

import { Building2, CalendarCheck, GraduationCap, Users } from 'lucide-react';
import Link from 'next/link';

import {
  useAttendanceDefaulters,
  useAttendanceTrend,
  useBatches,
  useDepartments,
  useFaculty,
  useStudents,
} from '@/api/queries';
import { PageHeader } from '@/components/layout/app-shell';
import { AttendanceTrendChart } from '@/components/charts/attendance-trend-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function CollegeDashboardPage() {
  const { user } = useAuth();

  // Every figure comes from the API. Nothing here is hard-coded.
  const students = useStudents({ limit: 1 });
  const faculty = useFaculty({ limit: 1 });
  const departments = useDepartments({ limit: 1 });
  const batches = useBatches({ limit: 1 });
  const defaulters = useAttendanceDefaulters();
  const trend = useAttendanceTrend();

  // Newest first, so the panels reflect what was just created.
  const recentDepartments = useDepartments({ limit: 5, sort: '-createdAt', include: 'hodId' });
  const recentBatches = useBatches({ limit: 5, sort: '-createdAt' });

  const canSeeAttendance = can(user?.permissions, 'attendance:read');

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user?.firstName ?? 'there'}`}
        description="A live view of your institution."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          value={students.data?.pagination.totalItems}
          icon={Users}
          isLoading={students.isLoading}
        />
        <StatCard
          label="Faculty"
          value={faculty.data?.pagination.totalItems}
          icon={Users}
          isLoading={faculty.isLoading}
        />
        <StatCard
          label="Departments"
          value={departments.data?.pagination.totalItems}
          icon={Building2}
          isLoading={departments.isLoading}
        />
        <StatCard
          label="Active batches"
          value={batches.data?.pagination.totalItems}
          icon={GraduationCap}
          isLoading={batches.isLoading}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Latest departments</CardTitle>
            {can(user?.permissions, 'department:read') ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/college/departments">View all</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="px-0">
            {recentDepartments.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-10" />
                ))}
              </div>
            ) : recentDepartments.data && recentDepartments.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentDepartments.data.items.map((department) => (
                  <li
                    key={department.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/college/departments/${department.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {department.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{department.name}</p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {department.stats.totalStudents} students
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Building2}
                title="No departments yet"
                description="Departments organise your batches, students and staff."
                action={
                  can(user?.permissions, 'department:create') ? (
                    <Button size="sm" asChild>
                      <Link href="/college/departments/new">Add department</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Latest batches</CardTitle>
            {can(user?.permissions, 'batch:read') ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/college/batches">View all</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="px-0">
            {recentBatches.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-10" />
                ))}
              </div>
            ) : recentBatches.data && recentBatches.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentBatches.data.items.map((batch) => (
                  <li key={batch.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/college/batches/${batch.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {batch.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        Semester {batch.currentSemester}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {batch.stats.totalStudents} / {batch.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No batches yet"
                description="Batches hold students and drive attendance."
                action={
                  can(user?.permissions, 'batch:create') ? (
                    <Button size="sm" asChild>
                      <Link href="/college/batches/new">Add batch</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {canSeeAttendance ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Attendance over the last 30 days</CardTitle>
              <CardDescription>
                Daily attendance across the batches you can see.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trend.isError ? (
                <ErrorState
                  message={trend.error.message}
                  requestId={trend.error.requestId}
                  onRetry={() => void trend.refetch()}
                />
              ) : (
                <AttendanceTrendChart data={trend.data ?? []} isLoading={trend.isLoading} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance shortfall</CardTitle>
              <CardDescription>
                {defaulters.data
                  ? `Below the ${formatPercent(defaulters.data.threshold, 0)} requirement`
                  : 'Students below the requirement'}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {defaulters.isLoading ? (
                <div className="space-y-2 px-5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="skeleton h-10" />
                  ))}
                </div>
              ) : defaulters.isError ? (
                <ErrorState
                  message={defaulters.error.message}
                  onRetry={() => void defaulters.refetch()}
                />
              ) : defaulters.data && defaulters.data.count > 0 ? (
                <>
                  <ul className="divide-y divide-border">
                    {defaulters.data.students.slice(0, 6).map((student) => (
                      <li
                        key={student.studentId}
                        className="flex items-center justify-between gap-3 px-5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{student.rollNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {/* The number a student can act on. */}
                            Needs {student.sessionsNeededForThreshold} more session
                            {student.sessionsNeededForThreshold === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="tabular shrink-0 text-sm font-semibold text-danger">
                          {formatPercent(student.percentage)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {defaulters.data.count > 6 ? (
                    <div className="px-5 pt-3">
                      <Button variant="outline" size="sm" block asChild>
                        <Link href="/college/attendance/defaulters">
                          View all {defaulters.data.count}
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={CalendarCheck}
                  title="Everyone is above the threshold"
                  description="No student is currently below the required attendance."
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
