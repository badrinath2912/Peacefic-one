'use client';

import { ArrowLeft, Briefcase, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  useDeclineApplicationOffer,
  useMyApplication,
  useMyOffers,
  useWithdrawApplication,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { OfferPanel } from '@/components/student/offer-panel';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { Timeline, type TimelineEntry } from '@/components/ui/timeline';
import { can } from '@/lib/permissions';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  relationField,
} from '@/lib/placement-display';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** The stages a student may still walk away from, as the service defines it. */
const WITHDRAWABLE = new Set(['applied', 'under_review', 'shortlisted', 'in_process']);

export default function StudentApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const application = useMyApplication(params.id);
  const offers = useMyOffers();
  const withdraw = useWithdrawApplication(params.id);
  const declineOffer = useDeclineApplicationOffer(params.id);

  const [pendingWithdraw, setPendingWithdraw] = useState(false);
  const [pendingDecline, setPendingDecline] = useState(false);

  const offer = useMemo(
    () =>
      (offers.data ?? []).find((entry) => {
        const applicationId =
          typeof entry.applicationId === 'string' ? entry.applicationId : entry.applicationId.id;
        return applicationId === params.id;
      }),
    [offers.data, params.id],
  );

  if (application.isLoading) return <FullPageSpinner label="Loading application" />;

  /**
   * A 404 here means the application is not this student's. The server answers
   * that way deliberately — confirming it exists would leak that it does.
   */
  if (application.isError) {
    return (
      <ErrorState
        title={
          application.error.statusCode === 404
            ? 'That application could not be found'
            : 'Could not load this application'
        }
        message={
          application.error.statusCode === 404
            ? 'It may have been removed, or it is not yours.'
            : application.error.message
        }
        requestId={application.error.requestId}
        onRetry={() => void application.refetch()}
      />
    );
  }

  if (!application.data) return null;

  const record = application.data;
  const job = typeof record.jobPostingId === 'object' ? record.jobPostingId : null;
  const company = typeof record.companyId === 'object' ? record.companyId : null;

  const mayWithdraw = can(user?.permissions, 'application:withdraw');
  const canWithdrawNow = mayWithdraw && WITHDRAWABLE.has(record.status);

  /**
   * Declining on the application itself, for the window where the office has
   * selected the candidate but not yet recorded an offer. Once a `Placement`
   * exists the offer panel owns the answer instead.
   */
  const canDeclineHere = mayWithdraw && record.status === 'selected' && !offer;

  const entries: TimelineEntry[] = record.history.map((event, index) => ({
    id: `${event.at}-${event.to}-${index}`,
    title: APPLICATION_STATUS_LABELS[event.to],
    at: formatDateTime(event.at),
    actor: event.actedByRole === 'student' ? 'You' : 'The placement office',
    detail: event.reason,
    tone:
      event.to === 'rejected' || event.to === 'withdrawn'
        ? 'danger'
        : event.to === 'offer_declined'
          ? 'warning'
          : 'default',
  }));

  return (
    <RouteGuard permissions={['application:read']}>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/student/applications">
          <ArrowLeft aria-hidden />
          My applications
        </Link>
      </Button>

      <PageHeader
        title={relationField(record.jobPostingId, 'title')}
        description={relationField(record.companyId, 'name')}
        actions={
          <>
            {canWithdrawNow ? (
              <Button variant="outline" onClick={() => setPendingWithdraw(true)}>
                Withdraw
              </Button>
            ) : null}

            {canDeclineHere ? (
              <Button variant="outline" onClick={() => setPendingDecline(true)}>
                Decline offer
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={APPLICATION_STATUS_TONES[record.status]}>
          {APPLICATION_STATUS_LABELS[record.status]}
        </Badge>
        {record.currentRound > 0 ? <Badge tone="neutral">Round {record.currentRound}</Badge> : null}
        <span className="text-sm text-muted-foreground">
          Applied {formatDate(record.appliedAt)}
        </span>
      </div>

      {record.status === 'selected' && !offer ? (
        <Alert tone="success" title="You have been selected" className="mb-4">
          The placement office has not recorded the written offer yet. It will appear here once they
          do.
        </Alert>
      ) : null}

      {record.status === 'rejected' ? (
        <Alert tone="warning" title="You were not taken forward" className="mb-4">
          {record.rejectionReason ?? 'The placement office did not record a reason.'}
        </Alert>
      ) : null}

      {record.status === 'withdrawn' ? (
        <Alert tone="info" title="You withdrew from this drive" className="mb-4">
          {record.withdrawalReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      {record.status === 'offer_declined' ? (
        <Alert tone="warning" title="You declined this offer" className="mb-4">
          The placement office has been told.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {offer ? <OfferPanel offer={offer} /> : null}

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every change to your application, oldest first.
              </p>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <EmptyState
                  title="Nothing has changed yet"
                  description="Your application is with the placement office."
                />
              ) : (
                <Timeline entries={entries} />
              )}
            </CardContent>
          </Card>

          {record.coverLetter ? (
            <Card>
              <CardHeader>
                <CardTitle>What you sent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-line text-sm">{record.coverLetter}</p>

                {record.answers.map((answer) => (
                  <div key={answer.question}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {answer.question}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm">{answer.answer}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>The drive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job ? (
                <Link
                  href={`/student/jobs/${job.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {job.title}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}

              <DescriptionList
                items={[
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
            <CardContent>
              <p className="font-medium">{company?.name ?? '—'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {relationField(record.companyId, 'industry')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your record at the time</CardTitle>
              <p className="text-sm text-muted-foreground">
                Frozen when you applied, so a later change cannot alter the basis on which you
                entered this drive.
              </p>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: 'CGPA', value: record.eligibilitySnapshot.cgpa?.toFixed(2) ?? null },
                  { label: 'Active backlogs', value: record.eligibilitySnapshot.activeBacklogs },
                  {
                    label: 'Attendance',
                    value:
                      record.eligibilitySnapshot.attendancePercent === null
                        ? null
                        : `${record.eligibilitySnapshot.attendancePercent}%`,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={pendingWithdraw}
        tone="danger"
        title="Withdraw from this drive?"
        description="This cannot be undone. Reapplying needs the placement office."
        label="Reason"
        placeholder="Why you are withdrawing."
        confirmLabel="Withdraw"
        minLength={3}
        isPending={withdraw.isPending}
        onCancel={() => setPendingWithdraw(false)}
        onConfirm={(reason) =>
          withdraw.mutate(reason, { onSuccess: () => setPendingWithdraw(false) })
        }
      />

      <ReasonDialog
        open={pendingDecline}
        tone="danger"
        title="Decline this offer?"
        description="This cannot be undone. The placement office sees your reason."
        label="Reason"
        placeholder="Why you are turning the offer down."
        confirmLabel="Decline offer"
        minLength={3}
        isPending={declineOffer.isPending}
        onCancel={() => setPendingDecline(false)}
        onConfirm={(reason) =>
          declineOffer.mutate(reason, { onSuccess: () => setPendingDecline(false) })
        }
      />
    </RouteGuard>
  );
}
