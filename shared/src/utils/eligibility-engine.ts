import type { EligibilityInput, EligibilityReason, EligibilityResult } from '../schemas/placement.schema';

/**
 * Pure eligibility evaluation. Nothing here touches a database, a request or a
 * framework, so every rule can be exercised exhaustively in unit tests and the
 * client can preview an outcome using the identical implementation.
 *
 * The server remains the authority: it builds the `StudentSnapshot` from its
 * own data and re-evaluates on every application. A client that renders
 * "eligible" proves nothing.
 */

/**
 * Everything a rule can read about a student.
 *
 * Deliberately a flat snapshot rather than the Student document: the engine
 * must not know how a CGPA is computed or where attendance lives. The caller
 * assembles this from the existing Examination, Attendance and Student data,
 * so none of that arithmetic is duplicated here.
 */
export interface StudentSnapshot {
  studentId: string;
  departmentId: string;
  batchId: string;
  graduationYear: number | null;
  gender: string | null;

  cgpa: number | null;
  activeBacklogs: number;
  totalBacklogs: number;

  tenthPercent: number | null;
  twelfthPercent: number | null;
  diplomaPercent: number | null;
  yearGap: number;

  /** Overall attendance, null when nothing has been recorded yet. */
  attendancePercent: number | null;

  skills: string[];
  qualifications: string[];

  isPlaced: boolean;
  /** Set false by the office to bar a student from drives entirely. */
  isEligibleForPlacement: boolean;
  eligibilityNote: string | null;
}

/** Stable identifiers so a client can key off a rule without parsing prose. */
export const ELIGIBILITY_RULES = {
  PLACEMENT_BLOCKED: 'placement_blocked',
  ALREADY_PLACED: 'already_placed',
  DEPARTMENT: 'department',
  BATCH: 'batch',
  GRADUATION_YEAR: 'graduation_year',
  MINIMUM_CGPA: 'minimum_cgpa',
  ACTIVE_BACKLOGS: 'active_backlogs',
  TOTAL_BACKLOGS: 'total_backlogs',
  TENTH_PERCENT: 'tenth_percent',
  TWELFTH_PERCENT: 'twelfth_percent',
  DIPLOMA_PERCENT: 'diploma_percent',
  ATTENDANCE: 'minimum_attendance',
  YEAR_GAP: 'year_gap',
  GENDER: 'gender_restriction',
  SKILLS: 'required_skills',
  QUALIFICATION: 'qualification',
} as const;

export type EligibilityRule = (typeof ELIGIBILITY_RULES)[keyof typeof ELIGIBILITY_RULES];

/** Case- and whitespace-insensitive, so "Node.js" matches " node.js ". */
function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function formatList(values: string[], limit = 3): string {
  if (values.length <= limit) return values.join(', ');
  return `${values.slice(0, limit).join(', ')} and ${values.length - limit} more`;
}

/**
 * Evaluates every rule and returns all failures, not just the first.
 *
 * A student told only "you need 7.0 CGPA", who fixes nothing because they also
 * have two backlogs, has been failed twice. The complete list is what makes the
 * answer actionable.
 */
export function evaluateEligibility(
  student: StudentSnapshot,
  criteria: EligibilityInput,
): EligibilityResult {
  const reasons: EligibilityReason[] = [];

  const fail = (rule: EligibilityRule, message: string): void => {
    reasons.push({ rule, message });
  };

  // A student barred from placement fails regardless of every other rule, so
  // this is reported alone rather than buried under academic criteria.
  if (!student.isEligibleForPlacement) {
    return {
      eligible: false,
      reasons: [
        {
          rule: ELIGIBILITY_RULES.PLACEMENT_BLOCKED,
          message:
            student.eligibilityNote?.trim() ||
            'You are not currently eligible for placement. Contact the placement office.',
        },
      ],
    };
  }

  if (student.isPlaced && !criteria.allowPlacedStudents) {
    fail(
      ELIGIBILITY_RULES.ALREADY_PLACED,
      'This drive is not open to students who already hold an offer.',
    );
  }

  if (criteria.departmentIds.length > 0 && !criteria.departmentIds.includes(student.departmentId)) {
    fail(ELIGIBILITY_RULES.DEPARTMENT, 'Your department is not eligible for this role.');
  }

  if (criteria.batchIds.length > 0 && !criteria.batchIds.includes(student.batchId)) {
    fail(ELIGIBILITY_RULES.BATCH, 'Your batch is not eligible for this role.');
  }

  if (criteria.graduationYears.length > 0) {
    // An unknown graduation year cannot be assumed to match.
    if (student.graduationYear === null || !criteria.graduationYears.includes(student.graduationYear)) {
      fail(
        ELIGIBILITY_RULES.GRADUATION_YEAR,
        `Open to the ${formatList(criteria.graduationYears.map(String))} graduating year(s).`,
      );
    }
  }

  if (criteria.minCgpa !== null && criteria.minCgpa !== undefined) {
    // A student with no published results yet has no CGPA, which is not the
    // same as a CGPA of zero — but it cannot clear a minimum either.
    if (student.cgpa === null) {
      fail(
        ELIGIBILITY_RULES.MINIMUM_CGPA,
        `Minimum CGPA required is ${criteria.minCgpa}. No results have been published for you yet.`,
      );
    } else if (student.cgpa < criteria.minCgpa) {
      fail(
        ELIGIBILITY_RULES.MINIMUM_CGPA,
        `Minimum CGPA required is ${criteria.minCgpa}. Yours is ${student.cgpa}.`,
      );
    }
  }

  if (criteria.maxActiveBacklogs !== null && criteria.maxActiveBacklogs !== undefined) {
    if (student.activeBacklogs > criteria.maxActiveBacklogs) {
      fail(
        ELIGIBILITY_RULES.ACTIVE_BACKLOGS,
        criteria.maxActiveBacklogs === 0
          ? `No active backlogs are allowed. You have ${student.activeBacklogs}.`
          : `At most ${criteria.maxActiveBacklogs} active backlog(s) allowed. You have ${student.activeBacklogs}.`,
      );
    }
  }

  if (criteria.maxTotalBacklogs !== null && criteria.maxTotalBacklogs !== undefined) {
    if (student.totalBacklogs > criteria.maxTotalBacklogs) {
      fail(
        ELIGIBILITY_RULES.TOTAL_BACKLOGS,
        `At most ${criteria.maxTotalBacklogs} backlog(s) in total allowed. You have ${student.totalBacklogs}.`,
      );
    }
  }

  const academicBars: Array<{
    rule: EligibilityRule;
    required: number | null | undefined;
    actual: number | null;
    label: string;
  }> = [
    {
      rule: ELIGIBILITY_RULES.TENTH_PERCENT,
      required: criteria.minTenthPercent,
      actual: student.tenthPercent,
      label: 'Class 10',
    },
    {
      rule: ELIGIBILITY_RULES.TWELFTH_PERCENT,
      required: criteria.minTwelfthPercent,
      actual: student.twelfthPercent,
      label: 'Class 12',
    },
    {
      rule: ELIGIBILITY_RULES.DIPLOMA_PERCENT,
      required: criteria.minDiplomaPercent,
      actual: student.diplomaPercent,
      label: 'Diploma',
    },
  ];

  for (const bar of academicBars) {
    if (bar.required === null || bar.required === undefined) continue;

    if (bar.actual === null) {
      fail(
        bar.rule,
        `${bar.label} requires at least ${bar.required}%, and no mark is recorded on your profile.`,
      );
    } else if (bar.actual < bar.required) {
      fail(bar.rule, `${bar.label} requires at least ${bar.required}%. Yours is ${bar.actual}%.`);
    }
  }

  if (criteria.minAttendancePercent !== null && criteria.minAttendancePercent !== undefined) {
    if (student.attendancePercent === null) {
      fail(
        ELIGIBILITY_RULES.ATTENDANCE,
        `Minimum attendance required is ${criteria.minAttendancePercent}%, and none has been recorded for you.`,
      );
    } else if (student.attendancePercent < criteria.minAttendancePercent) {
      fail(
        ELIGIBILITY_RULES.ATTENDANCE,
        `Minimum attendance required is ${criteria.minAttendancePercent}%. Yours is ${student.attendancePercent}%.`,
      );
    }
  }

  if (criteria.maxYearGap !== null && criteria.maxYearGap !== undefined) {
    if (student.yearGap > criteria.maxYearGap) {
      fail(
        ELIGIBILITY_RULES.YEAR_GAP,
        criteria.maxYearGap === 0
          ? `No gap years are allowed. Your profile records ${student.yearGap}.`
          : `At most ${criteria.maxYearGap} gap year(s) allowed. Your profile records ${student.yearGap}.`,
      );
    }
  }

  if (criteria.genderRestriction === 'female_only' && student.gender !== 'female') {
    fail(ELIGIBILITY_RULES.GENDER, 'This drive is open to female candidates only.');
  }

  if (criteria.requiredSkills.length > 0) {
    const held = new Set(student.skills.map(normalise));
    const missing = criteria.requiredSkills.filter((skill) => !held.has(normalise(skill)));

    if (missing.length > 0) {
      fail(
        ELIGIBILITY_RULES.SKILLS,
        `Missing required skill(s): ${formatList(missing)}. Add them to your profile if you have them.`,
      );
    }
  }

  if (criteria.qualifications.length > 0) {
    // Any one accepted qualification is enough — these are alternatives, not
    // a checklist.
    const held = new Set(student.qualifications.map(normalise));
    const matches = criteria.qualifications.some((qualification) => held.has(normalise(qualification)));

    if (!matches) {
      fail(
        ELIGIBILITY_RULES.QUALIFICATION,
        `Open to ${formatList(criteria.qualifications)}. Your recorded qualification does not match.`,
      );
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/** Convenience for list endpoints that only need the verdict. */
export function isEligible(student: StudentSnapshot, criteria: EligibilityInput): boolean {
  return evaluateEligibility(student, criteria).eligible;
}

/**
 * A Mongo filter that narrows candidates before the engine runs.
 *
 * This is an optimisation, never the decision: it removes obvious misses so a
 * 4,000-student college is not loaded into memory, and `evaluateEligibility`
 * still runs on everything that survives. Rules that cannot be expressed as a
 * simple field comparison — skills, qualifications, attendance — are absent
 * here on purpose.
 */
export function eligibilityPrefilter(criteria: EligibilityInput): Record<string, unknown> {
  const filter: Record<string, unknown> = { status: 'active' };

  if (criteria.departmentIds.length > 0) filter.departmentId = { $in: criteria.departmentIds };
  if (criteria.batchIds.length > 0) filter.batchId = { $in: criteria.batchIds };

  if (criteria.minCgpa !== null && criteria.minCgpa !== undefined) {
    filter['academics.currentCgpa'] = { $gte: criteria.minCgpa };
  }

  if (criteria.maxActiveBacklogs !== null && criteria.maxActiveBacklogs !== undefined) {
    filter['academics.activeBacklogs'] = { $lte: criteria.maxActiveBacklogs };
  }

  if (criteria.genderRestriction === 'female_only') filter.gender = 'female';

  if (!criteria.allowPlacedStudents) filter['placement.isPlaced'] = false;

  return filter;
}
