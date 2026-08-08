'use client';

import { BarChart3, Building2, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useBatches, useDepartments } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { BatchAnalyticsRow, DepartmentAnalyticsRow } from '@/components/analytics/analytics-row';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { can } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

/**
 * College analytics.
 *
 * The API offers exactly two analytics endpoints, both per-id and both without
 * a single query parameter: `/departments/:id/analytics` and
 * `/batches/:id/analytics`. So this page does the one thing those endpoints
 * cannot do individually — put them side by side — rather than repeating the
 * department and batch detail pages, which already show one at a time.
 *
 * Nothing is totalled across rows. The API publishes no college-wide figure and
 * summing one here would be inventing a statistic the server never computed.
 */
export default function AnalyticsPage() {
  const { user } = useAuth();
  const [departmentId, setDepartmentId] = useState('');

  const permissions = user?.permissions;

  /**
   * Three separate permissions, three separate gates. `analytics:read` covers
   * the figures; listing the departments and batches to ask about needs their
   * own read permissions, which not every analytics reader holds.
   */
  const mayReadAnalytics = can(permissions, 'analytics:read');
  const mayReadDepartments = can(permissions, 'department:read');
  const mayReadBatches = can(permissions, 'batch:read');

  const departments = useDepartments(
    { limit: 100, status: 'active' },
    { enabled: mayReadDepartments },
  );

  /**
   * Gated twice: on the permission, and on a department having been chosen.
   * Without the second, landing on the page would list every batch in the
   * college for a table that shows none of them.
   */
  const batches = useBatches(
    { limit: 100, departmentId, status: 'active' },
    mayReadBatches && Boolean(departmentId),
  );

  const departmentRows = departments.data?.items ?? [];
  const batchRows = departmentId ? (batches.data?.items ?? []) : [];

  return (
    <RouteGuard permissions={['analytics:read', 'analytics:read_all']}>
      <Breadcrumbs items={[{ label: 'Analytics' }]} />

      <PageHeader
        title="Analytics"
        description="Departments and batches side by side, as far as your access allows."
      />

      {/*
        No filters. Neither analytics endpoint accepts a query parameter — both
        are `validate({ params: idParamSchema })` — so a date range, academic
        year or status control would be stripped by validation and change
        nothing. The department picker below is not a filter on the analytics
        API; it chooses which batches to ask about.
      */}

      {!mayReadDepartments ? (
        <EmptyState
          icon={BarChart3}
          title="Analytics are not available to you"
          description="Comparing departments needs permission to list them. Your account cannot, so there is nothing to compare."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Building2 className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Departments</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Each row is fetched on its own, so a department outside your scope is marked
                  rather than failing the table.
                </p>
              </div>
            </CardHeader>

            <CardContent>
              {departments.isError ? (
                <ErrorState
                  title="Could not load departments"
                  message={departments.error.message}
                  requestId={departments.error.requestId}
                  onRetry={() => void departments.refetch()}
                />
              ) : departments.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((key) => (
                    <div key={key} className="skeleton h-10 w-full rounded" />
                  ))}
                </div>
              ) : departmentRows.length === 0 ? (
                <EmptyState
                  title="No active departments"
                  description="Add a department before there is anything to compare."
                  action={
                    <Button size="sm" asChild>
                      <Link href="/college/departments">Departments</Link>
                    </Button>
                  }
                />
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Students</TableHead>
                        <TableHead className="text-right">Batches</TableHead>
                        <TableHead className="text-right">Faculty</TableHead>
                        <TableHead className="text-right">Placed</TableHead>
                        <TableHead className="text-right">Placement rate</TableHead>
                        <TableHead className="text-right">Average CGPA</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {departmentRows.map((department) => (
                        <DepartmentAnalyticsRow
                          key={department.id}
                          id={department.id}
                          name={department.name}
                          code={department.code}
                          enabled={mayReadAnalytics}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              )}
            </CardContent>
          </Card>

          {mayReadBatches ? (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <GraduationCap className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <CardTitle>Batches</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Choose a department to compare the batches within it.
                    </p>
                  </div>
                </div>

                <div className="w-56 shrink-0">
                  <Select
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    aria-label="Choose a department"
                    placeholder="Choose a department"
                    options={departmentRows.map((department) => ({
                      value: department.id,
                      label: department.name,
                    }))}
                  />
                </div>
              </CardHeader>

              <CardContent>
                {!departmentId ? (
                  <EmptyState
                    icon={GraduationCap}
                    title="Choose a department"
                    description="Batch figures are shown one department at a time, because the API answers per batch."
                  />
                ) : batches.isError ? (
                  <ErrorState
                    title="Could not load batches"
                    message={batches.error.message}
                    requestId={batches.error.requestId}
                    onRetry={() => void batches.refetch()}
                  />
                ) : batches.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1].map((key) => (
                      <div key={key} className="skeleton h-10 w-full rounded" />
                    ))}
                  </div>
                ) : batchRows.length === 0 ? (
                  <EmptyState
                    title="No active batches in this department"
                    description="Nothing to compare here yet."
                  />
                ) : (
                  <TableWrapper>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Semester</TableHead>
                          <TableHead className="text-right">Students</TableHead>
                          <TableHead className="text-right">Capacity</TableHead>
                          <TableHead className="text-right">Utilisation</TableHead>
                          <TableHead className="text-right">Placed</TableHead>
                          <TableHead className="text-right">Placement rate</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {batchRows.map((batch) => (
                          <BatchAnalyticsRow
                            key={batch.id}
                            id={batch.id}
                            name={batch.name}
                            code={batch.code}
                            enabled={mayReadAnalytics}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrapper>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Alert tone="info" title="What these figures cover">
            Student counts, faculty counts and averages are computed by the server over active
            records only, and placement rate counts students holding an offer rather than offers
            made. Figures you cannot see are outside the scope your role allows, not missing.
          </Alert>
        </div>
      )}
    </RouteGuard>
  );
}
