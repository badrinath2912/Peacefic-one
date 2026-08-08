'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (scheduledAt: string, reason: string) => void;
}

/**
 * Moving an interview.
 *
 * Two fields rather than one, because `rescheduleInterviewSchema` requires both
 * a new time and a reason of at least three characters — the candidate is told
 * why, so the office has to say.
 */
export function RescheduleDialog({ open, isPending, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      setScheduledAt('');
      setReason('');
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const ready = Boolean(scheduledAt) && reason.trim().length >= 3;

  return (
    <dialog
      ref={dialog}
      onCancel={onCancel}
      onClose={onCancel}
      aria-labelledby="reschedule-title"
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-overlay backdrop:bg-black/40"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="reschedule-title" className="text-lg font-semibold">
            Move this interview?
          </h2>
          <p className="text-sm text-muted-foreground">
            The candidate is notified and asked to confirm the new time.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">New date and time</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Reason</span>
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why the slot is changing."
            className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="block text-xs text-muted-foreground">At least 3 characters.</span>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready}
            isLoading={isPending}
            loadingText="Moving"
            onClick={() => onConfirm(new Date(scheduledAt).toISOString(), reason.trim())}
          >
            Move interview
          </Button>
        </div>
      </div>
    </dialog>
  );
}
