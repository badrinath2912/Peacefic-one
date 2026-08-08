'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from './button';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Matches the server's minimum so the request is not rejected on submit. */
  minLength?: number;
  isPending?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Used wherever an action demands a written reason — rejections, cancellations,
 * attendance corrections. The reason is not decoration: it is carried into the
 * audit log and, usually, into the notification the affected person receives.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  tone = 'primary',
  minLength = 10,
  isPending,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setReason('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trimmed = reason.trim();
  const remaining = minLength - trimmed.length;
  const canConfirm = trimmed.length >= minLength;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-overlay backdrop:bg-black/50"
      aria-labelledby="reason-title"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="reason-title" className="font-semibold">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{label}</span>
          <textarea
            rows={4}
            value={reason}
            placeholder={placeholder}
            onChange={(event) => setReason(event.target.value)}
            className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          {/* Counts down rather than reporting a failure after the fact. */}
          <span className="block text-xs text-muted-foreground" aria-live="polite">
            {canConfirm ? 'Ready to submit.' : `${remaining} more character${remaining === 1 ? '' : 's'} needed.`}
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => onConfirm(trimmed)}
            disabled={!canConfirm}
            isLoading={isPending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
