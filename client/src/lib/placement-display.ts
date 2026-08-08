import {
  APPLICATION_STATUS,
  APPLICATION_TRANSITIONS,
  COMPANY_STATUS,
  COMPANY_TYPE,
  INTERVIEW_MODE,
  INTERVIEW_RESULT_STATUS,
  INTERVIEW_STATUS,
  INTERVIEW_TRANSITIONS,
  JOB_STATUS,
  JOB_TYPE,
  officeTransitions,
  PLACEMENT_STATUS,
  PLACEMENT_TRANSITIONS,
  SELECTION_ROUND_TYPE,
  STUDENT_APPLICATION_TRANSITIONS,
  STUDENT_INTERVIEW_TRANSITIONS,
  STUDENT_PLACEMENT_TRANSITIONS,
  WORK_MODE,
  type ApplicationStatus,
  type CompanyStatus,
  type CompanyType,
  type InterviewMode,
  type InterviewResultStatus,
  type InterviewStatus,
  type JobStatus,
  type JobType,
  type PlacementStatus,
  type SelectionRoundType,
  type WorkMode,
} from '@peacefic/shared';

/**
 * Presentation only.
 *
 * Which transitions are *legal* is the server's answer — a job detail view
 * reads `allowedTransitions` from `/jobs/:id/profile` rather than recomputing
 * the state machine here, and eligibility comes back already evaluated. This
 * file supplies labels, tones and formatting for what the server decided.
 */

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/* --------------------------------- company --------------------------------- */

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  product: 'Product',
  service: 'Service',
  startup: 'Startup',
  mnc: 'MNC',
  psu: 'PSU',
  government: 'Government',
};

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  active: 'Active',
  blacklisted: 'Blacklisted',
  inactive: 'Inactive',
};

export const COMPANY_STATUS_TONES: Record<CompanyStatus, Tone> = {
  active: 'success',
  blacklisted: 'danger',
  inactive: 'neutral',
};

export const COMPANY_TYPE_OPTIONS = COMPANY_TYPE.map((value) => ({
  value,
  label: COMPANY_TYPE_LABELS[value],
}));

export const COMPANY_STATUS_OPTIONS = COMPANY_STATUS.map((value) => ({
  value,
  label: COMPANY_STATUS_LABELS[value],
}));

/** Common headcount bands, offered as suggestions rather than enforced. */
export const COMPANY_SIZE_OPTIONS = [
  '1-50',
  '51-200',
  '201-1000',
  '1001-5000',
  '5001-10000',
  '10000+',
].map((value) => ({ value, label: `${value} employees` }));

/* ----------------------------------- job ----------------------------------- */

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_TONES: Record<JobStatus, Tone> = {
  draft: 'neutral',
  published: 'success',
  closed: 'warning',
  completed: 'info',
  cancelled: 'danger',
};

/** What the button says, phrased as the action rather than the destination. */
export const JOB_TRANSITION_LABELS: Record<JobStatus, string> = {
  draft: 'Withdraw to draft',
  published: 'Publish',
  closed: 'Close applications',
  completed: 'Mark complete',
  cancelled: 'Cancel drive',
};

export const JOB_TRANSITION_DESCRIPTIONS: Record<JobStatus, string> = {
  draft: 'Removes the posting from students. Anyone who has applied keeps their application.',
  published: 'Opens applications and notifies every eligible student. Refused if nobody qualifies.',
  closed: 'Stops new applications. The drive continues for those already in it.',
  completed: 'Closes the drive for good once offers are out. This cannot be undone.',
  cancelled: 'Withdraws the role entirely and notifies everyone eligible.',
};

/** Transitions that need a typed reason before they proceed. */
export const JOB_TRANSITIONS_NEEDING_REASON = new Set<JobStatus>(['closed', 'cancelled']);

export const JOB_STATUS_OPTIONS = JOB_STATUS.map((value) => ({
  value,
  label: JOB_STATUS_LABELS[value],
}));

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: 'Full time',
  internship: 'Internship',
  internship_ppo: 'Internship with PPO',
  part_time: 'Part time',
  contract: 'Contract',
};

export const JOB_TYPE_OPTIONS = JOB_TYPE.map((value) => ({
  value,
  label: JOB_TYPE_LABELS[value],
}));

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: 'On site',
  remote: 'Remote',
  hybrid: 'Hybrid',
};

export const WORK_MODE_OPTIONS = WORK_MODE.map((value) => ({
  value,
  label: WORK_MODE_LABELS[value],
}));

export const SELECTION_ROUND_TYPE_LABELS: Record<SelectionRoundType, string> = {
  aptitude: 'Aptitude test',
  technical_test: 'Technical test',
  coding: 'Coding round',
  group_discussion: 'Group discussion',
  technical_interview: 'Technical interview',
  hr_interview: 'HR interview',
  managerial: 'Managerial round',
  other: 'Other',
};

export const SELECTION_ROUND_TYPE_OPTIONS = SELECTION_ROUND_TYPE.map((value) => ({
  value,
  label: SELECTION_ROUND_TYPE_LABELS[value],
}));

export const ROUND_MODE_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'On campus' },
];

export const GENDER_RESTRICTION_OPTIONS = [
  { value: 'any', label: 'Open to all' },
  { value: 'female_only', label: 'Women only' },
];

/**
 * Every eligibility rule the engine can return, in the shape a placement
 * officer would describe it. The engine emits the machine name; this is only
 * how it is worded on screen.
 */
export const ELIGIBILITY_RULE_LABELS: Record<string, string> = {
  placement_blocked: 'Blocked from placement',
  already_placed: 'Already placed',
  department: 'Department',
  batch: 'Batch',
  graduation_year: 'Graduation year',
  minimum_cgpa: 'Minimum CGPA',
  active_backlogs: 'Active backlogs',
  total_backlogs: 'Total backlogs',
  tenth_percent: 'Class X marks',
  twelfth_percent: 'Class XII marks',
  diploma_percent: 'Diploma marks',
  minimum_attendance: 'Attendance',
  year_gap: 'Year gap',
  gender_restriction: 'Gender restriction',
  required_skills: 'Required skills',
  qualification: 'Qualification',
};

/** Reads a rule name for display without pretending an unknown one is fine. */
export function eligibilityRuleLabel(rule: string): string {
  return ELIGIBILITY_RULE_LABELS[rule] ?? rule.replace(/_/g, ' ');
}

/* ------------------------------- application ------------------------------- */

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  in_process: 'In process',
  selected: 'Selected',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  offer_declined: 'Offer declined',
};

export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, Tone> = {
  applied: 'neutral',
  under_review: 'info',
  shortlisted: 'primary',
  in_process: 'warning',
  selected: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  offer_declined: 'warning',
};

/** The pipeline in the order it happens, for a progress track. */
export const APPLICATION_PIPELINE: ApplicationStatus[] = [
  'applied',
  'under_review',
  'shortlisted',
  'in_process',
  'selected',
];

/**
 * The office-controllable part of the application state machine.
 *
 * Derived from the shared map rather than restated, so the client cannot drift
 * from what the service will accept. `withdrawn` and `offer_declined` drop out
 * because they belong to the student, and `advance()` refuses them outright for
 * a staff caller.
 *
 * The server stays the authority: an illegal move still fails with a 422, which
 * the UI surfaces rather than swallows.
 */
export const OFFICE_APPLICATION_TRANSITIONS = officeTransitions(
  APPLICATION_TRANSITIONS,
  STUDENT_APPLICATION_TRANSITIONS,
);

/** The same, for offers. Accepting and declining are the student's own. */
export const OFFICE_PLACEMENT_TRANSITIONS = officeTransitions(
  PLACEMENT_TRANSITIONS,
  STUDENT_PLACEMENT_TRANSITIONS,
);

/** States the student owns; the office is never offered them. */
export const STUDENT_OWNED_STATUSES = new Set<ApplicationStatus>(
  STUDENT_APPLICATION_TRANSITIONS,
);

export const APPLICATION_ACTION_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Reopen',
  under_review: 'Move to review',
  shortlisted: 'Shortlist',
  in_process: 'Move to in process',
  selected: 'Select',
  rejected: 'Reject',
  withdrawn: 'Withdraw',
  offer_declined: 'Decline offer',
};

export const APPLICATION_ACTION_DESCRIPTIONS: Record<ApplicationStatus, string> = {
  applied: 'Returns the application to its initial state.',
  under_review: 'Marks the application as being read. The student is notified.',
  shortlisted: 'Puts the candidate through to the selection rounds.',
  in_process: 'The candidate is partway through the rounds.',
  selected: 'Confirms the candidate has the role. An offer is recorded separately.',
  rejected: 'Ends the application. The student is told, with the reason given.',
  withdrawn: 'The student’s own action.',
  offer_declined: 'The student’s own action.',
};

/** Rejection is the only office action the API requires a reason for. */
export const APPLICATION_ACTIONS_NEEDING_REASON = new Set<ApplicationStatus>(['rejected']);

export const APPLICATION_STATUS_OPTIONS = APPLICATION_STATUS.map((value) => ({
  value,
  label: APPLICATION_STATUS_LABELS[value],
}));

/* -------------------------------- placement -------------------------------- */

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  offered: 'Offered',
  accepted: 'Accepted',
  declined: 'Declined',
  joined: 'Joined',
  offer_revoked: 'Withdrawn',
  not_joined: 'Did not join',
};

export const PLACEMENT_STATUS_TONES: Record<PlacementStatus, Tone> = {
  offered: 'primary',
  accepted: 'success',
  declined: 'warning',
  joined: 'success',
  offer_revoked: 'danger',
  not_joined: 'danger',
};

export const PLACEMENT_STATUS_OPTIONS = PLACEMENT_STATUS.map((value) => ({
  value,
  label: PLACEMENT_STATUS_LABELS[value],
}));

/**
 * What the office button says for each offer transition.
 *
 * `accepted` and `declined` appear for completeness of the record, but are
 * never rendered as office actions: `OFFICE_PLACEMENT_TRANSITIONS` removes
 * them, and the API refuses them to anyone without `placement:respond`.
 */
export const PLACEMENT_ACTION_LABELS: Record<PlacementStatus, string> = {
  offered: 'Reopen offer',
  accepted: 'Accept',
  declined: 'Decline',
  joined: 'Record joining',
  not_joined: 'Record no-show',
  offer_revoked: 'Revoke offer',
};

export const PLACEMENT_ACTION_DESCRIPTIONS: Record<PlacementStatus, string> = {
  offered: 'Returns the offer to its open state.',
  accepted: 'The student’s own decision.',
  declined: 'The student’s own decision.',
  joined: 'Confirms the student started. This closes the placement.',
  not_joined: 'The student accepted but never joined. This closes the placement.',
  offer_revoked: 'The company pulled the offer. The student is notified with the reason.',
};

/** Offer actions the API requires a reason for. */
export const PLACEMENT_ACTIONS_NEEDING_REASON = new Set<PlacementStatus>([
  'offer_revoked',
  'not_joined',
]);

/* --------------------------------- helpers --------------------------------- */

/**
 * Indian-format currency, abbreviated to lakhs and crores.
 *
 * A CTC of 1800000 reads as "₹18.0 L" on a card, which is how it is actually
 * discussed — the raw figure is kept for the tooltip and the export.
 */
export function formatCtc(amount: number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined) return '—';
  if (currency !== 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat('en-IN').format(amount)}`;
}

/** A CTC band, collapsing to a single figure when the ends match. */
export function formatCtcRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = 'INR',
): string {
  if (min === null || min === undefined) return formatCtc(max, currency);
  if (max === null || max === undefined || max === min) return formatCtc(min, currency);
  return `${formatCtc(min, currency)} – ${formatCtc(max, currency)}`;
}

/**
 * A relation arrives either as an id or as the populated document, depending
 * on whether the caller asked for it. Every table cell needs the same fallback.
 */
export function relationField<T extends object>(
  relation: string | T | null | undefined,
  /**
   * Checked against the populated shape where there is one. A bare id infers
   * no shape at all, so the key is only constrained to a string there.
   */
  field: [keyof T] extends [never] ? string : keyof T & string,
): string {
  if (!relation || typeof relation !== 'object') return '—';
  const value = (relation as Record<string, unknown>)[field];
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

/**
 * Whether a company's recruiter details were withheld from this caller.
 *
 * The server strips contacts, email and phone for anyone who cannot manage
 * companies, so an empty set means "not visible to you" rather than "none
 * recorded" — the difference matters when deciding whether to show an empty
 * state or nothing at all.
 */
export function contactsWithheld(company: {
  contacts: unknown[];
  email: string | null;
  phone: string | null;
}): boolean {
  return company.contacts.length === 0 && company.email === null && company.phone === null;
}

/* -------------------------------- interview -------------------------------- */

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Moved',
  no_show: 'Did not attend',
};

export const INTERVIEW_STATUS_TONES: Record<InterviewStatus, Tone> = {
  scheduled: 'primary',
  confirmed: 'success',
  in_progress: 'warning',
  completed: 'info',
  cancelled: 'danger',
  rescheduled: 'warning',
  no_show: 'danger',
};

export const INTERVIEW_STATUS_OPTIONS = INTERVIEW_STATUS.map((value) => ({
  value,
  label: INTERVIEW_STATUS_LABELS[value],
}));

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  online: 'Online',
  offline: 'On campus',
  telephonic: 'Telephone',
};

export const INTERVIEW_MODE_OPTIONS = INTERVIEW_MODE.map((value) => ({
  value,
  label: INTERVIEW_MODE_LABELS[value],
}));

export const INTERVIEW_RESULT_LABELS: Record<InterviewResultStatus, string> = {
  pending: 'Awaiting result',
  cleared: 'Cleared',
  rejected: 'Not cleared',
  on_hold: 'On hold',
  no_show: 'Did not attend',
};

export const INTERVIEW_RESULT_TONES: Record<InterviewResultStatus, Tone> = {
  pending: 'neutral',
  cleared: 'success',
  rejected: 'danger',
  on_hold: 'warning',
  no_show: 'danger',
};

export const INTERVIEW_RESULT_OPTIONS = INTERVIEW_RESULT_STATUS.map((value) => ({
  value,
  label: INTERVIEW_RESULT_LABELS[value],
}));

/** What the office button says for each interview transition. */
export const INTERVIEW_ACTION_LABELS: Record<InterviewStatus, string> = {
  scheduled: 'Reopen',
  confirmed: 'Confirm',
  in_progress: 'Start',
  completed: 'Mark complete',
  cancelled: 'Cancel',
  rescheduled: 'Move',
  no_show: 'Mark as no-show',
};

export const INTERVIEW_ACTION_DESCRIPTIONS: Record<InterviewStatus, string> = {
  scheduled: 'Returns the interview to its scheduled state.',
  confirmed: 'The candidate’s own action.',
  in_progress: 'Marks the interview as under way.',
  completed: 'Closes the round. Record the result to say how it went.',
  cancelled: 'Calls the interview off. The candidate is told, with the reason.',
  rescheduled: 'Moves the interview to another time.',
  no_show: 'Records that the candidate did not attend.',
};

/**
 * The office-controllable part of the interview machine, derived from the
 * shared map rather than restated. Confirming drops out: it belongs to the
 * student, and the service refuses it for a staff caller.
 *
 * Cancelling and moving have their own endpoints with their own payloads, so
 * they are handled separately from the generic transition.
 */
export const OFFICE_INTERVIEW_TRANSITIONS = officeTransitions(
  INTERVIEW_TRANSITIONS,
  STUDENT_INTERVIEW_TRANSITIONS,
);

/** Transitions the generic endpoint drives; the rest have dedicated routes. */
export const INTERVIEW_TRANSITIONS_WITH_OWN_ENDPOINT = new Set<InterviewStatus>([
  'cancelled',
  'rescheduled',
]);
