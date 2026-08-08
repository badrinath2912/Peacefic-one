'use client';

import type { ExamLifecycle } from '@peacefic/shared';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { useTransitionExam } from '@/api/examination-queries';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import {
  TRANSITION_DESCRIPTIONS,
  TRANSITION_LABELS,
  TRANSITIONS_NEEDING_REASON,
} from '@/lib/examination-display';

interface Props {
  examId: string;
  /**
   * Straight from `/examinations/:id/profile`. The state machine is the
   * server's; rendering anything it did not offer would produce a button that
   * exists only to be refused.
   */
  allowedTransitions: ExamLifecycle[];
  canPublish: boolean;
}

/**
 * `results_published` is deliberately filtered out. Publication writes the
 * version history and the per-student published flags, so it goes through the
 * publish operation on the results page rather than a bare status change — the
 * server refuses it here too.
 */
export function TransitionControl({ examId, allowedTransitions, canPublish }: Props) {
  const transition = useTransitionExam(examId);
  const [pending, setPending] = useState<ExamLifecycle | null>(null);

  const options = allowedTransitions.filter((step) => step !== 'results_published');

  if (!canPublish || options.length === 0) return null;

  const needsReason = pending ? TRANSITIONS_NEEDING_REASON.has(pending) : false;

  function run(reason?: string): void {
    if (!pending) return;

    transition.mutate(
      { to: pending, reason },
      { onSuccess: () => setPending(null) },
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((step, index) => (
          <Button
            key={step}
            variant={index === 0 ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPending(step)}
            title={TRANSITION_DESCRIPTIONS[step]}
          >
            {TRANSITION_LABELS[step]}
            <ArrowRight aria-hidden />
          </Button>
        ))}
      </div>

      <ReasonDialog
        open={pending !== null && needsReason}
        title={pending ? TRANSITION_LABELS[pending] : ''}
        description={pending ? TRANSITION_DESCRIPTIONS[pending] : undefined}
        label="Reason"
        placeholder="Why this exam is moving back or being closed"
        confirmLabel={pending ? TRANSITION_LABELS[pending] : 'Confirm'}
        tone={pending === 'archived' ? 'danger' : 'primary'}
        isPending={transition.isPending}
        onCancel={() => setPending(null)}
        onConfirm={run}
      />

      <ConfirmDialog
        open={pending !== null && !needsReason}
        title={pending ? `${TRANSITION_LABELS[pending]}?` : ''}
        description={pending ? TRANSITION_DESCRIPTIONS[pending] : ''}
        confirmLabel={pending ? TRANSITION_LABELS[pending] : 'Confirm'}
        isPending={transition.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => run()}
      />
    </>
  );
}
