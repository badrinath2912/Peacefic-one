'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';

import { useAcceptOffer, useDeclineOffer, type Placement } from '@/api/placement-queries';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import {
  JOB_TYPE_LABELS,
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  formatCtc,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';

/**
 * The student's own offer.
 *
 * Accepting and declining are the only actions here, and only while the offer
 * is open. Revoking, recording a joining and marking a no-show belong to the
 * office — the hooks for them are deliberately not imported.
 */
export function OfferPanel({ offer }: { offer: Placement }) {
  const accept = useAcceptOffer(offer.id);
  const decline = useDeclineOffer(offer.id);

  const [pendingAccept, setPendingAccept] = useState(false);
  const [pendingDecline, setPendingDecline] = useState(false);

  // `offered` is the only status a student may answer from. Once accepted or
  // declined the buttons are gone, not merely disabled.
  const awaitingAnswer = offer.status === 'offered';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Your offer</CardTitle>
          <p className="text-sm text-muted-foreground">
            {offer.designation} at {relationField(offer.companyId, 'name')}
          </p>
        </div>

        <Badge tone={PLACEMENT_STATUS_TONES[offer.status]}>
          {PLACEMENT_STATUS_LABELS[offer.status]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-2xl font-semibold">
            {formatCtc(offer.package.ctc, offer.package.currency)}
          </p>
          <p className="text-xs text-muted-foreground">Cost to company, per year</p>
        </div>

        <DescriptionList
          items={[
            { label: 'Designation', value: offer.designation },
            { label: 'Location', value: offer.location },
            { label: 'Engagement', value: JOB_TYPE_LABELS[offer.jobType] },
            { label: 'Academic year', value: offer.academicYear },
            { label: 'Offered on', value: formatDate(offer.offerDate) },
            { label: 'Joining', value: formatDate(offer.joiningDate) },
            {
              label: 'Fixed',
              value: offer.package.fixed
                ? formatCtc(offer.package.fixed, offer.package.currency)
                : null,
            },
            {
              label: 'Bond',
              value: offer.package.bondMonths ? `${offer.package.bondMonths} months` : null,
            },
          ]}
        />

        {offer.isPrimaryOffer ? (
          <p className="text-xs text-muted-foreground">
            This is recorded as your primary offer, so it is the one that counts towards the
            college’s placement figures.
          </p>
        ) : null}

        {/* Readable when present; there is no upload path on the API. */}
        {offer.offerLetter ? (
          <Button variant="outline" size="sm" asChild>
            <a href={offer.offerLetter.url} target="_blank" rel="noreferrer">
              <FileText aria-hidden />
              {offer.offerLetter.fileName}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            No offer letter has been attached to this record.
          </p>
        )}

        {offer.status === 'accepted' ? (
          <Alert tone="success" title="You accepted this offer">
            The placement office will record your joining once you start.
          </Alert>
        ) : null}

        {offer.status === 'declined' ? (
          <Alert tone="warning" title="You declined this offer">
            {offer.declineReason ?? 'No reason was recorded.'}
          </Alert>
        ) : null}

        {offer.status === 'offer_revoked' ? (
          <Alert tone="danger" title="The company withdrew this offer">
            {offer.revokeReason ?? 'No reason was recorded.'}
          </Alert>
        ) : null}

        {offer.status === 'joined' ? (
          <Alert tone="success" title="You have joined">
            Recorded by the placement office.
          </Alert>
        ) : null}

        {offer.status === 'not_joined' ? (
          <Alert tone="danger" title="Recorded as not joined">
            The placement office recorded that you did not start. Speak to them if that is wrong.
          </Alert>
        ) : null}

        {awaitingAnswer ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button onClick={() => setPendingAccept(true)}>Accept offer</Button>
            <Button variant="outline" onClick={() => setPendingDecline(true)}>
              Decline offer
            </Button>
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={pendingAccept}
        tone="primary"
        title="Accept this offer?"
        description="The placement office and the company are told. Most colleges treat an accepted offer as the end of your placement season, so check the policy before accepting."
        confirmLabel="Accept offer"
        isPending={accept.isPending}
        onCancel={() => setPendingAccept(false)}
        onConfirm={() => accept.mutate(undefined, { onSuccess: () => setPendingAccept(false) })}
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
        isPending={decline.isPending}
        onCancel={() => setPendingDecline(false)}
        onConfirm={(reason) =>
          decline.mutate(reason, { onSuccess: () => setPendingDecline(false) })
        }
      />
    </Card>
  );
}
