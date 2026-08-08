'use client';

import type { ExamLifecycle } from '@peacefic/shared';
import { Check } from 'lucide-react';

import { LIFECYCLE_LABELS, LIFECYCLE_ORDER, lifecycleIndex } from '@/lib/examination-display';
import { cn } from '@/lib/utils';

/**
 * The seven states as a progress track.
 *
 * Read-only on purpose: a step is not a button. Moving an exam forward has
 * preconditions the server checks (registrations exist, every appearing
 * candidate has a verified mark), so the action lives in the transition
 * control that reads `allowedTransitions` — not in a step the user can click
 * and be refused by.
 */
export function LifecycleStepper({ status }: { status: ExamLifecycle }) {
  const current = lifecycleIndex(status);

  return (
    <ol
      className="scrollbar-thin flex items-center gap-1 overflow-x-auto pb-1"
      aria-label="Examination lifecycle"
    >
      {LIFECYCLE_ORDER.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <div
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active && 'border-primary bg-primary-subtle text-primary',
                done && 'border-success/30 bg-success-subtle text-success',
                !active && !done && 'border-border text-muted-foreground',
              )}
            >
              {done ? (
                <Check className="size-3" aria-hidden />
              ) : (
                <span
                  className={cn(
                    'tabular grid size-4 place-items-center rounded-full text-2xs',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                  aria-hidden
                >
                  {index + 1}
                </span>
              )}
              <span className="whitespace-nowrap">{LIFECYCLE_LABELS[step]}</span>
              {active ? <span className="sr-only">(current stage)</span> : null}
            </div>

            {index < LIFECYCLE_ORDER.length - 1 ? (
              <span
                className={cn('h-px w-3 shrink-0', done ? 'bg-success/40' : 'bg-border')}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
