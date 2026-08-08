'use client';

import { Search, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useEligibleStudents, useJobProfile, type EligibleStudent } from '@/api/placement-queries';
import { useBatches, useDepartments } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { EligibilitySummary } from '@/components/placement/eligibility-summary';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { personName } from '@/lib/placement-display';
import { useAuth } from '@/providers/auth-provider';

/**
 * Everyone this job's criteria currently accept.
 *
 * The endpoint returns one array with no pagination and no search, so the
 * filtering below is client-side over what the server already sent — it is not
 * a second implementation of the eligibility rules, which stay on the server.
 */
export default function EligibleStudentsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const maySee = can(user?.permissions, 'application:read_all');

  const profile = useJobProfile(params.id);
  const students = useEligibleStudents(params.id, maySee);
  const departments = useDepartments({ limit: 100 });
  const batches = useBatches({ limit: 200 });

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [batchId, setBatchId] = useState('');

  const departmentNames = useMemo(
    () => new Map((departments.data?.items ?? []).map((entry) => [entry.id, entry.name])),
    [departments.data],
  );

  const batchNames = useMemo(
    () => new Map((batches.data?.items ?? []).map((entry) => [entry.id, entry.code])),
    [batches.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (students.data ?? []).filter((student) => {
      if (departmentId && student.departmentId !== departmentId) return false;
      if (batchId && student.batchId !== batchId) return false;
      if (!term) return true;

      return (
        student.rollNumber.toLowerCase().includes(term) ||
        personName(student.name).toLowerCase().includes(term)
      );
    });
  }, [students.data, search, departmentId, batchId]);

  const filtered = Boolean(search.trim() || departmentId || batchId);

  const columns: Column<EligibleStudent>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (student) => (
        <div className="min-w-0">
          {/* The controller returns the populated user under `name`. */}
          <p className="truncate font-medium">{personName(student.name)}</p>
          <p className="truncate text-xs text-muted-foreground">{student.rollNumber}</p>
        </div>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (student) => (
        <span className="text-muted-foreground">
          {departmentNames.get(student.departmentId) ?? '—'}
        </span>
      ),
    },
    {
      key: 'batchId',
      header: 'Batch',
      render: (student) => (
        <span className="text-muted-foreground">{batchNames.get(student.batchId) ?? '—'}</span>
      ),
    },
    {
      key: 'cgpa',
      header: 'CGPA',
      align: 'right',
      render: (student) => (
        <span className="tabular">{student.cgpa === null ? '—' : student.cgpa.toFixed(2)}</span>
      ),
    },
    {
      key: 'activeBacklogs',
      header: 'Active backlogs',
      align: 'right',
      render: (student) => <span className="tabular">{student.activeBacklogs}</span>,
    },
    {
      key: 'isPlaced',
      header: 'Placement',
      render: (student) =>
        student.isPlaced ? (
          <Badge tone="info">Already placed</Badge>
        ) : (
          <Badge tone="neutral">Unplaced</Badge>
        ),
    },
  ];

  const title = profile.data?.job.title;

  return (
    <RouteGuard permissions={['application:read_all']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Job postings', href: '/college/placements/jobs' },
          ...(title
            ? [{ label: title, href: `/college/placements/jobs/${params.id}` }]
            : []),
          { label: 'Eligible students' },
        ]}
      />

      <PageHeader
        title="Eligible students"
        description={
          title
            ? `Everyone who currently meets the criteria for ${title}.`
            : 'Everyone who currently meets this posting’s criteria.'
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/college/placements/jobs/${params.id}`}>Back to posting</Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Eligible now"
          value={students.data?.length}
          icon={UserCheck}
          isLoading={students.isLoading}
        />
        <StatCard
          label="Of whom already placed"
          value={students.data?.filter((student) => student.isPlaced).length}
          isLoading={students.isLoading}
        />
        <StatCard
          label="Openings"
          value={profile.data?.counts.openings}
          isLoading={profile.isLoading}
        />
      </div>

      {profile.data ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>The criteria producing this list</CardTitle>
            <p className="text-sm text-muted-foreground">
              Evaluated on the server. Change them on the posting to change who appears here.
            </p>
          </CardHeader>
          <CardContent>
            <EligibilitySummary eligibility={profile.data.job.eligibility} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search name or roll number"
              leadingIcon={<Search />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search eligible students"
            />
          </div>

          <Select
            placeholder="All departments"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            aria-label="Filter by department"
            options={(departments.data?.items ?? []).map((entry) => ({
              value: entry.id,
              label: entry.name,
            }))}
          />

          <Select
            placeholder="All batches"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            aria-label="Filter by batch"
            options={(batches.data?.items ?? []).map((entry) => ({
              value: entry.id,
              label: `${entry.code} — ${entry.name}`,
            }))}
          />
        </div>

        {filtered ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing {rows.length} of {students.data?.length ?? 0}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setDepartmentId('');
                setBatchId('');
              }}
            >
              <X aria-hidden />
              Clear
            </Button>
          </div>
        ) : null}
      </Card>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(student) => student.id}
        isLoading={students.isLoading}
        isFetching={students.isFetching}
        error={students.error}
        onRetry={() => void students.refetch()}
        stickyHeader
        emptyTitle={
          filtered
            ? 'No student matches those filters'
            : 'No students currently match this job’s eligibility criteria.'
        }
        emptyDescription={
          filtered
            ? 'Try clearing a filter.'
            : 'Relax a criterion on the posting — publishing is refused while nobody qualifies.'
        }
        emptyAction={
          filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setDepartmentId('');
                setBatchId('');
              }}
            >
              Clear filters
            </Button>
          ) : undefined
        }
      />
    </RouteGuard>
  );
}
