'use client';

import { Award, Briefcase, Building2, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  useCompanies,
  usePlacementAnalytics,
  usePlacements,
  type Placement,
} from '@/api/placement-queries';
import { useDepartments } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import {
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  formatCtc,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** The last handful of academic years, newest first. */
function academicYearOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  // An academic year turns over in June, so before then we are still in the
  // one that started last calendar year.
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;

  return Array.from({ length: 5 }, (_, index) => {
    const start = startYear - index;
    const value = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
    return { value, label: value };
  });
}

export default function PlacementDashboardPage() {
  const { user } = useAuth();
  const [academicYear, setAcademicYear] = useState('');

  /**
   * Every section is gated, because the roles that reach this page differ
   * sharply: a placement officer holds the lot, while a HOD holds
   * `placement:read_all` and neither `placement:report` nor `company:read`.
   * A gate here is not decoration — an ungated hook would fire a request the
   * server answers with a 403.
   */
  const mayReport = can(user?.permissions, 'placement:report');
  const mayReadCompanies = can(user?.permissions, 'company:read');
  const mayReadDepartments = can(user?.permissions, 'department:read');
  const mayReadJobs = can(user?.permissions, 'job:read');

  const filters = academicYear ? { academicYear } : {};

  const analytics = usePlacementAnalytics(filters, mayReport);
  const recent = usePlacements({ ...filters, limit: 8, sort: '-offerDate' });
  const companies = useCompanies({ limit: 200, sort: 'name' }, mayReadCompanies);
  const departments = useDepartments({ limit: 100 }, { enabled: mayReadDepartments });

  const departmentNames = new Map(
    (departments.data?.items ?? []).map((entry) => [entry.id, entry.name]),
  );
  const companyNames = new Map(
    (companies.data?.items ?? []).map((entry) => [entry.id, entry.name]),
  );

  const columns: Column<Placement>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (placement) => {
        const student = typeof placement.studentId === 'object' ? placement.studentId : null;

        return (
          <div className="min-w-0">
            <Link
              href={`/college/placements/offers/${placement.id}`}
              className="block truncate font-medium text-primary hover:underline"
            >
              {personName(student)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{student?.rollNumber ?? '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'company',
      header: 'Company',
      render: (placement) => (
        <span className="text-muted-foreground">{relationField(placement.companyId, 'name')}</span>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (placement) => <span className="text-muted-foreground">{placement.designation}</span>,
    },
    {
      key: 'package.ctc',
      header: 'Package',
      align: 'right',
      render: (placement) => (
        <span className="whitespace-nowrap tabular">
          {formatCtc(placement.package.ctc, placement.package.currency)}
        </span>
      ),
    },
    {
      key: 'joiningDate',
      header: 'Joining',
      render: (placement) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(placement.joiningDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (placement) => (
        <Badge tone={PLACEMENT_STATUS_TONES[placement.status]}>
          {PLACEMENT_STATUS_LABELS[placement.status]}
        </Badge>
      ),
    },
  ];

  const statusBreakdown = analytics.data
    ? ([
        ['Offered', analytics.data.offered],
        ['Accepted', analytics.data.accepted],
        ['Joined', analytics.data.joined],
        ['Declined', analytics.data.declined],
        ['Did not join', analytics.data.notJoined],
        ['Withdrawn', analytics.data.revoked],
      ] as const)
    : [];

  const breakdownTotal = statusBreakdown.reduce((sum, [, count]) => sum + count, 0);

  return (
    <RouteGuard permissions={['placement:read_all']}>
      <Breadcrumbs items={[{ label: 'Placement' }]} />

      <PageHeader
        title="Placement"
        description="How the year is going, across every drive."
        actions={
          <>
            <Select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              aria-label="Filter by academic year"
              placeholder="All years"
              options={academicYearOptions()}
            />

            <Button variant="outline" asChild>
              <Link href="/college/placements/offers">All offers</Link>
            </Button>
          </>
        }
      />

      {!mayReport ? (
        <Alert tone="info" title="Figures are not available to you" className="mb-4">
          Placement reporting needs the reporting permission. The recent offers below are still
          shown, because you may read placement records.
        </Alert>
      ) : null}

      {mayReport ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Offers made"
              value={analytics.data?.totalOffers}
              icon={Award}
              isLoading={analytics.isLoading}
            />
            <StatCard
              label="Accepted"
              value={analytics.data?.accepted}
              isLoading={analytics.isLoading}
            />
            <StatCard
              label="Joined"
              value={analytics.data?.joined}
              icon={Users}
              isLoading={analytics.isLoading}
            />
            <StatCard
              label="Placement rate"
              value={analytics.data?.placementPercentage}
              suffix="%"
              icon={TrendingUp}
              isLoading={analytics.isLoading}
            />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Package</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Across {analytics.data?.placedStudents ?? 0} placed student
                  {analytics.data?.placedStudents === 1 ? '' : 's'}.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ['Highest', analytics.data?.highestCtc],
                    ['Median', analytics.data?.medianCtc],
                    ['Average', analytics.data?.averageCtc],
                    ['Lowest', analytics.data?.lowestCtc],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="font-medium tabular">{formatCtc(value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where the offers stand</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {analytics.data?.placedStudents ?? 0} of {analytics.data?.totalStudents ?? 0}{' '}
                  active students hold a live primary offer.
                </p>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {breakdownTotal === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No offers recorded for this period.
                  </p>
                ) : (
                  statusBreakdown.map(([label, count]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular">{count}</span>
                      </div>
                      {/* A proportion bar, not a chart library. */}
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((count / breakdownTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Departments resolve to names only where the caller may read them. */}
            {mayReadDepartments ? (
              <Card>
                <CardHeader>
                  <CardTitle>By department</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Students holding a live primary offer.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {(analytics.data?.byDepartment ?? []).length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nothing recorded yet.
                    </p>
                  ) : (
                    (analytics.data?.byDepartment ?? []).map((row) => (
                      <div
                        key={row.departmentId}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {departmentNames.get(row.departmentId) ?? 'Unknown department'}
                        </span>
                        <span className="whitespace-nowrap">
                          <span className="font-medium tabular">{row.placed}</span>
                          <span className="ml-2 text-xs text-muted-foreground tabular">
                            {formatCtc(row.highestCtc)}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Recruiter names need `company:read`, which a HOD does not hold. */}
          {mayReadCompanies ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Top recruiters</CardTitle>
                <p className="text-sm text-muted-foreground">
                  By offers made, counting offered, accepted and joined.
                </p>
              </CardHeader>
              <CardContent>
                {(analytics.data?.topRecruiters ?? []).length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="No recruiters yet"
                    description="Companies appear here once they have made an offer."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(analytics.data?.topRecruiters ?? []).map((row) => (
                      <div
                        key={row.companyId}
                        className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {companyNames.get(row.companyId) ?? 'Unknown company'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.offers} offer{row.offers === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-sm tabular">
                          {formatCtc(row.highestCtc)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Recent offers</CardTitle>
            <p className="text-sm text-muted-foreground">The eight most recently made.</p>
          </div>

          {mayReadJobs ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/college/placements/jobs">
                <Briefcase aria-hidden />
                Drives
              </Link>
            </Button>
          ) : null}
        </CardHeader>

        <CardContent>
          <DataTable
            columns={columns}
            rows={recent.data?.items}
            rowKey={(placement) => placement.id}
            isLoading={recent.isLoading}
            isFetching={recent.isFetching}
            error={recent.error}
            onRetry={() => void recent.refetch()}
            emptyTitle="No offers yet"
            emptyDescription="Offers appear here as the office records them against selected candidates."
          />
        </CardContent>
      </Card>
    </RouteGuard>
  );
}
