'use client';

import { Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useDeleteGradeScale, useGradeScales, type GradeScale } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { can } from '@/lib/permissions';
import { toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function GradeScalesPage() {
  const { user } = useAuth();
  const scales = useGradeScales({ limit: 50 });
  const deleteScale = useDeleteGradeScale();

  const [pendingDelete, setPendingDelete] = useState<GradeScale | null>(null);
  const mayManage = can(user?.permissions, 'gradescale:manage');

  return (
    <RouteGuard permissions={['gradescale:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Grade scales' },
        ]}
      />

      <PageHeader
        title="Grade scales"
        description="Nothing about grading is hard-coded. Boundaries, pass marks, grade points and CGPA rules all come from here."
        actions={
          mayManage ? (
            <Button asChild>
              <Link href="/college/examinations/grade-scales/new">
                <Plus aria-hidden />
                New scale
              </Link>
            </Button>
          ) : null
        }
      />

      {scales.isLoading ? (
        <FullPageSpinner label="Loading grade scales" />
      ) : scales.isError ? (
        <ErrorState
          title="Could not load grade scales"
          message={scales.error.message}
          requestId={scales.error.requestId}
          onRetry={() => void scales.refetch()}
        />
      ) : (scales.data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Scale}
              title="No grade scale configured"
              description="An exam cannot be graded until the college has at least one scale with a default set."
              action={
                mayManage ? (
                  <Button size="sm" asChild>
                    <Link href="/college/examinations/grade-scales/new">Create a scale</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {scales.data?.items.map((scale) => (
            <Card key={scale.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{scale.name}</span>
                    {scale.isDefault ? <Badge tone="primary">Default</Badge> : null}
                    <StatusBadge status={scale.status} />
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {scale.code}
                    {scale.description ? ` · ${scale.description}` : ''}
                  </p>
                </div>

                {mayManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/college/examinations/grade-scales/${scale.id}/edit`}>
                        <Pencil aria-hidden />
                        <span className="sr-only">Edit {scale.name}</span>
                      </Link>
                    </Button>

                    {!scale.isDefault ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(scale)}
                        aria-label={`Delete ${scale.name}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {[...scale.bands]
                    .sort((a, b) => b.minPercent - a.minPercent)
                    .map((band) => (
                      <span
                        key={band.letter}
                        className={`tabular rounded-md border px-2 py-1 text-xs ${
                          band.isPass
                            ? 'border-success/30 bg-success-subtle text-success'
                            : 'border-danger/30 bg-danger-subtle text-danger'
                        }`}
                        title={`${band.minPercent}–${band.maxPercent}% · ${band.gradePoint} points`}
                      >
                        <strong>{band.letter}</strong> {band.minPercent}–{band.maxPercent}
                      </span>
                    ))}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Pass mark
                    </dt>
                    <dd className="tabular font-medium">{scale.policy.passingPercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Max grace
                    </dt>
                    <dd className="tabular font-medium">{scale.policy.maxGraceMarks}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Repeats
                    </dt>
                    <dd className="font-medium">{toTitleCase(scale.policy.repeatPolicy)}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Attendance bonus
                    </dt>
                    <dd className="font-medium">
                      {scale.policy.attendanceBonusEnabled
                        ? `+${scale.policy.attendanceBonusMarks} at ${scale.policy.attendanceBonusThreshold}%`
                        : 'Off'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      Failed credits
                    </dt>
                    <dd className="font-medium">
                      {scale.policy.countFailedCredits ? 'In divisor' : 'Excluded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                      GPA decimals
                    </dt>
                    <dd className="tabular font-medium">{scale.policy.gpaDecimalPlaces}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={`Delete ${pendingDelete?.name ?? ''}?`}
        description="A scale used by any exam cannot be deleted — the server will refuse. This cannot be undone."
        confirmLabel="Delete scale"
        isPending={deleteScale.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete
            ? deleteScale.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
            : undefined
        }
      />
    </RouteGuard>
  );
}
