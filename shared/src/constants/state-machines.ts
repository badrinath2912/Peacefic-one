import type { ApplicationStatus, InterviewStatus, PlacementStatus } from './enums';

/**
 * The placement state machines, in one place so the server and the client
 * cannot disagree about what is legal.
 *
 * The server remains the authority: every transition is still validated in the
 * service, and an illegal one still fails with a 422. These maps let the UI
 * avoid offering a move that would be refused — they do not enforce anything.
 */

/**
 * How an application may move.
 *
 * `rejected`, `withdrawn` and `offer_declined` are terminal. A candidate can be
 * rejected from any live stage, because a company can stop at any point.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied: ['under_review', 'shortlisted', 'rejected', 'withdrawn'],
  under_review: ['shortlisted', 'rejected', 'withdrawn'],
  shortlisted: ['in_process', 'selected', 'rejected', 'withdrawn'],
  in_process: ['selected', 'rejected', 'withdrawn'],
  // Once selected, the student's exit is declining the offer, not withdrawing.
  selected: ['offer_declined'],
  rejected: [],
  withdrawn: [],
  offer_declined: [],
};

/** Application transitions a student drives on their own application. */
export const STUDENT_APPLICATION_TRANSITIONS: readonly ApplicationStatus[] = [
  'withdrawn',
  'offer_declined',
];

/** How an offer may move. */
export const PLACEMENT_TRANSITIONS: Record<PlacementStatus, PlacementStatus[]> = {
  offered: ['accepted', 'declined', 'offer_revoked'],
  accepted: ['joined', 'not_joined', 'offer_revoked'],
  declined: [],
  joined: [],
  not_joined: [],
  offer_revoked: [],
};

/**
 * Answering an offer is the student's decision. The office cannot accept or
 * decline on their behalf, even holding `placement:update`.
 */
export const STUDENT_PLACEMENT_TRANSITIONS: readonly PlacementStatus[] = ['accepted', 'declined'];

/**
 * How an interview may move.
 *
 * `rescheduled` is a live state, not a closed one: it marks an interview whose
 * time has been changed and which is waiting to be confirmed again. That is why
 * it carries the same onward edges as `scheduled` — including being moved a
 * second time, which happens.
 *
 * `completed`, `cancelled` and `no_show` are terminal. An interview that did
 * not happen is closed by `cancelled` (called off) or `no_show` (nobody came),
 * and the two are kept apart because a placement report needs to tell them
 * apart.
 */
export const INTERVIEW_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  scheduled: ['confirmed', 'rescheduled', 'in_progress', 'cancelled', 'no_show'],
  confirmed: ['rescheduled', 'in_progress', 'cancelled', 'no_show'],
  rescheduled: ['confirmed', 'rescheduled', 'in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/**
 * The only interview transition a student drives.
 *
 * Requesting a different time is a request, not a move: it records what the
 * student asked for and leaves the status alone, because only the office can
 * actually change the slot.
 */
export const STUDENT_INTERVIEW_TRANSITIONS: readonly InterviewStatus[] = ['confirmed'];

/**
 * The transitions a given side may drive, with the other side's own decisions
 * removed. Used by the UI so a button that would be refused is never shown.
 */
export function officeTransitions<T extends string>(
  transitions: Record<T, T[]>,
  studentOwned: readonly T[],
): Record<T, T[]> {
  const owned = new Set<T>(studentOwned);

  return Object.fromEntries(
    (Object.entries(transitions) as Array<[T, T[]]>).map(([from, targets]) => [
      from,
      targets.filter((target) => !owned.has(target)),
    ]),
  ) as Record<T, T[]>;
}
