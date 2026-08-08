'use client';

import {
  calculateGrade,
  type GradeBandInput,
  type GradePolicyInput,
} from '@peacefic/shared';
import { useMemo } from 'react';

import type { ExamAttendanceRecord, MarksEntry } from '@/api/examination-queries';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MarksDraft {
  theory: string;
  practical: string;
  internal: string;
  graceMarks: string;
}

export interface MarksRow {
  studentId: string;
  rollNumber: string;
  name: string;
  attempt: number;
  /** Absent, debarred or malpractice — the grade engine fails these outright. */
  isNonAppearing: boolean;
  attendanceStatus: ExamAttendanceRecord['status'] | null;
  existing: MarksEntry | undefined;
}

interface Props {
  rows: MarksRow[];
  drafts: Record<string, MarksDraft>;
  maxMarks: { theory: number; practical: number; internal: number };
  bands: GradeBandInput[];
  policy: GradePolicyInput;
  onChange: (studentId: string, field: keyof MarksDraft, value: string) => void;
  /** Verified and locked rows need a reasoned correction, not an overwrite. */
  isRowLocked: (row: MarksRow) => boolean;
  disabled?: boolean;
}

const EMPTY_DRAFT: MarksDraft = { theory: '', practical: '', internal: '', graceMarks: '0' };

/** Blank means "not entered"; the engine treats it as zero for the preview. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The marks sheet.
 *
 * Every grade shown in the preview column comes from `calculateGrade` in
 * `@peacefic/shared` — the same pure function the server runs when it saves.
 * The client computes nothing of its own: no pass mark, no band boundary and no
 * grace cap is duplicated here, so an examiner sees the grade they are about to
 * commit rather than an approximation of it.
 */
export function MarksEntryGrid({
  rows,
  drafts,
  maxMarks,
  bands,
  policy,
  onChange,
  isRowLocked,
  disabled = false,
}: Props) {
  const maxTotal = maxMarks.theory + maxMarks.practical + maxMarks.internal;

  const previews = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateGrade>>();

    for (const row of rows) {
      const draft = drafts[row.studentId] ?? EMPTY_DRAFT;

      map.set(
        row.studentId,
        calculateGrade(
          {
            obtained: {
              theory: toNumber(draft.theory),
              practical: toNumber(draft.practical),
              internal: toNumber(draft.internal),
            },
            maximum: maxMarks,
            graceMarks: toNumber(draft.graceMarks),
            // Bonus needs a real attendance percentage the client does not
            // hold, so the preview shows the un-bonused figure and the server
            // adds any bonus on save.
            attendancePercent: null,
          },
          bands,
          policy,
          { isAbsent: row.isNonAppearing },
        ),
      );
    }

    return map;
  }, [rows, drafts, maxMarks, bands, policy]);

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[58rem] text-sm">
        <caption className="sr-only">
          Marks entry. Each row shows the grade that will be saved, computed by the shared grade
          engine.
        </caption>

        <thead className="bg-surface-sunken">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Candidate
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Theory<span className="ml-1 font-normal normal-case">/{maxMarks.theory}</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Practical<span className="ml-1 font-normal normal-case">/{maxMarks.practical}</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Internal<span className="ml-1 font-normal normal-case">/{maxMarks.internal}</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Grace
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total<span className="ml-1 font-normal normal-case">/{maxTotal}</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              %
            </th>
            <th scope="col" className="px-3 py-2 text-center font-medium">
              Grade
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              State
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const draft = drafts[row.studentId] ?? EMPTY_DRAFT;
            const preview = previews.get(row.studentId);
            const locked = isRowLocked(row) || disabled;

            return (
              <tr
                key={row.studentId}
                className={cn(
                  'transition-colors',
                  row.isNonAppearing && 'bg-danger-subtle/40',
                  locked && 'opacity-70',
                )}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="block font-medium">{row.rollNumber}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.name}</span>
                  {row.attempt > 1 ? (
                    <Badge tone="warning" className="mt-1">
                      Attempt {row.attempt}
                    </Badge>
                  ) : null}
                </th>

                {(['theory', 'practical', 'internal'] as const).map((component) => (
                  <td key={component} className="px-3 py-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={maxMarks[component]}
                      step="0.5"
                      value={draft[component]}
                      disabled={locked || maxMarks[component] === 0}
                      onChange={(event) => onChange(row.studentId, component, event.target.value)}
                      aria-label={`${component} marks for ${row.rollNumber}`}
                      aria-invalid={toNumber(draft[component]) > maxMarks[component] || undefined}
                      className={cn(
                        'tabular h-9 w-20 rounded-md border border-input bg-surface px-2 text-right text-sm shadow-xs',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
                        // Flagged here as well as server-side, because finding a
                        // typo after a 200-row submit is the expensive path.
                        toNumber(draft[component]) > maxMarks[component] &&
                          'border-danger text-danger',
                      )}
                    />
                  </td>
                ))}

                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={policy.maxGraceMarks}
                    step="0.5"
                    value={draft.graceMarks}
                    disabled={locked || policy.maxGraceMarks === 0}
                    onChange={(event) => onChange(row.studentId, 'graceMarks', event.target.value)}
                    aria-label={`Grace marks for ${row.rollNumber}`}
                    title={
                      policy.maxGraceMarks === 0
                        ? 'This grade scale allows no grace.'
                        : `Capped at ${policy.maxGraceMarks} by the grade policy.`
                    }
                    className={cn(
                      'tabular h-9 w-16 rounded-md border border-input bg-surface px-2 text-right text-sm shadow-xs',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
                    )}
                  />
                </td>

                <td className="tabular px-3 py-2 text-right font-medium" aria-live="polite">
                  {preview?.finalTotal ?? 0}
                </td>

                <td className="tabular px-3 py-2 text-right">{preview?.percentage ?? 0}%</td>

                <td className="px-3 py-2 text-center">
                  <Badge tone={preview?.isPass ? 'success' : 'danger'}>
                    {preview?.letter || '—'}
                  </Badge>
                  {preview?.graceApplied ? (
                    <span className="mt-0.5 block text-2xs text-warning">
                      +{preview.graceApplied} grace
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {row.isNonAppearing ? (
                      <Badge tone="danger" className="capitalize">
                        {row.attendanceStatus ?? 'absent'}
                      </Badge>
                    ) : null}

                    {row.existing ? (
                      <Badge tone={row.existing.status === 'locked' ? 'info' : 'neutral'}>
                        {row.existing.status}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not entered</span>
                    )}

                    {row.existing?.history.length ? (
                      <span className="text-2xs text-muted-foreground">
                        {row.existing.history.length} correction
                        {row.existing.history.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
