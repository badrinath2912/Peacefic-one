'use client';

import type { PlacementStatus } from '@peacefic/shared';
import { BadgeCheck, Briefcase, Building2, FileText, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useMarkJoined,
  useMarkNotJoined,
  usePlacement,
  useRevokeOffer,
  useVerifyPlacement,
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
import { can } from '@/lib/permissions';
import {
  JOB_TYPE_LABELS,
  OFFICE_PLACEMENT_TRANSITIONS,
  PLACEMENT_ACTIONS_NEEDING_REASON,
  PLACEMENT_ACTION_DESCRIPTIONS,
  PLACEMENT_ACTION_LABELS,
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  formatCtc,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function OfferDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const placement = usePlacement(params.id);
  const revoke = useRevokeOffer(params.id);
  const markJoined = useMarkJoined(params.id);
  const markNotJoined = useMarkNotJoined(params.id);
  const verify = useVerifyPlacement(params.id);

  const [pending, setPending] = useState<PlacementStatus | null>(null);
  const [pendingVerify, setPendingVerify] = useState(false);

  if (placement.isLoading) return <FullPageSpinner label="Loading offer" />;

  if (placement.isError) {
    return (
      <ErrorState
        title="Could not load this offer"
        message={placement.error.message}
        requestId={placement.error.requestId}
        onRetry={() => void placement.refetch()}
      />
    );
  }

  if (!placement.data) return null;

  const offer = placement.data;
  const student = typeof offer.studentId === 'object' ? offer.studentId : null;
  const company = typeof offer.companyId === 'object' ? offer.companyId : null;
  const job = typeof offer.jobPostingId === 'object' ? offer.jobPostingId : null;
  const studentUser = student && typeof student.userId === 'object' ? student.userId : null;

  /**
   * Revoking, joining and not-joining are all `placement:update` — there is no
   * separate revoke permission. Accepting and declining never appear: the
   * shared map removes them, and the API needs `placement:respond`, which only
   * students hold.
   */
  const mayUpdate = can(user?.permissions, 'placement:update');
  const mayVerify = can(user?.permissions, 'placement:verify');

  const actions = mayUpdate ? OFFICE_PLACEMENT_TRANSITIONS[offer.status] : [];

  const entries: TimelineEntry[] = offer.history.map((event, index) => ({
    id: `${event.at}-${event.to}-${index}`,
    title: PLACEMENT_STATUS_LABELS[event.to],
    at: formatDateTime(event.at),
    actor: event.actedByRole === 'student' ? 'By the student' : 'By the placement office',
    detail: event.reason,
    tone:
      event.to === 'offer_revoked' || event.to === 'not_joined'
        ? 'danger'
        : event.to === 'declined'
          ? 'warning'
          : 'default',
  }));

  function runAction(target: PlacementStatus, reason?: string): void {
    const done = { onSuccess: () => setPending(null) };

    if (target === 'offer_revoked') {
      revoke.mutate(reason ?? '', done);
      return;
    }

    if (target === 'not_joined') {
      markNotJoined.mutate(reason ?? '', done);
      return;
    }

    if (target === 'joined') {
      // No date given: the server stamps today, or keeps the agreed one.
      markJoined.mutate(undefined, done);
    }
  }

  const isPending = revoke.isPending || markJoined.isPending || markNotJoined.isPending;

  return (
    <RouteGuard permissions={['placement:read_all']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Offers', href: '/college/placements/offers' },
          { label: personName(student) },
        ]}
      />

      <PageHeader
        title={personName(student)}
        description={`${offer.designation} · ${company?.name ?? ''}`.trim()}
        actions={
          <>
            {actions.map((target) => (
              <Button
                key={target}
                variant={
                  target === 'offer_revoked' || target === 'not_joined' ? 'outline' : 'primary'
                }
                onClick={() => setPending(target)}
                title={PLACEMENT_ACTION_DESCRIPTIONS[target]}
              >
                {PLACEMENT_ACTION_LABELS[target]}
              </Button>
            ))}

            {mayVerify && !offer.isVerified ? (
              <Button variant="outline" onClick={() => setPendingVerify(true)}>
                <ShieldCheck aria-hidden />
                Verify
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={PLACEMENT_STATUS_TONES[offer.status]}>
          {PLACEMENT_STATUS_LABELS[offer.status]}
        </Badge>
        {offer.isPrimaryOffer ? <Badge tone="primary">Primary offer</Badge> : null}
        {offer.isVerified ? (
          <Badge tone="success">Verified</Badge>
        ) : (
          <Badge tone="neutral">Unverified</Badge>
        )}
        <Badge tone="neutral">{offer.academicYear}</Badge>
      </div>

      {offer.status === 'offered' ? (
        <Alert tone="info" title="Waiting on the student" className="mb-4">
          Accepting and declining are the student’s own actions — the office cannot answer on their
          behalf. You can revoke the offer if the company withdraws it.
        </Alert>
      ) : null}

      {offer.status === 'declined' ? (
        <Alert tone="warning" title="The student declined" className="mb-4">
          {offer.declineReason ?? 'No reason was given.'}
        </Alert>
      ) : null}

      {offer.status === 'offer_revoked' ? (
        <Alert tone="danger" title="Offer revoked" className="mb-4">
          {offer.revokeReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      {!mayUpdate && OFFICE_PLACEMENT_TRANSITIONS[offer.status].length > 0 ? (
        <Alert tone="info" title="You have read-only access to this offer" className="mb-4">
          Revoking an offer or recording a joining needs the placement update permission.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>The offer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatCtc(offer.package.ctc, offer.package.currency)}
              </p>
              <p className="mb-4 text-xs text-muted-foreground">Cost to company, per year</p>

              <DescriptionList
                items={[
                  { label: 'Designation', value: offer.designation },
                  { label: 'Location', value: offer.location },
                  { label: 'Engagement', value: JOB_TYPE_LABELS[offer.jobType] },
                  { label: 'Academic year', value: offer.academicYear },
                  {
                    label: 'Fixed',
                    value: offer.package.fixed
                      ? formatCtc(offer.package.fixed, offer.package.currency)
                      : null,
                  },
                  {
                    label: 'Variable',
                    value: offer.package.variable
                      ? formatCtc(offer.package.variable, offer.package.currency)
                      : null,
                  },
                  {
                    label: 'Stipend / month',
                    value: offer.package.stipendPerMonth
                      ? formatCtc(offer.package.stipendPerMonth, offer.package.currency)
                      : null,
                  },
                  {
                    label: 'Bond',
                    value: offer.package.bondMonths ? `${offer.package.bondMonths} months` : null,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Offer letter</CardTitle>
            </CardHeader>
            <CardContent>
              {offer.offerLetter ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={offer.offerLetter.url} target="_blank" rel="noreferrer">
                    <FileText aria-hidden />
                    {offer.offerLetter.fileName}
                  </a>
                </Button>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No offer letter on this record"
                  description="Uploading one is not available yet — the placement API accepts no letter on create or update."
                />
              )}
            </CardContent>
          </Card>

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
                  description="The offer has not moved since it was made."
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
              <User className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Student</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                items={[{ label: 'Industry', value: relationField(offer.companyId, 'industry') }]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Drive</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <BadgeCheck className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Key dates</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: 'Offered', value: formatDate(offer.offerDate) },
                  { label: 'Answered', value: formatDateTime(offer.respondedAt) },
                  { label: 'Joining', value: formatDate(offer.joiningDate) },
                  { label: 'Joined', value: formatDateTime(offer.joinedAt) },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {pending && PLACEMENT_ACTIONS_NEEDING_REASON.has(pending) ? (
        <ReasonDialog
          open
          tone="danger"
          title={`${PLACEMENT_ACTION_LABELS[pending]}?`}
          description={PLACEMENT_ACTION_DESCRIPTIONS[pending]}
          label="Reason"
          placeholder="Shared with the student."
          confirmLabel={PLACEMENT_ACTION_LABELS[pending]}
          minLength={3}
          isPending={isPending}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runAction(pending, reason)}
        />
      ) : null}

      {pending && !PLACEMENT_ACTIONS_NEEDING_REASON.has(pending) ? (
        <ConfirmDialog
          open
          tone="primary"
          title={`${PLACEMENT_ACTION_LABELS[pending]}?`}
          description={PLACEMENT_ACTION_DESCRIPTIONS[pending]}
          confirmLabel={PLACEMENT_ACTION_LABELS[pending]}
          isPending={isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => runAction(pending)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingVerify}
        tone="primary"
        title="Verify this placement?"
        description="Marks the record as checked against the company's paperwork. It will count as verified in reports."
        confirmLabel="Verify"
        isPending={verify.isPending}
        onCancel={() => setPendingVerify(false)}
        onConfirm={() =>
          verify.mutate(true, { onSuccess: () => setPendingVerify(false) })
        }
      />
    </RouteGuard>
  );
}
