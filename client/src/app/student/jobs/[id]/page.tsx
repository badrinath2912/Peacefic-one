'use client';

import { ArrowLeft, Building2, CalendarClock, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useJobPosting, useMyApplications, useMyEligibility } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { EligibilitySummary } from '@/components/placement/eligibility-summary';
import { ApplyDialog } from '@/components/student/apply-dialog';
import { EligibilityNotice } from '@/components/student/eligibility-notice';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { can } from '@/lib/permissions';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  JOB_TYPE_LABELS,
  SELECTION_ROUND_TYPE_LABELS,
  WORK_MODE_LABELS,
  formatCtc,
  formatCtcRange,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function StudentJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const job = useJobPosting(params.id);
  const eligibility = useMyEligibility(params.id);
  const applications = useMyApplications();

  const [applying, setApplying] = useState(false);

  const application = useMemo(
    () =>
      (applications.data ?? []).find((entry) => {
        const jobId =
          typeof entry.jobPostingId === 'string' ? entry.jobPostingId : entry.jobPostingId.id;
        return jobId === params.id;
      }),
    [applications.data, params.id],
  );

  if (job.isLoading) return <FullPageSpinner label="Loading opportunity" />;

  if (job.isError) {
    return (
      <ErrorState
        title="Could not load this opportunity"
        message={job.error.message}
        requestId={job.error.requestId}
        onRetry={() => void job.refetch()}
      />
    );
  }

  if (!job.data) return null;

  const posting = job.data;
  const isOpen =
    posting.status === 'published' && new Date(posting.applicationCloseAt) > new Date();

  /** The server decides; this only chooses what to render. */
  const eligible = eligibility.data?.eligible ?? false;
  const mayApply = can(user?.permissions, 'application:create');
  const canApplyNow = isOpen && eligible && !application && mayApply;

  return (
    <RouteGuard permissions={['job:read']}>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/student/jobs">
          <ArrowLeft aria-hidden />
          All opportunities
        </Link>
      </Button>

      <PageHeader
        title={posting.title}
        description={relationField(posting.companyId, 'name')}
        actions={
          application ? (
            <Button variant="outline" asChild>
              <Link href={`/student/applications/${application.id}`}>View my application</Link>
            </Button>
          ) : canApplyNow ? (
            <Button onClick={() => setApplying(true)}>Apply</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{JOB_TYPE_LABELS[posting.jobType]}</Badge>
        <Badge tone="neutral">{WORK_MODE_LABELS[posting.workMode]}</Badge>
        {isOpen ? (
          <Badge tone="success">Accepting applications</Badge>
        ) : (
          <Badge tone="neutral">Closed to applications</Badge>
        )}
        {application ? (
          <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
            {APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
        ) : null}
      </div>

      {application ? (
        <Alert tone="info" title="You have already applied" className="mb-4">
          Your application is {APPLICATION_STATUS_LABELS[application.status].toLowerCase()}. Track it
          from <Link href={`/student/applications/${application.id}`} className="underline">
            your applications
          </Link>
          .
        </Alert>
      ) : eligibility.isLoading ? null : eligibility.isError ? (
        <Alert tone="warning" title="Could not check your eligibility" className="mb-4">
          {eligibility.error.message}
        </Alert>
      ) : eligibility.data ? (
        <EligibilityNotice
          eligible={eligibility.data.eligible}
          reasons={eligibility.data.reasons}
          className="mb-4"
        />
      ) : null}

      {!application && isOpen && eligible && !mayApply ? (
        <Alert tone="info" title="Applying is not available to you" className="mb-4">
          Your account cannot submit applications. Speak to the placement office.
        </Alert>
      ) : null}

      {!isOpen && !application ? (
        <Alert tone="warning" title="This drive is not accepting applications" className="mb-4">
          Applications closed on {formatDate(posting.applicationCloseAt)}.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>About the role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">{posting.description}</p>

              <DescriptionList
                items={[
                  { label: 'Openings', value: posting.openings },
                  { label: 'Locations', value: posting.locations.join(', ') },
                  { label: 'Engagement', value: JOB_TYPE_LABELS[posting.jobType] },
                  { label: 'Work mode', value: WORK_MODE_LABELS[posting.workMode] },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How you will be assessed</CardTitle>
              <p className="text-sm text-muted-foreground">
                {posting.selectionRounds.length} round
                {posting.selectionRounds.length === 1 ? '' : 's'}, in order.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {posting.selectionRounds.map((round) => (
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
                The criteria the placement office set for this drive.
              </p>
            </CardHeader>
            <CardContent>
              <EligibilitySummary eligibility={posting.eligibility} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Package</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatCtcRange(
                  posting.compensation.ctcMin,
                  posting.compensation.ctcMax,
                  posting.compensation.currency,
                )}
              </p>
              <p className="mb-4 text-xs text-muted-foreground">Cost to company, per year</p>

              <DescriptionList
                items={[
                  {
                    label: 'Fixed',
                    value: posting.compensation.fixedComponent
                      ? formatCtc(posting.compensation.fixedComponent)
                      : null,
                  },
                  {
                    label: 'Variable',
                    value: posting.compensation.variableComponent
                      ? formatCtc(posting.compensation.variableComponent)
                      : null,
                  },
                  {
                    label: 'Stipend / month',
                    value: posting.compensation.stipendPerMonth
                      ? formatCtc(posting.compensation.stipendPerMonth)
                      : null,
                  },
                  {
                    label: 'Bond',
                    value: posting.compensation.bondMonths
                      ? `${posting.compensation.bondMonths} months`
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
                  { label: 'Applications open', value: formatDate(posting.applicationOpenAt) },
                  { label: 'Applications close', value: formatDate(posting.applicationCloseAt) },
                  { label: 'Drive date', value: formatDate(posting.driveDate) },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{relationField(posting.companyId, 'name')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {relationField(posting.companyId, 'industry')}
              </p>

              <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{posting.locations.join(', ')}</span>
              </p>
            </CardContent>
          </Card>

          {canApplyNow ? (
            <Button className="w-full" onClick={() => setApplying(true)}>
              Apply to this drive
            </Button>
          ) : null}
        </div>
      </div>

      <ApplyDialog
        open={applying}
        jobId={posting.id}
        jobTitle={posting.title}
        companyName={relationField(posting.companyId, 'name')}
        onCancel={() => setApplying(false)}
        onApplied={() => setApplying(false)}
      />
    </RouteGuard>
  );
}
