import {
  ELIGIBILITY_RULES,
  eligibilityPrefilter,
  evaluateEligibility,
  isEligible,
  type EligibilityInput,
  type StudentSnapshot,
} from '@peacefic/shared';

/** A student who clears an empty criteria block. */
function student(overrides: Partial<StudentSnapshot> = {}): StudentSnapshot {
  return {
    studentId: 'student-1',
    departmentId: 'dept-cse',
    batchId: 'batch-a',
    graduationYear: 2026,
    gender: 'female',
    cgpa: 8.2,
    activeBacklogs: 0,
    totalBacklogs: 0,
    tenthPercent: 92,
    twelfthPercent: 88,
    diplomaPercent: null,
    yearGap: 0,
    attendancePercent: 86,
    skills: ['JavaScript', 'Node.js', 'MongoDB'],
    qualifications: ['B.E. Computer Science'],
    isPlaced: false,
    isEligibleForPlacement: true,
    eligibilityNote: null,
    ...overrides,
  };
}

/** Criteria that filter on nothing — the open-drive default. */
function criteria(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    departmentIds: [],
    batchIds: [],
    graduationYears: [],
    minCgpa: null,
    maxActiveBacklogs: null,
    maxTotalBacklogs: null,
    minTenthPercent: null,
    minTwelfthPercent: null,
    minDiplomaPercent: null,
    minAttendancePercent: null,
    maxYearGap: null,
    genderRestriction: 'any',
    requiredSkills: [],
    qualifications: [],
    allowPlacedStudents: false,
    customCriteria: null,
    ...overrides,
  };
}

const rulesIn = (result: { reasons: Array<{ rule: string }> }): string[] =>
  result.reasons.map((reason) => reason.rule);

describe('eligibility engine', () => {
  describe('the open case', () => {
    it('passes a student when nothing is filtered on', () => {
      const result = evaluateEligibility(student(), criteria());

      expect(result.eligible).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('exposes a boolean convenience that agrees with the full result', () => {
      expect(isEligible(student(), criteria())).toBe(true);
      expect(isEligible(student({ cgpa: 5 }), criteria({ minCgpa: 7 }))).toBe(false);
    });
  });

  describe('placement bar', () => {
    /**
     * A barred student fails regardless of everything else, and is told only
     * that — burying it under academic criteria would be misleading.
     */
    it('reports the bar alone, ignoring every other criterion', () => {
      const result = evaluateEligibility(
        student({ isEligibleForPlacement: false, cgpa: 2, activeBacklogs: 9 }),
        criteria({ minCgpa: 9, maxActiveBacklogs: 0 }),
      );

      expect(result.eligible).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]?.rule).toBe(ELIGIBILITY_RULES.PLACEMENT_BLOCKED);
    });

    it('carries the office note when one was recorded', () => {
      const result = evaluateEligibility(
        student({ isEligibleForPlacement: false, eligibilityNote: 'Disciplinary hold until June' }),
        criteria(),
      );

      expect(result.reasons[0]?.message).toBe('Disciplinary hold until June');
    });

    it('falls back to a usable message when no note was left', () => {
      const result = evaluateEligibility(
        student({ isEligibleForPlacement: false, eligibilityNote: '   ' }),
        criteria(),
      );

      expect(result.reasons[0]?.message).toMatch(/contact the placement office/i);
    });
  });

  describe('already placed', () => {
    it('refuses a placed student by default', () => {
      const result = evaluateEligibility(student({ isPlaced: true }), criteria());
      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.ALREADY_PLACED);
    });

    it('admits a placed student when the drive allows it', () => {
      const result = evaluateEligibility(
        student({ isPlaced: true }),
        criteria({ allowPlacedStudents: true }),
      );

      expect(result.eligible).toBe(true);
    });
  });

  describe('department and batch', () => {
    it('admits a listed department and refuses an unlisted one', () => {
      expect(
        evaluateEligibility(student(), criteria({ departmentIds: ['dept-cse', 'dept-ece'] })).eligible,
      ).toBe(true);

      const refused = evaluateEligibility(student(), criteria({ departmentIds: ['dept-mech'] }));
      expect(rulesIn(refused)).toContain(ELIGIBILITY_RULES.DEPARTMENT);
    });

    it('admits a listed batch and refuses an unlisted one', () => {
      expect(evaluateEligibility(student(), criteria({ batchIds: ['batch-a'] })).eligible).toBe(true);

      const refused = evaluateEligibility(student(), criteria({ batchIds: ['batch-b'] }));
      expect(rulesIn(refused)).toContain(ELIGIBILITY_RULES.BATCH);
    });

    /** Batch is narrower than department; both apply independently. */
    it('refuses on batch even when the department matches', () => {
      const result = evaluateEligibility(
        student(),
        criteria({ departmentIds: ['dept-cse'], batchIds: ['batch-b'] }),
      );

      expect(rulesIn(result)).toEqual([ELIGIBILITY_RULES.BATCH]);
    });
  });

  describe('graduation year', () => {
    it('admits a listed year', () => {
      expect(
        evaluateEligibility(student(), criteria({ graduationYears: [2025, 2026] })).eligible,
      ).toBe(true);
    });

    it('refuses an unlisted year', () => {
      const result = evaluateEligibility(student(), criteria({ graduationYears: [2027] }));
      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.GRADUATION_YEAR);
    });

    /** Unknown is not the same as matching. */
    it('refuses when the year is unknown', () => {
      const result = evaluateEligibility(
        student({ graduationYear: null }),
        criteria({ graduationYears: [2026] }),
      );

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.GRADUATION_YEAR);
    });
  });

  describe('CGPA boundary', () => {
    it.each([
      [7.0, 7.0, true],
      [7.01, 7.0, true],
      [6.99, 7.0, false],
      [0, 0, true],
      [10, 10, true],
      [9.99, 10, false],
    ])('CGPA %p against a minimum of %p is eligible=%p', (cgpa, minCgpa, expected) => {
      const result = evaluateEligibility(student({ cgpa }), criteria({ minCgpa }));
      expect(result.eligible).toBe(expected);
    });

    it('states both the requirement and the actual figure', () => {
      const result = evaluateEligibility(student({ cgpa: 6.4 }), criteria({ minCgpa: 7 }));

      expect(result.reasons[0]).toEqual({
        rule: 'minimum_cgpa',
        message: 'Minimum CGPA required is 7. Yours is 6.4.',
      });
    });

    /** No published results is not a CGPA of zero, and says so. */
    it('refuses a student with no CGPA yet and explains why', () => {
      const result = evaluateEligibility(student({ cgpa: null }), criteria({ minCgpa: 7 }));

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.MINIMUM_CGPA);
      expect(result.reasons[0]?.message).toMatch(/no results have been published/i);
    });

    it('ignores CGPA entirely when the drive sets no minimum', () => {
      expect(evaluateEligibility(student({ cgpa: null }), criteria()).eligible).toBe(true);
      expect(evaluateEligibility(student({ cgpa: 1 }), criteria()).eligible).toBe(true);
    });
  });

  describe('backlog boundary', () => {
    it.each([
      [0, 0, true],
      [1, 0, false],
      [2, 2, true],
      [3, 2, false],
    ])('active backlogs %p against a cap of %p is eligible=%p', (active, cap, expected) => {
      const result = evaluateEligibility(
        student({ activeBacklogs: active }),
        criteria({ maxActiveBacklogs: cap }),
      );

      expect(result.eligible).toBe(expected);
    });

    it('phrases a zero cap as "no active backlogs"', () => {
      const result = evaluateEligibility(
        student({ activeBacklogs: 2 }),
        criteria({ maxActiveBacklogs: 0 }),
      );

      expect(result.reasons[0]?.message).toBe('No active backlogs are allowed. You have 2.');
    });

    /** Total counts cleared backlogs too, so the two caps differ. */
    it('applies the total cap independently of the active one', () => {
      const result = evaluateEligibility(
        student({ activeBacklogs: 0, totalBacklogs: 4 }),
        criteria({ maxActiveBacklogs: 0, maxTotalBacklogs: 2 }),
      );

      expect(rulesIn(result)).toEqual([ELIGIBILITY_RULES.TOTAL_BACKLOGS]);
    });
  });

  describe('attendance boundary', () => {
    it.each([
      [75, 75, true],
      [74.9, 75, false],
      [100, 75, true],
    ])('attendance %p against a minimum of %p is eligible=%p', (actual, required, expected) => {
      const result = evaluateEligibility(
        student({ attendancePercent: actual }),
        criteria({ minAttendancePercent: required }),
      );

      expect(result.eligible).toBe(expected);
    });

    it('refuses when no attendance has been recorded', () => {
      const result = evaluateEligibility(
        student({ attendancePercent: null }),
        criteria({ minAttendancePercent: 75 }),
      );

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.ATTENDANCE);
      expect(result.reasons[0]?.message).toMatch(/none has been recorded/i);
    });

    it('ignores attendance when the drive sets no minimum', () => {
      expect(
        evaluateEligibility(student({ attendancePercent: null }), criteria()).eligible,
      ).toBe(true);
    });
  });

  describe('school and diploma marks', () => {
    it('applies each bar independently', () => {
      const result = evaluateEligibility(
        student({ tenthPercent: 55, twelfthPercent: 58, diplomaPercent: 61 }),
        criteria({ minTenthPercent: 60, minTwelfthPercent: 60, minDiplomaPercent: 60 }),
      );

      expect(rulesIn(result)).toEqual([
        ELIGIBILITY_RULES.TENTH_PERCENT,
        ELIGIBILITY_RULES.TWELFTH_PERCENT,
      ]);
    });

    it('refuses when a required mark is missing from the profile', () => {
      const result = evaluateEligibility(
        student({ diplomaPercent: null }),
        criteria({ minDiplomaPercent: 60 }),
      );

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.DIPLOMA_PERCENT);
      expect(result.reasons[0]?.message).toMatch(/no mark is recorded/i);
    });
  });

  describe('year gap', () => {
    it('admits a gap at the cap and refuses one above it', () => {
      expect(
        evaluateEligibility(student({ yearGap: 1 }), criteria({ maxYearGap: 1 })).eligible,
      ).toBe(true);

      const refused = evaluateEligibility(student({ yearGap: 2 }), criteria({ maxYearGap: 1 }));
      expect(rulesIn(refused)).toContain(ELIGIBILITY_RULES.YEAR_GAP);
    });

    it('phrases a zero cap as "no gap years"', () => {
      const result = evaluateEligibility(student({ yearGap: 1 }), criteria({ maxYearGap: 0 }));
      expect(result.reasons[0]?.message).toMatch(/no gap years are allowed/i);
    });
  });

  describe('gender restriction', () => {
    it('admits a female candidate to a female-only drive', () => {
      expect(
        evaluateEligibility(student({ gender: 'female' }), criteria({ genderRestriction: 'female_only' }))
          .eligible,
      ).toBe(true);
    });

    it('refuses everyone else, including an unrecorded gender', () => {
      for (const gender of ['male', 'other', null]) {
        const result = evaluateEligibility(
          student({ gender }),
          criteria({ genderRestriction: 'female_only' }),
        );

        expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.GENDER);
      }
    });
  });

  describe('required skills', () => {
    it('admits a student holding every required skill', () => {
      expect(
        evaluateEligibility(student(), criteria({ requiredSkills: ['JavaScript', 'MongoDB'] }))
          .eligible,
      ).toBe(true);
    });

    /** "Node.js" must match " node.js " — a profile is typed by hand. */
    it('matches skills case- and whitespace-insensitively', () => {
      expect(
        evaluateEligibility(
          student({ skills: ['  NODE.JS  ', 'react'] }),
          criteria({ requiredSkills: ['node.js', 'React'] }),
        ).eligible,
      ).toBe(true);
    });

    it('names the missing skills so the student can act', () => {
      const result = evaluateEligibility(
        student(),
        criteria({ requiredSkills: ['Kubernetes', 'Go'] }),
      );

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.SKILLS);
      expect(result.reasons[0]?.message).toContain('Kubernetes');
      expect(result.reasons[0]?.message).toContain('Go');
    });

    it('summarises rather than listing a very long set', () => {
      const result = evaluateEligibility(
        student({ skills: [] }),
        criteria({ requiredSkills: ['A', 'B', 'C', 'D', 'E'] }),
      );

      expect(result.reasons[0]?.message).toContain('and 2 more');
    });
  });

  describe('qualifications', () => {
    /** These are alternatives, not a checklist — any one match is enough. */
    it('admits a student matching any listed qualification', () => {
      expect(
        evaluateEligibility(
          student(),
          criteria({ qualifications: ['B.Tech Information Technology', 'B.E. Computer Science'] }),
        ).eligible,
      ).toBe(true);
    });

    it('refuses when none match', () => {
      const result = evaluateEligibility(
        student(),
        criteria({ qualifications: ['M.Tech Data Science'] }),
      );

      expect(rulesIn(result)).toContain(ELIGIBILITY_RULES.QUALIFICATION);
    });
  });

  describe('reporting every failure', () => {
    /**
     * A student told only about CGPA, who fixes nothing because they also have
     * backlogs, has been failed twice. Every reason is returned.
     */
    it('returns all failed rules rather than stopping at the first', () => {
      const result = evaluateEligibility(
        student({
          cgpa: 5,
          activeBacklogs: 3,
          attendancePercent: 60,
          gender: 'male',
          skills: [],
        }),
        criteria({
          minCgpa: 7,
          maxActiveBacklogs: 0,
          minAttendancePercent: 75,
          genderRestriction: 'female_only',
          requiredSkills: ['Rust'],
        }),
      );

      expect(result.eligible).toBe(false);
      expect(rulesIn(result)).toEqual([
        ELIGIBILITY_RULES.MINIMUM_CGPA,
        ELIGIBILITY_RULES.ACTIVE_BACKLOGS,
        ELIGIBILITY_RULES.ATTENDANCE,
        ELIGIBILITY_RULES.GENDER,
        ELIGIBILITY_RULES.SKILLS,
      ]);
    });

    it('gives every reason a stable rule id and a human message', () => {
      const result = evaluateEligibility(
        student({ cgpa: 5, activeBacklogs: 3 }),
        criteria({ minCgpa: 7, maxActiveBacklogs: 0 }),
      );

      for (const reason of result.reasons) {
        expect(typeof reason.rule).toBe('string');
        expect(reason.rule).not.toBe('');
        expect(reason.message.length).toBeGreaterThan(10);
      }
    });

    /** `customCriteria` is narrative; the engine must not guess at it. */
    it('never fails a student on free-text custom criteria', () => {
      const result = evaluateEligibility(
        student(),
        criteria({ customCriteria: 'Must hold a valid passport' }),
      );

      expect(result.eligible).toBe(true);
    });
  });

  describe('prefilter', () => {
    /**
     * The prefilter is an optimisation, never the decision. It narrows the
     * candidate set before the engine runs on what survives.
     */
    it('translates the field-comparable rules into a Mongo filter', () => {
      const filter = eligibilityPrefilter(
        criteria({
          departmentIds: ['dept-cse'],
          batchIds: ['batch-a'],
          minCgpa: 7,
          maxActiveBacklogs: 0,
          genderRestriction: 'female_only',
        }),
      );

      expect(filter).toEqual({
        status: 'active',
        departmentId: { $in: ['dept-cse'] },
        batchId: { $in: ['batch-a'] },
        'academics.currentCgpa': { $gte: 7 },
        'academics.activeBacklogs': { $lte: 0 },
        gender: 'female',
        'placement.isPlaced': false,
      });
    });

    it('omits rules a field comparison cannot express', () => {
      const filter = eligibilityPrefilter(
        criteria({
          requiredSkills: ['Rust'],
          qualifications: ['B.E.'],
          minAttendancePercent: 75,
          minTenthPercent: 60,
        }),
      );

      // These are evaluated in the engine, on the narrowed set.
      expect(Object.keys(filter)).toEqual(['status', 'placement.isPlaced']);
    });

    it('drops the placed exclusion when the drive allows placed students', () => {
      const filter = eligibilityPrefilter(criteria({ allowPlacedStudents: true }));
      expect(filter).not.toHaveProperty('placement.isPlaced');
    });
  });
});
