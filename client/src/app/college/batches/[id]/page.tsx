'use client';

import { ArrowUpCircle, GraduationCap, Pencil, Trash2, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

import { useBatch, useBatchAnalytics, useBatchStudents } from '@/api/queries';
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
import { apiDelete, apiPost, type ApiError } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { formatDate, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const MAX_SEMESTER = 12;

function relationLabel(value: unknown, key: string): string {
  if (value && typeof value === 'object' && key in value) {
    const found = (value as Record<string, unknown>)[key];
    return found ? String(found) : '—';
  }
  return '—';
}

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const batch = useBatch(params.id);
  const analytics = useBatchAnalytics(params.id);
  const students = useBatchStudents(params.id, { limit: 10 });

  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingPromote, setPendingPromote] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  if (batch.isLoading) return <FullPageSpinner label="Loading batch" />;

  if (batch.isError) {
    return (
      <ErrorState
        title="Could not load this batch"
        message={batch.error.message}
        requestId={batch.error.requestId}
        onRetry={() => void batch.refetch()}
      />
    );
  }

  if (!batch.data) return <FullPageSpinner label="Loading" />;

  const record = batch.data;
  const isFinalSemester = record.currentSemester >= MAX_SEMESTER;

  async function handleDelete(): Promise<void> {
    setIsWorking(true);
    try {
      await apiDelete(`/batches/${params.id}`);
      toast.success('Batch removed.');
      router.push('/college/batches');
    } catch (error) {
      toast.error((error as ApiError).message);
      setPendingDelete(false);
    } finally {
      setIsWorking(false);
    }
  }

  async function handlePromote(): Promise<void> {
    setIsWorking(true);
    try {
      await apiPost(`/batches/${params.id}/promote`, { confirm: true });
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success(
        isFinalSemester ? 'Batch completed and students graduated.' : 'Batch advanced a semester.',
      );
      setPendingPromote(false);
    } catch (error) {
      toast.error((error as ApiError).message);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <RouteGuard permissions={['batch:read']}>
      <Breadcrumbs
        items={[{ label: 'Batches', href: '/college/batches' }, { label: record.code }]}
      />

      <PageHeader
        title={record.name}
        description={`${record.code} · ${relationLabel(record.departmentId, 'name')}`}
        actions={
          <>
            {can(user?.permissions, 'batch:promote') && record.status === 'active' ? (
              <Button variant="outline" onClick={() => setPendingPromote(true)}>
                <ArrowUpCircle aria-hidden />
                {isFinalSemester ? 'Graduate batch' : 'Advance semester'}
              </Button>
            ) : null}

            {can(user?.permissions, 'batch:update') ? (
              <Button variant="outline" asChild>
                <Link href={`/college/batches/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'batch:delete') ? (
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
        <StatCard label="Capacity" value={record.capacity} icon={GraduationCap} />
        <StatCard
          label="Utilisation"
          value={analytics.data ? formatPercent(analytics.data.utilisation) : undefined}
          isLoading={analytics.isLoading}
        />
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
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Name', value: record.name },
                { label: 'Code', value: record.code },
                { label: 'Department', value: relationLabel(record.departmentId, 'name') },
                {
                  label: 'Academic year',
                  value: `${record.admissionYear}–${record.graduationYear}`,
                },
                { label: 'Current semester', value: record.currentSemester },
                { label: 'Section', value: record.section },
                { label: 'Class advisor', value: relationLabel(record.classAdvisorId, 'fullName') },
                {
                  label: 'Average CGPA',
                  value: analytics.data?.averageCgpa?.toFixed(2) ?? null,
                },
                { label: 'Created', value: formatDate(record.createdAt) },
              ]}
            />

            <div className="mt-4">
              <StatusBadge status={record.status} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Students</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/college/students?batchId=${params.id}`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            {students.isLoading ? (
              <div className="space-y-2 px-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="skeleton h-10" />
                ))}
              </div>
            ) : students.data && students.data.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {students.data.items.map((student) => (
                  <li
                    key={student.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/college/students/${student.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {student.rollNumber}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {relationLabel(student.userId, 'fullName')}
                      </p>
                    </div>
                    <StatusBadge status={student.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Users}
                title="No students enrolled"
                description="Add students individually or import a roster."
                action={
                  can(user?.permissions, 'student:create') ? (
                    <Button size="sm" asChild>
                      <Link href="/college/students/new">Add student</Link>
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
          record.stats.totalStudents > 0
            ? `This batch still has ${record.stats.totalStudents} enrolled student(s). The deletion will be refused until they are moved to another batch.`
            : 'This batch is empty and can be removed.'
        }
        confirmLabel="Delete"
        isPending={isWorking}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={pendingPromote}
        tone="primary"
        title={isFinalSemester ? `Graduate ${record.name}?` : `Advance ${record.name}?`}
        description={
          isFinalSemester
            ? // This is the irreversible one, so it says so plainly.
              `Every active student will be marked graduated and the batch closed. This cannot be undone from the interface.`
            : `All ${record.stats.totalStudents} student(s) move from semester ${record.currentSemester} to ${record.currentSemester + 1}.`
        }
        confirmLabel={isFinalSemester ? 'Graduate batch' : 'Advance semester'}
        typeToConfirm={isFinalSemester ? 'GRADUATE' : undefined}
        isPending={isWorking}
        onCancel={() => setPendingPromote(false)}
        onConfirm={() => void handlePromote()}
      />
    </RouteGuard>
  );
}
