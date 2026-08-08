'use client';

import type { ApplicationStatus } from '@peacefic/shared';
import { Briefcase, Building2, ExternalLink, GraduationCap, Mail } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useAdvanceApplication,
  useApplication,
  useRejectApplication,
  useSelectApplication,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { Timeline, type TimelineEntry } from '@/components/ui/timeline';
import { can, canAny } from '@/lib/permissions';
import {
  APPLICATION_ACTIONS_NEEDING_REASON,
  APPLICATION_ACTION_DESCRIPTIONS,
  APPLICATION_ACTION_LABELS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  OFFICE_APPLICATION_TRANSITIONS,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** Which permission each office action needs. Selecting is not shortlisting. */
function permissionFor(target: ApplicationStatus): string {
  if (target === 'rejected') return 'application:reject';
  if (target === 'selected') return 'placement:create';
  return 'application:shortlist';
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const application = useApplication(params.id);
  const advance = useAdvanceApplication(params.id);
  const reject = useRejectApplication(params.id);
  const select = useSelectApplication(params.id);

  const [pending, setPending] = useState<ApplicationStatus | null>(null);

  if (application.isLoading) return <FullPageSpinner label="Loading application" />;

  if (application.isError) {
    return (
      <ErrorState
        title="Could not load this application"
        message={application.error.message}
        requestId={application.error.requestId}
        onRetry={() => void application.refetch()}
      />
    );
  }

  if (!application.data) return null;

  const record = application.data;
  const student = typeof record.studentId === 'object' ? record.studentId : null;
  const job = typeof record.jobPostingId === 'object' ? record.jobPostingId : null;
  const company = typeof record.companyId === 'object' ? record.companyId : null;

  const studentUser =
    student && typeof student.userId === 'object' ? student.userId : null;

  /**
   * `GET /applications/:id` returns no `allowedTransitions`, unlike a job
   * posting, so this reads the office-side mirror. Each action is then gated on
   * its own permission — the server re-checks both.
   */
  const actions = OFFICE_APPLICATION_TRANSITIONS[record.status].filter((target) =>
    can(user?.permissions, permissionFor(target)),
  );

  const mayOpenStudent = canAny(user?.permissions, ['student:read', 'student:read_all']);

  const entries: TimelineEntry[] = record.history.map((event, index) => ({
    id: `${event.at}-${event.to}-${index}`,
    title: APPLICATION_STATUS_LABELS[event.to],
    at: formatDateTime(event.at),
    actor: event.actedByRole === 'student' ? 'By the student' : 'By the placement office',
    detail: event.reason,
    tone:
      event.to === 'rejected' || event.to === 'withdrawn'
        ? 'danger'
        : event.to === 'offer_declined'
          ? 'warning'
          : 'default',
  }));

  function runAction(target: ApplicationStatus, reason?: string): void {
    const done = { onSuccess: () => setPending(null) };

    if (target === 'rejected') {
      reject.mutate(reason ?? '', done);
      return;
    }

    if (target === 'selected') {
      select.mutate(reason, done);
      return;
    }

    advance.mutate({ to: target, reason }, done);
  }

  const isPending = advance.isPending || reject.isPending || select.isPending;

  return (
    <RouteGuard permissions={['application:read_all']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Applications', href: '/college/placements/applications' },
          { label: personName(student) },
        ]}
      />

      <PageHeader
        title={personName(student)}
        description={job ? `${job.title} · ${company?.name ?? ''}`.trim() : undefined}
        actions={
          <>
            {actions.map((target) => (
              <Button
                key={target}
                variant={target === 'rejected' ? 'outline' : 'primary'}
                onClick={() => setPending(target)}
                title={APPLICATION_ACTION_DESCRIPTIONS[target]}
              >
                {APPLICATION_ACTION_LABELS[target]}
              </Button>
            ))}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={APPLICATION_STATUS_TONES[record.status]}>
          {APPLICATION_STATUS_LABELS[record.status]}
        </Badge>
        {record.currentRound > 0 ? (
          <Badge tone="neutral">Round {record.currentRound}</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          Applied {formatDate(record.appliedAt)}
        </span>
      </div>

      {record.status === 'selected' ? (
        <Alert tone="success" title="Selected" className="mb-4">
          <span className="block">
            Selecting a candidate does not create the offer — record it separately, with the terms
            the company put in writing.
          </span>

          {can(user?.permissions, 'placement:create') ? (
            <Button size="sm" className="mt-2" asChild>
              <Link href={`/college/placements/offers/new?applicationId=${record.id}`}>
                Record the offer
              </Link>
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {record.status === 'withdrawn' ? (
        <Alert tone="warning" title="Withdrawn by the student" className="mb-4">
          {record.withdrawalReason ?? 'No reason was given.'}
        </Alert>
      ) : null}

      {record.status === 'offer_declined' ? (
        <Alert tone="warning" title="The student declined the offer" className="mb-4">
          Declining is the student’s own action. The office cannot reverse it here.
        </Alert>
      ) : null}

      {record.status === 'rejected' ? (
        <Alert tone="danger" title="Rejected" className="mb-4">
          {record.rejectionReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      {actions.length === 0 &&
      OFFICE_APPLICATION_TRANSITIONS[record.status].length > 0 ? (
        <Alert tone="info" title="You have read-only access to this application" className="mb-4">
          Moving an application on needs the shortlisting, rejection or placement permission.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Candidate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  { label: 'Name', value: personName(student) },
                  { label: 'Roll number', value: student?.rollNumber },
                  { label: 'Email', value: studentUser?.email },
                ]}
              />

              {student && !studentUser ? (
                <Alert tone="info" title="Contact details are not visible to you">
                  The API returned this student without their user record.
                </Alert>
              ) : null}

              {mayOpenStudent && student ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/college/students/${student.id}`}>
                    <ExternalLink aria-hidden />
                    Open student record
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Academics at the time of applying</CardTitle>
              <p className="text-sm text-muted-foreground">
                Frozen when the application was made, so a later change to the student record cannot
                rewrite the basis on which they entered the drive.
              </p>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  {
                    label: 'CGPA',
                    value: record.eligibilitySnapshot.cgpa?.toFixed(2) ?? null,
                  },
                  { label: 'Active backlogs', value: record.eligibilitySnapshot.activeBacklogs },
                  { label: 'Backlogs ever', value: record.eligibilitySnapshot.totalBacklogs },
                  {
                    label: 'Attendance',
                    value:
                      record.eligibilitySnapshot.attendancePercent === null
                        ? null
                        : `${record.eligibilitySnapshot.attendancePercent}%`,
                  },
                  {
                    label: 'Captured',
                    value: formatDateTime(record.eligibilitySnapshot.capturedAt),
                    full: true,
                  },
                ]}
              />
            </CardContent>
          </Card>

          {record.coverLetter || record.answers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>What the candidate submitted</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {record.coverLetter ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cover letter
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm">{record.coverLetter}</p>
                  </div>
                ) : null}

                {record.answers.map((answer) => (
                  <div key={answer.question}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {answer.question}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm">{answer.answer}</p>
                  </div>
                ))}

                {record.resumeUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={record.resumeUrl} target="_blank" rel="noreferrer">
                      <Mail aria-hidden />
                      Open résumé
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every status change the server recorded, oldest first.
              </p>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <EmptyState
                  title="No status changes yet"
                  description="The application has not moved since it was submitted."
                />
              ) : (
                <Timeline entries={entries} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job ? (
                <Link
                  href={`/college/placements/jobs/${job.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {job.title}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}

              <DescriptionList
                items={[
                  { label: 'Status', value: relationField(record.jobPostingId, 'status') },
                  {
                    label: 'Applications close',
                    value: job ? formatDate(job.applicationCloseAt) : null,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {company ? (
                <Link
                  href={`/college/placements/companies/${company.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {company.name}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}

              <DescriptionList
                items={[{ label: 'Industry', value: relationField(record.companyId, 'industry') }]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Key dates</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: 'Applied', value: formatDateTime(record.appliedAt) },
                  { label: 'Selected', value: formatDateTime(record.selectedAt) },
                  { label: 'Rejected', value: formatDateTime(record.rejectedAt) },
                  { label: 'Withdrawn', value: formatDateTime(record.withdrawnAt) },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {pending && APPLICATION_ACTIONS_NEEDING_REASON.has(pending) ? (
        <ReasonDialog
          open
          tone="danger"
          title={`${APPLICATION_ACTION_LABELS[pending]} this candidate?`}
          description={APPLICATION_ACTION_DESCRIPTIONS[pending]}
          label="Reason"
          placeholder="Shared with the student."
          confirmLabel={APPLICATION_ACTION_LABELS[pending]}
          minLength={3}
          isPending={isPending}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runAction(pending, reason)}
        />
      ) : null}

      {pending && !APPLICATION_ACTIONS_NEEDING_REASON.has(pending) ? (
        <ConfirmDialog
          open
          tone="primary"
          title={`${APPLICATION_ACTION_LABELS[pending]}?`}
          description={APPLICATION_ACTION_DESCRIPTIONS[pending]}
          confirmLabel={APPLICATION_ACTION_LABELS[pending]}
          isPending={isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => runAction(pending)}
        />
      ) : null}
    </RouteGuard>
  );
}
