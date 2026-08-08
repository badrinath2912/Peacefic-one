import { createGradeScaleSchema, type GradeBandInput } from '@peacefic/shared';

/**
 * A malformed scale silently mis-grades every exam that uses it, so the bands
 * are validated at the contract boundary rather than trusted.
 */
const VALID_BANDS: GradeBandInput[] = [
  { letter: 'A', minPercent: 60, maxPercent: 100, gradePoint: 9, isPass: true },
  { letter: 'B', minPercent: 40, maxPercent: 59.99, gradePoint: 6, isPass: true },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false },
];

function scale(bands: GradeBandInput[]): Record<string, unknown> {
  return {
    name: 'Ten point scale',
    code: 'TEN',
    bands,
    policy: {},
    isDefault: false,
    status: 'active',
  };
}

function messages(bands: GradeBandInput[]): string[] {
  const result = createGradeScaleSchema.safeParse(scale(bands));
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('grade scale contract', () => {
  it('accepts a gap-free, non-overlapping scale', () => {
    expect(createGradeScaleSchema.safeParse(scale(VALID_BANDS)).success).toBe(true);
  });

  it('applies the documented policy defaults when none are supplied', () => {
    const parsed = createGradeScaleSchema.parse(scale(VALID_BANDS));

    expect(parsed.policy.passingPercent).toBe(40);
    expect(parsed.policy.repeatPolicy).toBe('best_attempt');
    expect(parsed.policy.gpaDecimalPlaces).toBe(2);
    expect(parsed.policy.countFailedCredits).toBe(true);
  });

  it('rejects a band whose maximum is below its minimum', () => {
    expect(
      messages([
        { letter: 'A', minPercent: 60, maxPercent: 50, gradePoint: 9, isPass: true },
        { letter: 'F', minPercent: 0, maxPercent: 100, gradePoint: 0, isPass: false },
      ]),
    ).toContain('"A" has a maximum below its minimum');
  });

  it('rejects overlapping bands, which would make a mark ambiguous', () => {
    expect(
      messages([
        { letter: 'A', minPercent: 50, maxPercent: 100, gradePoint: 9, isPass: true },
        { letter: 'F', minPercent: 0, maxPercent: 60, gradePoint: 0, isPass: false },
      ]),
    ).toContain('"F" overlaps "A"');
  });

  it('rejects a scale that does not start at 0%', () => {
    expect(
      messages([
        { letter: 'A', minPercent: 60, maxPercent: 100, gradePoint: 9, isPass: true },
        { letter: 'F', minPercent: 10, maxPercent: 59.99, gradePoint: 0, isPass: false },
      ]),
    ).toContain('The lowest band must start at 0%');
  });

  it('rejects a scale that does not reach 100%', () => {
    expect(
      messages([
        { letter: 'A', minPercent: 60, maxPercent: 90, gradePoint: 9, isPass: true },
        { letter: 'F', minPercent: 0, maxPercent: 59.99, gradePoint: 0, isPass: false },
      ]),
    ).toContain('The highest band must reach 100%');
  });

  it('rejects a scale in which nothing is a pass', () => {
    expect(
      messages([
        { letter: 'F', minPercent: 0, maxPercent: 59.99, gradePoint: 0, isPass: false },
        { letter: 'E', minPercent: 60, maxPercent: 100, gradePoint: 2, isPass: false },
      ]),
    ).toContain('At least one band must be a pass');
  });

  it('rejects a single-band scale', () => {
    const result = createGradeScaleSchema.safeParse(
      scale([{ letter: 'P', minPercent: 0, maxPercent: 100, gradePoint: 5, isPass: true }]),
    );

    expect(result.success).toBe(false);
  });
});
