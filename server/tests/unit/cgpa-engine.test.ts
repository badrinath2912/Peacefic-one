import {
  calculateCgpa,
  calculateSemesterGpa,
  cgpaToPercentage,
  resolveAttempts,
  type GradePolicyInput,
  type SubjectResult,
} from '@peacefic/shared';

const POLICY: GradePolicyInput = {
  passingPercent: 40,
  maxGraceMarks: 0,
  maxGracePerSemester: 0,
  attendanceBonusEnabled: false,
  attendanceBonusThreshold: 90,
  attendanceBonusMarks: 0,
  repeatPolicy: 'best_attempt',
  countFailedCredits: true,
  gpaDecimalPlaces: 2,
};

function subject(overrides: Partial<SubjectResult> = {}): SubjectResult {
  return {
    courseId: 'course-a',
    semester: 1,
    credits: 4,
    gradePoint: 8,
    letter: 'A',
    isPass: true,
    attempt: 1,
    ...overrides,
  };
}

describe('cgpa engine', () => {
  describe('resolveAttempts', () => {
    it('leaves a single attempt untouched', () => {
      const results = [subject(), subject({ courseId: 'course-b' })];
      expect(resolveAttempts(results, POLICY)).toHaveLength(2);
    });

    it('keeps the highest grade point under best_attempt', () => {
      const resolved = resolveAttempts(
        [
          subject({ attempt: 1, gradePoint: 0, letter: 'F', isPass: false }),
          subject({ attempt: 2, gradePoint: 6, letter: 'C' }),
        ],
        { repeatPolicy: 'best_attempt' },
      );

      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.gradePoint).toBe(6);
    });

    it('prefers the more recent sitting when two attempts tie', () => {
      const resolved = resolveAttempts(
        [
          subject({ attempt: 1, gradePoint: 7, letter: 'B' }),
          subject({ attempt: 3, gradePoint: 7, letter: 'B' }),
        ],
        { repeatPolicy: 'best_attempt' },
      );

      expect(resolved[0]?.attempt).toBe(3);
    });

    it('takes the last sitting under latest_attempt even when it is worse', () => {
      const resolved = resolveAttempts(
        [
          subject({ attempt: 1, gradePoint: 10, letter: 'O' }),
          subject({ attempt: 2, gradePoint: 5, letter: 'P' }),
        ],
        { repeatPolicy: 'latest_attempt' },
      );

      expect(resolved[0]?.gradePoint).toBe(5);
    });

    it('takes the earliest passing sitting under first_pass', () => {
      const resolved = resolveAttempts(
        [
          subject({ attempt: 1, gradePoint: 0, letter: 'F', isPass: false }),
          subject({ attempt: 2, gradePoint: 5, letter: 'P' }),
          subject({ attempt: 3, gradePoint: 9, letter: 'A+' }),
        ],
        { repeatPolicy: 'first_pass' },
      );

      expect(resolved[0]?.attempt).toBe(2);
      expect(resolved[0]?.gradePoint).toBe(5);
    });

    it('falls back to the last sitting under first_pass when none passed', () => {
      const resolved = resolveAttempts(
        [
          subject({ attempt: 1, gradePoint: 0, isPass: false, letter: 'F' }),
          subject({ attempt: 2, gradePoint: 0, isPass: false, letter: 'F' }),
        ],
        { repeatPolicy: 'first_pass' },
      );

      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.attempt).toBe(2);
      expect(resolved[0]?.isPass).toBe(false);
    });

    /**
     * The same course legitimately recurs in a later semester (a lab paired
     * with a theory paper, a repeated elective). Those are separate results,
     * not repeats, so collapsing them would silently delete a grade.
     */
    it('does not treat the same course in a different semester as a repeat', () => {
      const resolved = resolveAttempts(
        [
          subject({ courseId: 'course-a', semester: 1 }),
          subject({ courseId: 'course-a', semester: 3 }),
        ],
        POLICY,
      );

      expect(resolved).toHaveLength(2);
    });
  });

  describe('calculateSemesterGpa', () => {
    it('weights each grade point by its credits', () => {
      // (9×4 + 7×3 + 10×2) ÷ 9 = 77 ÷ 9 = 8.5556
      const gpa = calculateSemesterGpa(
        [
          subject({ courseId: 'a', credits: 4, gradePoint: 9 }),
          subject({ courseId: 'b', credits: 3, gradePoint: 7 }),
          subject({ courseId: 'c', credits: 2, gradePoint: 10 }),
        ],
        POLICY,
      );

      expect(gpa.gpa).toBe(8.56);
      expect(gpa.creditsAttempted).toBe(9);
      expect(gpa.creditsEarned).toBe(9);
      expect(gpa.failedCount).toBe(0);
    });

    it('honours the configured decimal places', () => {
      const gpa = calculateSemesterGpa(
        [
          subject({ courseId: 'a', credits: 4, gradePoint: 9 }),
          subject({ courseId: 'b', credits: 3, gradePoint: 7 }),
          subject({ courseId: 'c', credits: 2, gradePoint: 10 }),
        ],
        { ...POLICY, gpaDecimalPlaces: 3 },
      );

      expect(gpa.gpa).toBe(8.556);
    });

    it('keeps failed credits in the divisor when the policy says so', () => {
      // (8×4 + 0×4) ÷ 8 = 4
      const gpa = calculateSemesterGpa(
        [
          subject({ courseId: 'a', credits: 4, gradePoint: 8 }),
          subject({ courseId: 'b', credits: 4, gradePoint: 0, isPass: false, letter: 'F' }),
        ],
        POLICY,
      );

      expect(gpa.gpa).toBe(4);
      expect(gpa.creditsAttempted).toBe(8);
      expect(gpa.creditsEarned).toBe(4);
      expect(gpa.failedCount).toBe(1);
    });

    it('excludes failed credits entirely when the policy says not to count them', () => {
      const gpa = calculateSemesterGpa(
        [
          subject({ courseId: 'a', credits: 4, gradePoint: 8 }),
          subject({ courseId: 'b', credits: 4, gradePoint: 0, isPass: false, letter: 'F' }),
        ],
        { ...POLICY, countFailedCredits: false },
      );

      expect(gpa.gpa).toBe(8);
      expect(gpa.creditsAttempted).toBe(4);
      expect(gpa.failedCount).toBe(1);
    });

    it('grades a zero-credit subject but leaves it out of the average', () => {
      const gpa = calculateSemesterGpa(
        [
          subject({ courseId: 'a', credits: 4, gradePoint: 8 }),
          subject({ courseId: 'audit', credits: 0, gradePoint: 10 }),
        ],
        POLICY,
      );

      expect(gpa.gpa).toBe(8);
      expect(gpa.creditsAttempted).toBe(4);
      expect(gpa.subjectCount).toBe(2);
    });

    it('returns zero rather than NaN when no credits count', () => {
      const gpa = calculateSemesterGpa([subject({ credits: 0, gradePoint: 9 })], POLICY);
      expect(gpa.gpa).toBe(0);
    });

    it('returns an empty semester without throwing', () => {
      const gpa = calculateSemesterGpa([], POLICY);
      expect(gpa.gpa).toBe(0);
      expect(gpa.subjectCount).toBe(0);
    });
  });

  describe('calculateCgpa', () => {
    it('pools credits across semesters rather than averaging the GPAs', () => {
      /**
       * Semester 1: one 8-point subject worth 2 credits → GPA 8
       * Semester 2: one 6-point subject worth 8 credits → GPA 6
       * Averaging the GPAs gives 7; the credit-weighted answer is
       * (8×2 + 6×8) ÷ 10 = 6.4.
       */
      const result = calculateCgpa(
        [
          subject({ courseId: 'a', semester: 1, credits: 2, gradePoint: 8 }),
          subject({ courseId: 'b', semester: 2, credits: 8, gradePoint: 6 }),
        ],
        POLICY,
      );

      expect(result.cgpa).toBe(6.4);
      expect(result.totalCreditsAttempted).toBe(10);
      expect(result.totalCreditsEarned).toBe(10);
      expect(result.semesters).toHaveLength(2);
    });

    it('orders semesters ascending however the results arrive', () => {
      const result = calculateCgpa(
        [
          subject({ courseId: 'c', semester: 3 }),
          subject({ courseId: 'a', semester: 1 }),
          subject({ courseId: 'b', semester: 2 }),
        ],
        POLICY,
      );

      expect(result.semesters.map((entry) => entry.semester)).toEqual([1, 2, 3]);
    });

    it('counts a subject with no passing attempt as an active backlog', () => {
      const result = calculateCgpa(
        [
          subject({ courseId: 'a', gradePoint: 8 }),
          subject({ courseId: 'b', gradePoint: 0, isPass: false, letter: 'F' }),
        ],
        POLICY,
      );

      expect(result.activeBacklogs).toBe(1);
      expect(result.totalBacklogs).toBe(1);
    });

    /**
     * A cleared backlog must stop counting as active while still showing in
     * the total — that distinction is what placement eligibility reads.
     */
    it('clears an active backlog once a later attempt passes', () => {
      const result = calculateCgpa(
        [
          subject({ courseId: 'b', attempt: 1, gradePoint: 0, isPass: false, letter: 'F' }),
          subject({ courseId: 'b', attempt: 2, gradePoint: 5, isPass: true, letter: 'P' }),
        ],
        POLICY,
      );

      expect(result.activeBacklogs).toBe(0);
      expect(result.totalBacklogs).toBe(1);
      expect(result.cgpa).toBe(5);
    });

    it('returns zero for a student with no results at all', () => {
      const result = calculateCgpa([], POLICY);

      expect(result.cgpa).toBe(0);
      expect(result.semesters).toHaveLength(0);
      expect(result.totalCreditsEarned).toBe(0);
    });

    it('reflects the repeat policy in the final CGPA', () => {
      const attempts = [
        subject({ courseId: 'a', attempt: 1, gradePoint: 10, letter: 'O' }),
        subject({ courseId: 'a', attempt: 2, gradePoint: 5, letter: 'P' }),
      ];

      expect(calculateCgpa(attempts, { ...POLICY, repeatPolicy: 'best_attempt' }).cgpa).toBe(10);
      expect(calculateCgpa(attempts, { ...POLICY, repeatPolicy: 'latest_attempt' }).cgpa).toBe(5);
    });
  });

  describe('cgpaToPercentage', () => {
    it('applies the multiplier the college supplies', () => {
      expect(cgpaToPercentage(8.2, 9.5)).toBe(77.9);
      expect(cgpaToPercentage(8.2, 10)).toBe(82);
    });
  });
});
