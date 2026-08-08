'use client';

import type { EligibilityReason } from '@/api/placement-queries';
import { Alert } from '@/components/ui/alert';
import { eligibilityRuleLabel } from '@/lib/placement-display';

/**
 * Why the student can or cannot apply.
 *
 * Every word here comes from the server: the shared eligibility engine decides,
 * and this renders its verdict and its reasons. Nothing is recomputed, so the
 * screen can never disagree with what the apply endpoint will do.
 */
export function EligibilityNotice({
  eligible,
  reasons,
  className,
}: {
  eligible: boolean;
  reasons: EligibilityReason[];
  className?: string;
}) {
  if (eligible) {
    return (
      <Alert tone="success" title="You meet the criteria for this role" className={className}>
        The placement office may still add conditions of its own before the drive.
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title="You do not meet the criteria for this role" className={className}>
      {reasons.length === 0 ? (
        'The placement office has not said why.'
      ) : (
        <ul className="mt-1 space-y-1">
          {reasons.map((reason) => (
            <li key={`${reason.rule}-${reason.message}`} className="flex gap-2">
              <span className="shrink-0 font-medium">{eligibilityRuleLabel(reason.rule)}:</span>
              <span>{reason.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
