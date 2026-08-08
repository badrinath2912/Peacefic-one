import type { GradeBandInput, GradePolicyInput } from '../schemas/examination.schema';

/**
 * Pure grading functions. Nothing here touches a database or a request, so the
 * rules can be exercised exhaustively in unit tests and reused unchanged on the
 * client for previews.
 *
 * No grade boundary, pass mark or grade point is hard-coded — every value comes
 * from the college's configured scale.
 */

export interface MarkComponents {
  theory: number;
  practical: number;
  internal: number;
}

export interface GradeResult {
  letter: string;
  gradePoint: number;
  isPass: boolean;
  percentage: number;
}

export interface FinalMarksInput {
  obtained: Partial<MarkComponents>;
  maximum: MarkComponents;
  graceMarks?: number;
  /** Overall attendance, used only when the policy awards a bonus. */
  attendancePercent?: number | null;
}

export interface FinalMarksResult {
  rawTotal: number;
  maxTotal: number;
  attendanceBonus: number;
  graceApplied: number;
  /** Raw + bonus + grace, capped at the maximum. */
  finalTotal: number;
  percentage: number;
  /** True when the cap discarded some of the grace or bonus awarded. */
  wasCapped: boolean;
}

export function sumComponents(components: Partial<MarkComponents>): number {
  return (components.theory ?? 0) + (components.practical ?? 0) + (components.internal ?? 0);
}

/** Rounds to a fixed number of places without floating-point drift. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Computes the final mark from its components.
 *
 * Order matters: the attendance bonus and grace are added to the raw total and
 * the result is capped at the maximum, so neither can push a student above
 * 100%. Grace is applied after the bonus because the bonus is earned and grace
 * is discretionary — a student should not consume discretionary marks to reach
 * a total the bonus would have given them anyway.
 */
export function calculateFinalMarks(
  input: FinalMarksInput,
  policy: GradePolicyInput,
): FinalMarksResult {
  const rawTotal = sumComponents(input.obtained);
  const maxTotal = sumComponents(input.maximum);

  if (maxTotal <= 0) {
    return {
      rawTotal: 0,
      maxTotal: 0,
      attendanceBonus: 0,
      graceApplied: 0,
      finalTotal: 0,
      percentage: 0,
      wasCapped: false,
    };
  }

  let attendanceBonus = 0;

  if (
    policy.attendanceBonusEnabled &&
    input.attendancePercent !== null &&
    input.attendancePercent !== undefined &&
    input.attendancePercent >= policy.attendanceBonusThreshold
  ) {
    attendanceBonus = policy.attendanceBonusMarks;
  }

  // Grace is bounded by the policy regardless of what was requested.
  const requestedGrace = Math.max(0, input.graceMarks ?? 0);
  const graceApplied = Math.min(requestedGrace, policy.maxGraceMarks);

  const uncapped = rawTotal + attendanceBonus + graceApplied;
  const finalTotal = Math.min(uncapped, maxTotal);

  return {
    rawTotal,
    maxTotal,
    attendanceBonus,
    graceApplied,
    finalTotal,
    percentage: roundTo((finalTotal / maxTotal) * 100, 2),
    wasCapped: uncapped > maxTotal,
  };
}

/**
 * Resolves a percentage to a band. Bands are inclusive at both ends and the
 * scale is validated to be gap-free and non-overlapping, so exactly one matches.
 */
export function resolveGrade(percentage: number, bands: GradeBandInput[]): GradeBandInput | null {
  const clamped = Math.min(100, Math.max(0, percentage));

  return (
    bands.find((band) => clamped >= band.minPercent && clamped <= band.maxPercent) ?? null
  );
}

/**
 * Grades a set of marks. A student marked absent or debarred is failed
 * outright regardless of any marks recorded against them.
 */
export function calculateGrade(
  input: FinalMarksInput,
  bands: GradeBandInput[],
  policy: GradePolicyInput,
  options: { isAbsent?: boolean } = {},
): GradeResult & FinalMarksResult {
  const marks = calculateFinalMarks(input, policy);

  if (options.isAbsent) {
    const failing =
      [...bands].sort((a, b) => a.minPercent - b.minPercent).find((band) => !band.isPass) ?? null;

    return {
      ...marks,
      percentage: 0,
      letter: failing?.letter ?? 'F',
      gradePoint: 0,
      isPass: false,
    };
  }

  const band = resolveGrade(marks.percentage, bands);

  // The scale is validated to cover 0-100, so a miss means it was changed
  // after validation. Failing closed is safer than inventing a grade.
  if (!band) {
    return { ...marks, letter: 'F', gradePoint: 0, isPass: false };
  }

  // The band decides the letter, but the policy's passing mark is the
  // authority on whether it is a pass — the two are configured separately.
  const meetsPassMark = marks.percentage >= policy.passingPercent;

  return {
    ...marks,
    letter: band.letter,
    gradePoint: band.gradePoint,
    isPass: band.isPass && meetsPassMark,
  };
}
