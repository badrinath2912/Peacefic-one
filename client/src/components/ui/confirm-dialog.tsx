'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from './button';
import { Input } from './input';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** When set, the user must type this exactly before confirming. */
  typeToConfirm?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native `<dialog>`, so focus trapping, Escape and the backdrop come from the
 * platform rather than being reimplemented (usually incompletely).
 *
 * `typeToConfirm` is reserved for the irreversible actions — a bulk delete
 * should cost more than a reflexive click on a button in the usual place.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  typeToConfirm,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setTyped('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const canConfirm = !typeToConfirm || typed.trim() === typeToConfirm;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="max-w-md rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-overlay backdrop:bg-black/50"
      aria-labelledby="confirm-title"
    >
      <div className="space-y-4 p-6">
        <div className="flex gap-3">
          {tone === 'danger' ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-subtle text-danger">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          ) : null}

          <div className="space-y-1">
            <h2 id="confirm-title" className="font-semibold">
              {title}
            </h2>
            <div className="text-sm text-muted-foreground">{description}</div>
          </div>
        </div>

        {typeToConfirm ? (
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">
              Type <strong className="font-mono text-foreground">{typeToConfirm}</strong> to confirm
            </span>
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              aria-label={`Type ${typeToConfirm} to confirm`}
            />
          </label>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
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
