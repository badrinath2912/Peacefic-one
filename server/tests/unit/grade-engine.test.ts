import {
  calculateFinalMarks,
  calculateGrade,
  resolveGrade,
  roundTo,
  sumComponents,
  type GradeBandInput,
  type GradePolicyInput,
} from '@peacefic/shared';

/** A ten-point scale of the shape most Indian universities use. */
const BANDS: GradeBandInput[] = [
  { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true, description: null },
  { letter: 'A+', minPercent: 80, maxPercent: 89.99, gradePoint: 9, isPass: true, description: null },
  { letter: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 8, isPass: true, description: null },
  { letter: 'B', minPercent: 60, maxPercent: 69.99, gradePoint: 7, isPass: true, description: null },
  { letter: 'C', minPercent: 50, maxPercent: 59.99, gradePoint: 6, isPass: true, description: null },
  { letter: 'P', minPercent: 40, maxPercent: 49.99, gradePoint: 5, isPass: true, description: null },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false, description: null },
];

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

const MAXIMUM = { theory: 60, practical: 20, internal: 20 };

describe('grade engine', () => {
  describe('sumComponents', () => {
    it('treats a missing component as zero rather than NaN', () => {
      expect(sumComponents({ theory: 40 })).toBe(40);
      expect(sumComponents({})).toBe(0);
      expect(sumComponents({ theory: 40, practical: 15, internal: 18 })).toBe(73);
    });
  });

  describe('roundTo', () => {
    it('rounds without floating-point drift', () => {
      // 1.005 is 1.00499999... in binary; a naive Math.round gives 1.
      expect(roundTo(1.005, 2)).toBe(1.01);
      expect(roundTo(8.675, 2)).toBe(8.68);
      expect(roundTo(66.66666, 2)).toBe(66.67);
    });
  });

  describe('calculateFinalMarks', () => {
    it('sums components and expresses them as a percentage', () => {
      const result = calculateFinalMarks(
        { obtained: { theory: 45, practical: 16, internal: 18 }, maximum: MAXIMUM },
        POLICY,
      );

      expect(result.rawTotal).toBe(79);
      expect(result.maxTotal).toBe(100);
      expect(result.percentage).toBe(79);
      expect(result.wasCapped).toBe(false);
    });

    it('returns zero rather than dividing by zero when nothing is out of anything', () => {
      const result = calculateFinalMarks(
        { obtained: { theory: 10 }, maximum: { theory: 0, practical: 0, internal: 0 } },
        POLICY,
      );

      expect(result.percentage).toBe(0);
      expect(result.finalTotal).toBe(0);
    });

    it('caps grace at the policy maximum however much is requested', () => {
      const result = calculateFinalMarks(
        { obtained: { theory: 20, practical: 10, internal: 8 }, maximum: MAXIMUM, graceMarks: 25 },
        { ...POLICY, maxGraceMarks: 5 },
      );

      expect(result.graceApplied).toBe(5);
      expect(result.finalTotal).toBe(43);
    });

    it('awards the attendance bonus only at or above the threshold', () => {
      const policy = {
        ...POLICY,
        attendanceBonusEnabled: true,
        attendanceBonusThreshold: 90,
        attendanceBonusMarks: 3,
      };

      const below = calculateFinalMarks(
        { obtained: { theory: 30 }, maximum: MAXIMUM, attendancePercent: 89.9 },
        policy,
      );
      const exactly = calculateFinalMarks(
        { obtained: { theory: 30 }, maximum: MAXIMUM, attendancePercent: 90 },
        policy,
      );

      expect(below.attendanceBonus).toBe(0);
      expect(exactly.attendanceBonus).toBe(3);
    });

    it('ignores the attendance bonus when the policy disables it', () => {
      const result = calculateFinalMarks(
        { obtained: { theory: 30 }, maximum: MAXIMUM, attendancePercent: 100 },
        { ...POLICY, attendanceBonusMarks: 5 },
      );

      expect(result.attendanceBonus).toBe(0);
    });

    it('never lets bonus and grace together push a student past the maximum', () => {
      const result = calculateFinalMarks(
        {
          obtained: { theory: 60, practical: 20, internal: 18 },
          maximum: MAXIMUM,
          graceMarks: 5,
          attendancePercent: 100,
        },
        {
          ...POLICY,
          maxGraceMarks: 5,
          attendanceBonusEnabled: true,
          attendanceBonusMarks: 5,
        },
      );

      expect(result.finalTotal).toBe(100);
      expect(result.percentage).toBe(100);
      expect(result.wasCapped).toBe(true);
    });

    it('treats a negative grace request as none rather than a deduction', () => {
      const result = calculateFinalMarks(
        { obtained: { theory: 30 }, maximum: MAXIMUM, graceMarks: -10 },
        { ...POLICY, maxGraceMarks: 5 },
      );

      expect(result.graceApplied).toBe(0);
      expect(result.finalTotal).toBe(30);
    });
  });

  describe('resolveGrade', () => {
    it.each([
      [100, 'O'],
      [90, 'O'],
      [89.99, 'A+'],
      [80, 'A+'],
      [70, 'A'],
      [60, 'B'],
      [50, 'C'],
      [40, 'P'],
      [39.99, 'F'],
      [0, 'F'],
    ])('resolves %p to %s', (percentage, letter) => {
      expect(resolveGrade(percentage, BANDS)?.letter).toBe(letter);
    });

    it('clamps out-of-range input into the scale rather than returning nothing', () => {
      expect(resolveGrade(120, BANDS)?.letter).toBe('O');
      expect(resolveGrade(-5, BANDS)?.letter).toBe('F');
    });
  });

  describe('calculateGrade', () => {
    it('grades a normal result against the configured scale', () => {
      const result = calculateGrade(
        { obtained: { theory: 50, practical: 18, internal: 17 }, maximum: MAXIMUM },
        BANDS,
        POLICY,
      );

      expect(result.percentage).toBe(85);
      expect(result.letter).toBe('A+');
      expect(result.gradePoint).toBe(9);
      expect(result.isPass).toBe(true);
    });

    it('fails an absent student outright whatever marks are recorded', () => {
      const result = calculateGrade(
        { obtained: { theory: 60, practical: 20, internal: 20 }, maximum: MAXIMUM },
        BANDS,
        POLICY,
        { isAbsent: true },
      );

      expect(result.isPass).toBe(false);
      expect(result.percentage).toBe(0);
      expect(result.gradePoint).toBe(0);
      expect(result.letter).toBe('F');
    });

    it('lets grace carry a borderline student over the pass mark', () => {
      const policy = { ...POLICY, maxGraceMarks: 3 };

      const without = calculateGrade(
        { obtained: { theory: 20, practical: 10, internal: 8 }, maximum: MAXIMUM },
        BANDS,
        policy,
      );
      const withGrace = calculateGrade(
        { obtained: { theory: 20, practical: 10, internal: 8 }, maximum: MAXIMUM, graceMarks: 3 },
        BANDS,
        policy,
      );

      expect(without.percentage).toBe(38);
      expect(without.isPass).toBe(false);
      expect(withGrace.percentage).toBe(41);
      expect(withGrace.isPass).toBe(true);
      expect(withGrace.letter).toBe('P');
    });

    /**
     * The band and the policy passing mark are configured separately, so a
     * scale whose lowest passing band starts below the policy's pass mark must
     * not quietly pass a student the policy fails.
     */
    it('defers to the policy passing mark when it is stricter than the band', () => {
      const result = calculateGrade(
        { obtained: { theory: 30, practical: 8, internal: 7 }, maximum: MAXIMUM },
        BANDS,
        { ...POLICY, passingPercent: 50 },
      );

      expect(result.percentage).toBe(45);
      expect(result.letter).toBe('P');
      expect(result.isPass).toBe(false);
    });

    it('fails closed when the scale has a gap the percentage falls into', () => {
      const gapped: GradeBandInput[] = [
        { letter: 'A', minPercent: 60, maxPercent: 100, gradePoint: 9, isPass: true, description: null },
        { letter: 'F', minPercent: 0, maxPercent: 30, gradePoint: 0, isPass: false, description: null },
      ];

      const result = calculateGrade(
        { obtained: { theory: 45 }, maximum: MAXIMUM },
        gapped,
        POLICY,
      );

      expect(result.letter).toBe('F');
      expect(result.gradePoint).toBe(0);
      expect(result.isPass).toBe(false);
    });

    it('grades exactly at a band boundary into the higher band', () => {
      const result = calculateGrade(
        { obtained: { theory: 60, practical: 15, internal: 15 }, maximum: MAXIMUM },
        BANDS,
        POLICY,
      );

      expect(result.percentage).toBe(90);
      expect(result.letter).toBe('O');
      expect(result.gradePoint).toBe(10);
    });

    it('grades a zero score as the failing band rather than throwing', () => {
      const result = calculateGrade(
        { obtained: { theory: 0, practical: 0, internal: 0 }, maximum: MAXIMUM },
        BANDS,
        POLICY,
      );

      expect(result.percentage).toBe(0);
      expect(result.letter).toBe('F');
      expect(result.isPass).toBe(false);
    });
  });
});
