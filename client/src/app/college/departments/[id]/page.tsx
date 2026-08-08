'use client';

import { Building2, GraduationCap, Pencil, Trash2, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { useBatches, useDepartment, useDepartmentAnalytics } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { apiDelete, type ApiError } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function DepartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const department = useDepartment(params.id);
  const analytics = useDepartmentAnalytics(params.id);
  const batches = useBatches({ departmentId: params.id, limit: 10, include: 'departmentId' });

  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (department.isLoading) return <FullPageSpinner label="Loading department" />;

  if (department.isError) {
    return (
      <ErrorState
        title="Could not load this department"
        message={department.error.message}
        requestId={department.error.requestId}
        onRetry={() => void department.refetch()}
      />
    );
  }

  if (!department.data) return <FullPageSpinner label="Loading" />;

  const record = department.data;
  const hod = typeof record.hodId === 'object' && record.hodId ? record.hodId : null;
  const blocked =
    record.stats.totalStudents > 0 ||
    record.stats.totalFaculty > 0 ||
    record.stats.totalBatches > 0;

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);
    try {
      await apiDelete(`/departments/${params.id}`);
      toast.success('Department removed.');
      router.push('/college/departments');
    } catch (error) {
      toast.error((error as ApiError).message);
      setPendingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <RouteGuard permissions={['department:read']}>
      <Breadcrumbs
        items={[{ label: 'Departments', href: '/college/departments' }, { label: record.code }]}
      />

      <PageHeader
        title={record.name}
        description={record.code}
        actions={
          <>
            {can(user?.permissions, 'department:update') ? (
              <Button variant="outline" asChild>
                <Link href={`/college/departments/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'department:delete') ? (
              <Button variant="danger" onClick={() => setPendingDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={record.stats.totalStudents} icon={Users} />
        <StatCard label="Faculty" value={record.stats.totalFaculty} icon={Users} />
        <StatCard label="Batches" value={record.stats.totalBatches} icon={GraduationCap} />
        <StatCard
          label="Placement rate"
          value={analytics.data ? formatPercent(analytics.data.placementRate) : undefined}
          icon={TrendingUp}
          isLoading={analytics.isLoading}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Name', value: record.name },
                { label: 'Code', value: record.code },
                { label: 'Head of department', value: hod?.fullName ?? null },
                { label: 'HOD email', value: hod?.email ?? null },
                { label: 'Established', value: record.establishedYear },
                { label: 'Created', value: formatDate(record.createdAt) },
                {
                  label: 'Average CGPA',
                  value: analytics.data?.averageCgpa?.toFixed(2) ?? null,
                },
                { label: 'Description', value: record.description, full: true },
              ]}
            />

            <div className="mt-4">
              <StatusBadge status={record.status} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Batches</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/college/batches?departmentId=${params.id}`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            {batches.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="skeleton h-10" />
                ))}
              </div>
            ) : batches.data && batches.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {batches.data.items.map((batch) => (
                  <li key={batch.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/college/batches/${batch.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {batch.code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{batch.name}</p>
                    </div>
                    <span className="tabular shrink-0 text-sm text-muted-foreground">
                      {batch.stats.totalStudents} / {batch.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No batches in this department"
                description="Create a batch to start enrolling students."
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

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${record.name}?`}
        description={
          blocked
            ? // Named counts rather than a bare refusal, so the user knows what to clear.
              `This department still has ${record.stats.totalStudents} student(s), ${record.stats.totalBatches} batch(es) and ${record.stats.totalFaculty} staff member(s). The deletion will be refused until those are moved or archived.`
            : 'This department is empty and can be removed.'
        }
        confirmLabel="Delete"
        isPending={isDeleting}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </RouteGuard>
  );
}
