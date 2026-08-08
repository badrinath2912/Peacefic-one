'use client';

import {
  calculateGrade,
  type GradeBandInput,
  type GradePolicyInput,
} from '@peacefic/shared';
import { useEffect, useRef, useState } from 'react';

import type { MarksEntry } from '@/api/examination-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { personName } from '@/lib/examination-display';
import { formatDateTime } from '@/lib/utils';

interface Props {
  open: boolean;
  entry: MarksEntry | null;
  maxMarks: { theory: number; practical: number; internal: number };
  bands: GradeBandInput[];
  policy: GradePolicyInput;
  isPending: boolean;
  onConfirm: (payload: {
    studentId: string;
    theory: number | null;
    practical: number | null;
    internal: number | null;
    graceMarks: number;
    reason: string;
  }) => void;
  onCancel: () => void;
}

const MIN_REASON = 10;

function toValue(value: number | null): string {
  return value === null || value === undefined ? '' : String(value);
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Correcting a verified or published mark.
 *
 * Distinct from ordinary entry on purpose: the prior values go into the entry's
 * history with the reason and the actor, the row re-enters the verification
 * queue rather than keeping the sign-off the old value carried, and a student
 * already holding a published result is notified that it changed.
 */
export function CorrectMarkDialog({
  open,
  entry,
  maxMarks,
  bands,
  policy,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [theory, setTheory] = useState('');
  const [practical, setPractical] = useState('');
  const [internal, setInternal] = useState('');
  const [grace, setGrace] = useState('0');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && entry && !dialog.open) {
      setTheory(toValue(entry.theory));
      setPractical(toValue(entry.practical));
      setInternal(toValue(entry.internal));
      setGrace(String(entry.graceMarks ?? 0));
      setReason('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, entry]);

  if (!entry) return null;

  const studentId = typeof entry.studentId === 'string' ? entry.studentId : entry.studentId.id;
  const rollNumber =
    typeof entry.studentId === 'string' ? entry.studentId : entry.studentId.rollNumber;

  const preview = calculateGrade(
    {
      obtained: {
        theory: Number(theory) || 0,
        practical: Number(practical) || 0,
        internal: Number(internal) || 0,
      },
      maximum: maxMarks,
      graceMarks: Number(grace) || 0,
      attendancePercent: null,
    },
    bands,
    policy,
    { isAbsent: entry.isAbsent },
  );

  const trimmedReason = reason.trim();
  const remaining = MIN_REASON - trimmedReason.length;
  const canConfirm = trimmedReason.length >= MIN_REASON;

  const components: Array<{
    key: 'theory' | 'practical' | 'internal';
    label: string;
    value: string;
    set: (value: string) => void;
  }> = [
    { key: 'theory', label: 'Theory', value: theory, set: setTheory },
    { key: 'practical', label: 'Practical', value: practical, set: setPractical },
    { key: 'internal', label: 'Internal', value: internal, set: setInternal },
  ];

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-overlay backdrop:bg-black/50"
      aria-labelledby="correct-title"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="correct-title" className="font-semibold">
            Correct {rollNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {personName(entry.studentId)} · currently {entry.letter} at {entry.percentage}%
            {entry.publishedVersion !== null
              ? ' · published, so the student will be notified of the change'
              : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {components.map((component) => (
            <label key={component.key} className="block space-y-1.5">
              <span className="text-sm font-medium">
                {component.label}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  /{maxMarks[component.key]}
                </span>
              </span>
              <input
                type="number"
                min={0}
                max={maxMarks[component.key]}
                step="0.5"
                value={component.value}
                disabled={maxMarks[component.key] === 0}
                onChange={(event) => component.set(event.target.value)}
                className="tabular h-9 w-full rounded-md border border-input bg-surface px-2 text-right text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-60"
              />
            </label>
          ))}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Grace
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                /{policy.maxGraceMarks}
              </span>
            </span>
            <input
              type="number"
              min={0}
              max={policy.maxGraceMarks}
              step="0.5"
              value={grace}
              disabled={policy.maxGraceMarks === 0}
              onChange={(event) => setGrace(event.target.value)}
              className="tabular h-9 w-full rounded-md border border-input bg-surface px-2 text-right text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-60"
            />
          </label>
        </div>

        <div
          className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm"
          aria-live="polite"
        >
          <span className="text-muted-foreground">Will become</span>
          <Badge tone={preview.isPass ? 'success' : 'danger'}>{preview.letter}</Badge>
          <span className="tabular">
            {preview.finalTotal} / {preview.maxTotal}
          </span>
          <span className="tabular">{preview.percentage}%</span>
          <span className="tabular text-muted-foreground">{preview.gradePoint} points</span>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Reason</span>
          <textarea
            rows={3}
            value={reason}
            placeholder="Revaluation of question 4 following an appeal"
            onChange={(event) => setReason(event.target.value)}
            className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="block text-xs text-muted-foreground" aria-live="polite">
            {canConfirm
              ? 'Recorded in this mark’s history and in the audit log.'
              : `${remaining} more character${remaining === 1 ? '' : 's'} needed.`}
          </span>
        </label>

        {entry.history.length > 0 ? (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {entry.history.length} previous correction
              {entry.history.length === 1 ? '' : 's'}
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {[...entry.history].reverse().map((item) => (
                <li key={item.version} className="px-3 py-2 text-xs">
                  <span className="tabular font-medium">
                    {item.letter} · {item.percentage}%
                  </span>
                  <span className="text-muted-foreground"> — {item.reason}</span>
                  <span className="block text-muted-foreground">
                    {formatDateTime(item.changedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                studentId,
                theory: toNumberOrNull(theory),
                practical: toNumberOrNull(practical),
                internal: toNumberOrNull(internal),
                graceMarks: Number(grace) || 0,
                reason: trimmedReason,
              })
            }
            disabled={!canConfirm}
            isLoading={isPending}
            loadingText="Correcting"
          >
            Save correction
          </Button>
        </div>
      </div>
    </dialog>
  );
}
