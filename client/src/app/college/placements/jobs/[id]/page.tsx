'use client';

import {
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  useDeleteJobPosting,
  useJobProfile,
  useTransitionJobPosting,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { EligibilitySummary } from '@/components/placement/eligibility-summary';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  JOB_TRANSITIONS_NEEDING_REASON,
  JOB_TRANSITION_DESCRIPTIONS,
  JOB_TRANSITION_LABELS,
  JOB_TYPE_LABELS,
  SELECTION_ROUND_TYPE_LABELS,
  WORK_MODE_LABELS,
  formatCtc,
  formatCtcRange,
} from '@/lib/placement-display';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import type { JobStatus } from '@peacefic/shared';

export default function JobPostingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const profile = useJobProfile(params.id);
  const transition = useTransitionJobPosting(params.id);
  const removeJob = useDeleteJobPosting();

  const [pendingTransition, setPendingTransition] = useState<JobStatus | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  if (profile.isLoading) return <FullPageSpinner label="Loading posting" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this posting"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return null;

  const { job, company, counts, window, allowedTransitions } = profile.data;

  const mayPublish = can(user?.permissions, 'job:publish');
  const mayEdit = can(user?.permissions, 'job:update');
  const mayDelete = can(user?.permissions, 'job:delete');
  const maySeeStudents = can(user?.permissions, 'application:read_all');

  /**
   * The server owns the state machine — `allowedTransitions` comes straight
   * from `/jobs/:id/profile`, so an illegal move is never offered and this page
   * needs no copy of the rules.
   */
  const transitions = mayPublish ? allowedTransitions : [];
  const needsReason = pendingTransition
    ? JOB_TRANSITIONS_NEEDING_REASON.has(pendingTransition)
    : false;

  const canDeleteThis = mayDelete && job.status === 'draft' && counts.applications === 0;

  return (
    <RouteGuard permissions={['job:read']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Job postings', href: '/college/placements/jobs' },
          { label: job.title },
        ]}
      />

      <PageHeader
        title={job.title}
        description={company ? company.name : undefined}
        actions={
          <>
            {maySeeStudents ? (
              <Button variant="outline" asChild>
                <Link href={`/college/placements/jobs/${job.id}/eligible-students`}>
                  <Users aria-hidden />
                  Eligible students
                </Link>
              </Button>
            ) : null}

            {mayEdit && job.status !== 'completed' && job.status !== 'cancelled' ? (
              <Button variant="outline" asChild>
                <Link href={`/college/placements/jobs/${job.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {transitions.map((target) => (
              <Button
                key={target}
                variant={target === 'published' ? 'primary' : 'outline'}
                onClick={() => setPendingTransition(target)}
                title={JOB_TRANSITION_DESCRIPTIONS[target]}
              >
                {JOB_TRANSITION_LABELS[target]}
              </Button>
            ))}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
        <Badge tone="neutral">{JOB_TYPE_LABELS[job.jobType]}</Badge>
        <Badge tone="neutral">{WORK_MODE_LABELS[job.workMode]}</Badge>
        {window.isOpen ? (
          <Badge tone="success">Accepting applications</Badge>
        ) : (
          <Badge tone="neutral">Closed to applications</Badge>
        )}
      </div>

      {job.status === 'draft' ? (
        <Alert tone="info" title="This posting is a draft" className="mb-4">
          No student can see it. Publishing notifies everyone who qualifies, and is refused if
          nobody does.
        </Alert>
      ) : null}

      {job.status === 'cancelled' && job.closureReason ? (
        <Alert tone="danger" title="This drive was cancelled" className="mb-4">
          {job.closureReason}
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Eligible" value={counts.eligible} icon={Users} />
        <StatCard label="Applied" value={counts.applications} icon={Briefcase} />
        <StatCard label="Shortlisted" value={counts.shortlisted} />
        <StatCard label="Selected" value={counts.selected} icon={CheckCircle2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>The role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">{job.description}</p>

              <DescriptionList
                items={[
                  { label: 'Openings', value: job.openings },
                  { label: 'Locations', value: job.locations.join(', ') },
                  { label: 'Engagement', value: JOB_TYPE_LABELS[job.jobType] },
                  { label: 'Work mode', value: WORK_MODE_LABELS[job.workMode] },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selection rounds</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.selectionRounds.length} round{job.selectionRounds.length === 1 ? '' : 's'}, in
                order.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {job.selectionRounds.map((round) => (
                <div
                  key={`${round.order}-${round.name}`}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {round.order}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{round.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {SELECTION_ROUND_TYPE_LABELS[
                        round.type as keyof typeof SELECTION_ROUND_TYPE_LABELS
                      ] ?? round.type}
                      {' · '}
                      {round.mode === 'online' ? 'Online' : 'On campus'}
                      {round.durationMinutes ? ` · ${round.durationMinutes} min` : ''}
                    </p>
                    {round.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{round.description}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who can apply</CardTitle>
              <p className="text-sm text-muted-foreground">
                Evaluated by the placement engine, not by this page.
              </p>
            </CardHeader>
            <CardContent>
              <EligibilitySummary eligibility={job.eligibility} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compensation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatCtcRange(
                  job.compensation.ctcMin,
                  job.compensation.ctcMax,
                  job.compensation.currency,
                )}
              </p>
              <p className="mb-4 text-xs text-muted-foreground">Cost to company, per year</p>

              <DescriptionList
                items={[
                  {
                    label: 'Fixed',
                    value: job.compensation.fixedComponent
                      ? formatCtc(job.compensation.fixedComponent, job.compensation.currency)
                      : null,
                  },
                  {
                    label: 'Variable',
                    value: job.compensation.variableComponent
                      ? formatCtc(job.compensation.variableComponent, job.compensation.currency)
                      : null,
                  },
                  {
                    label: 'Stipend / month',
                    value: job.compensation.stipendPerMonth
                      ? formatCtc(job.compensation.stipendPerMonth, job.compensation.currency)
                      : null,
                  },
                  {
                    label: 'Bond',
                    value: job.compensation.bondMonths
                      ? `${job.compensation.bondMonths} months${
                          job.compensation.bondAmount
                            ? ` · ${formatCtc(job.compensation.bondAmount, job.compensation.currency)}`
                            : ''
                        }`
                      : null,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: 'Applications open', value: formatDate(window.opensAt) },
                  { label: 'Applications close', value: formatDate(window.closesAt) },
                  { label: 'Drive date', value: formatDate(job.driveDate) },
                  { label: 'Published', value: formatDateTime(job.publishedAt) },
                ]}
              />
            </CardContent>
          </Card>

          {company ? (
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" aria-hidden />
                <CardTitle>Company</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link
                  href={`/college/placements/companies/${company.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {company.name}
                </Link>

                <DescriptionList
                  items={[
                    { label: 'Industry', value: company.industry },
                    { label: 'Headquarters', value: company.headquarters },
                    { label: 'Drives run', value: company.stats.jobCount },
                    { label: 'Offers made', value: company.stats.offerCount },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}

          {mayDelete && job.status === 'draft' ? (
            <Card>
              <CardHeader>
                <CardTitle>Delete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {counts.applications > 0
                    ? `${counts.applications} student(s) have applied, so this posting can no longer be deleted. Cancel it instead.`
                    : 'A draft with no applications can be removed outright.'}
                </p>
                <Button
                  variant="danger"
                  disabled={!canDeleteThis}
                  onClick={() => setPendingDelete(true)}
                >
                  <Trash2 aria-hidden />
                  Delete posting
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {pendingTransition && needsReason ? (
        <ReasonDialog
          open
          tone={pendingTransition === 'cancelled' ? 'danger' : 'primary'}
          title={JOB_TRANSITION_LABELS[pendingTransition]}
          description={JOB_TRANSITION_DESCRIPTIONS[pendingTransition]}
          label="Reason"
          placeholder="Shared with students where the change affects them."
          confirmLabel={JOB_TRANSITION_LABELS[pendingTransition]}
          isPending={transition.isPending}
          onCancel={() => setPendingTransition(null)}
          onConfirm={(reason) =>
            transition.mutate(
              { to: pendingTransition, reason },
              { onSuccess: () => setPendingTransition(null) },
            )
          }
        />
      ) : null}

      {pendingTransition && !needsReason ? (
        <ConfirmDialog
          open
          tone="primary"
          title={`${JOB_TRANSITION_LABELS[pendingTransition]}?`}
          description={JOB_TRANSITION_DESCRIPTIONS[pendingTransition]}
          confirmLabel={JOB_TRANSITION_LABELS[pendingTransition]}
          isPending={transition.isPending}
          onCancel={() => setPendingTransition(null)}
          onConfirm={() =>
            transition.mutate(
              { to: pendingTransition },
              { onSuccess: () => setPendingTransition(null) },
            )
          }
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title="Delete this posting?"
        description="This cannot be undone. Only a draft with no applications can be deleted."
        confirmLabel="Delete"
        isPending={removeJob.isPending}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() =>
          removeJob.mutate(job.id, {
            onSuccess: () => router.push('/college/placements/jobs'),
          })
        }
      />
    </RouteGuard>
  );
}
