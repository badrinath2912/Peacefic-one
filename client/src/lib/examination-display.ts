import { EXAM_LIFECYCLE, type ExamLifecycle } from '@peacefic/shared';

/**
 * Presentation only.
 *
 * Which transitions are *legal* is the server's answer — every detail view
 * reads `allowedTransitions` from `/examinations/:id/profile` rather than
 * recomputing the state machine here, so the two can never disagree. This file
 * supplies the labels, ordering and tones for what the server already decided.
 */

export const LIFECYCLE_ORDER: readonly ExamLifecycle[] = EXAM_LIFECYCLE;

export const LIFECYCLE_LABELS: Record<ExamLifecycle, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  completed: 'Completed',
  marks_entered: 'Marks entered',
  results_published: 'Results published',
  archived: 'Archived',
};

/** What the button says, phrased as the action rather than the destination. */
export const TRANSITION_LABELS: Record<ExamLifecycle, string> = {
  draft: 'Return to draft',
  scheduled: 'Schedule',
  published: 'Publish exam',
  completed: 'Mark complete',
  marks_entered: 'Close marks entry',
  results_published: 'Publish results',
  archived: 'Archive',
};

/** One line explaining what the transition actually does to the world. */
export const TRANSITION_DESCRIPTIONS: Record<ExamLifecycle, string> = {
  draft: 'Pulls the exam back to draft. Nothing has been announced yet.',
  scheduled: 'Fixes the date, venue and duration. Needs a scheduled date.',
  published: 'Makes the exam visible to candidates and validates hall tickets. Notifies everyone registered.',
  completed: 'Records that the sitting is over and freezes the appearance counts.',
  marks_entered: 'Closes entry. Every candidate who appeared must already have a verified mark.',
  results_published: 'Releases grades to students.',
  archived: 'Closes the exam to further change. This cannot be undone.',
};

export const LIFECYCLE_TONES: Record<
  ExamLifecycle,
  'neutral' | 'info' | 'primary' | 'warning' | 'success'
> = {
  draft: 'neutral',
  scheduled: 'info',
  published: 'primary',
  completed: 'warning',
  marks_entered: 'warning',
  results_published: 'success',
  archived: 'neutral',
};

/** Transitions that need a typed reason before they are allowed to proceed. */
export const TRANSITIONS_NEEDING_REASON = new Set<ExamLifecycle>(['draft', 'archived']);

export function lifecycleIndex(status: ExamLifecycle): number {
  return LIFECYCLE_ORDER.indexOf(status);
}

export const MARKS_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  locked: 'Locked',
};

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  debarred: 'Debarred',
  malpractice: 'Malpractice',
};

/**
 * A relation arrives either as an id or as the populated document, depending on
 * whether the caller asked for it. Every table cell needs the same fallback.
 */
export function relationField<T extends Record<string, unknown>>(
  relation: string | T | null | undefined,
  field: keyof T & string,
): string {
  if (!relation || typeof relation !== 'object') return '—';
  const value = relation[field];
  return value === null || value === undefined ? '—' : String(value);
}

/** `firstName lastName` off a populated user, wherever it is nested. */
export function personName(relation: unknown): string {
  if (!relation || typeof relation !== 'object') return '—';
  const user = (relation as { userId?: unknown }).userId;
  const source = user && typeof user === 'object' ? user : relation;
  const first = (source as { firstName?: string }).firstName ?? '';
  const last = (source as { lastName?: string }).lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || '—';
}
