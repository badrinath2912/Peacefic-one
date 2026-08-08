import type { GradePolicyInput } from '../schemas/examination.schema';

import { roundTo } from './grade-engine';

/**
 * Credit-weighted GPA and CGPA.
 *
 * Every policy decision — how repeats count, whether failed credits sit in the
 * divisor, how many decimal places — comes from the college's grade policy.
 * These functions are pure so the arithmetic can be tested exhaustively.
 */

export interface SubjectResult {
  /** Identifies the subject across attempts; repeats share it. */
  courseId: string;
  courseCode?: string;
  courseTitle?: string;
  semester: number;
  credits: number;
  gradePoint: number;
  letter: string;
  isPass: boolean;
  /** 1 for the first sitting, 2+ for each resit. */
  attempt: number;
  percentage?: number;
  examId?: string;
}

export interface SemesterGpa {
  semester: number;
  /** Credits counted in the divisor, after the failed-credit policy. */
  creditsAttempted: number;
  /** Credits from passed subjects only. */
  creditsEarned: number;
  gpa: number;
  subjectCount: number;
  failedCount: number;
  subjects: SubjectResult[];
}

export interface CgpaResult {
  cgpa: number;
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  semesters: SemesterGpa[];
  /** Subjects still unpassed across every semester. */
  activeBacklogs: number;
  totalBacklogs: number;
}

/**
 * Reduces multiple attempts at one subject to the single result that counts,
 * per the configured repeat policy.
 *
 * `best_attempt` — highest grade point wins (the common convention).
 * `latest_attempt` — the most recent sitting supersedes, even if it is worse.
 * `first_pass` — the first passing attempt; failing attempts before it are
 *   discarded, which matters where a resit is capped at a bare pass.
 */
export function resolveAttempts(
  results: SubjectResult[],
  policy: Pick<GradePolicyInput, 'repeatPolicy'>,
): SubjectResult[] {
  const byCourse = new Map<string, SubjectResult[]>();

  for (const result of results) {
    // Keyed by course *and* semester: the same course legitimately recurs in a
    // different semester and those are separate results, not repeats.
    const key = `${result.courseId}:${result.semester}`;
    const existing = byCourse.get(key);
    if (existing) existing.push(result);
    else byCourse.set(key, [result]);
  }

  const resolved: SubjectResult[] = [];

  for (const attempts of byCourse.values()) {
    if (attempts.length === 1) {
      resolved.push(attempts[0]!);
      continue;
    }

    const sorted = [...attempts].sort((a, b) => a.attempt - b.attempt);

    switch (policy.repeatPolicy) {
      case 'latest_attempt':
        resolved.push(sorted[sorted.length - 1]!);
        break;

      case 'first_pass': {
        // Falls back to the last attempt when none passed, so the subject
        // still appears as an outstanding backlog.
        const firstPass = sorted.find((attempt) => attempt.isPass);
        resolved.push(firstPass ?? sorted[sorted.length - 1]!);
        break;
      }

      case 'best_attempt':
      default: {
        const best = sorted.reduce((winner, attempt) => {
          if (attempt.gradePoint > winner.gradePoint) return attempt;
          // On a tie the later attempt wins: it is the more current record.
          if (attempt.gradePoint === winner.gradePoint && attempt.attempt > winner.attempt) {
            return attempt;
          }
          return winner;
        }, sorted[0]!);

        resolved.push(best);
        break;
      }
    }
  }

  return resolved;
}

/**
 * Credit-weighted GPA for one semester: Σ(gradePoint × credits) ÷ Σ(credits).
 *
 * Zero-credit subjects are graded and reported but contribute nothing to the
 * average, which is how audit and non-credit courses are meant to behave.
 */
export function calculateSemesterGpa(
  subjects: SubjectResult[],
  policy: GradePolicyInput,
): SemesterGpa {
  const semester = subjects[0]?.semester ?? 0;

  let weightedPoints = 0;
  let creditsAttempted = 0;
  let creditsEarned = 0;
  let failedCount = 0;

  for (const subject of subjects) {
    if (!subject.isPass) failedCount += 1;

    if (subject.credits <= 0) continue;

    if (subject.isPass) {
      creditsEarned += subject.credits;
      weightedPoints += subject.gradePoint * subject.credits;
      creditsAttempted += subject.credits;
      continue;
    }

    // A failed subject drags the average down only where the policy says its
    // credits stay in the divisor; otherwise it is excluded entirely.
    if (policy.countFailedCredits) {
      weightedPoints += subject.gradePoint * subject.credits;
      creditsAttempted += subject.credits;
    }
  }

  const gpa = creditsAttempted > 0 ? weightedPoints / creditsAttempted : 0;

  return {
    semester,
    creditsAttempted,
    creditsEarned,
    gpa: roundTo(gpa, policy.gpaDecimalPlaces),
    subjectCount: subjects.length,
    failedCount,
    subjects,
  };
}

/**
 * Overall CGPA across every semester.
 *
 * Computed from the pooled credits rather than by averaging the semester GPAs:
 * averaging averages ignores that semesters carry different credit loads and
 * produces a different, wrong number.
 */
export function calculateCgpa(results: SubjectResult[], policy: GradePolicyInput): CgpaResult {
  const counted = resolveAttempts(results, policy);

  const bySemester = new Map<number, SubjectResult[]>();
  for (const subject of counted) {
    const existing = bySemester.get(subject.semester);
    if (existing) existing.push(subject);
    else bySemester.set(subject.semester, [subject]);
  }

  const semesters = [...bySemester.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, subjects]) => calculateSemesterGpa(subjects, policy));

  let weightedPoints = 0;
  let totalCreditsAttempted = 0;
  let totalCreditsEarned = 0;

  for (const semester of semesters) {
    weightedPoints += semester.gpa * semester.creditsAttempted;
    totalCreditsAttempted += semester.creditsAttempted;
    totalCreditsEarned += semester.creditsEarned;
  }

  const cgpa = totalCreditsAttempted > 0 ? weightedPoints / totalCreditsAttempted : 0;

  // A backlog is a subject with no passing attempt anywhere in the history —
  // the resolved set alone would hide one cleared on a resit.
  const passedKeys = new Set(
    results.filter((r) => r.isPass).map((r) => `${r.courseId}:${r.semester}`),
  );
  const allKeys = new Set(results.map((r) => `${r.courseId}:${r.semester}`));

  const activeBacklogs = [...allKeys].filter((key) => !passedKeys.has(key)).length;
  const totalBacklogs = results.filter((result) => !result.isPass).length;

  return {
    cgpa: roundTo(cgpa, policy.gpaDecimalPlaces),
    totalCreditsAttempted,
    totalCreditsEarned,
    semesters,
    activeBacklogs,
    totalBacklogs,
  };
}

/**
 * Percentage equivalent of a CGPA. There is no universal formula, so the
 * multiplier is supplied by the caller from college policy — the widespread
 * `CGPA × 9.5` is a CBSE convention, not a standard.
 */
export function cgpaToPercentage(cgpa: number, multiplier: number): number {
  return roundTo(cgpa * multiplier, 2);
}
