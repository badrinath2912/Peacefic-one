import {
  APPLICATION_STATUS,
  APPLICATION_TRANSITIONS,
  officeTransitions,
  PLACEMENT_STATUS,
  PLACEMENT_TRANSITIONS,
  STUDENT_APPLICATION_TRANSITIONS,
  STUDENT_PLACEMENT_TRANSITIONS,
} from '@peacefic/shared';
import { describe, expect, it } from 'vitest';

import {
  OFFICE_APPLICATION_TRANSITIONS,
  OFFICE_PLACEMENT_TRANSITIONS,
} from '@/lib/placement-display';

/**
 * These maps used to exist twice — once in the server service and once as a
 * literal in the client. They now live in `@peacefic/shared`, and the client
 * derives its office view rather than restating it. These tests pin both the
 * shape of the shared definition and the derivation.
 */
describe('placement state machines', () => {
  describe('the shared definition', () => {
    it('covers every application status', () => {
      for (const status of APPLICATION_STATUS) {
        expect(APPLICATION_TRANSITIONS[status]).toBeDefined();
      }
      expect(Object.keys(APPLICATION_TRANSITIONS)).toHaveLength(APPLICATION_STATUS.length);
    });

    it('covers every placement status', () => {
      for (const status of PLACEMENT_STATUS) {
        expect(PLACEMENT_TRANSITIONS[status]).toBeDefined();
      }
      expect(Object.keys(PLACEMENT_TRANSITIONS)).toHaveLength(PLACEMENT_STATUS.length);
    });

    it('never names a target outside the status enum', () => {
      for (const targets of Object.values(APPLICATION_TRANSITIONS)) {
        for (const target of targets) expect(APPLICATION_STATUS).toContain(target);
      }
      for (const targets of Object.values(PLACEMENT_TRANSITIONS)) {
        for (const target of targets) expect(PLACEMENT_STATUS).toContain(target);
      }
    });

    /** The lifecycle the server enforces, stated once so a change is visible. */
    it('matches the documented application lifecycle', () => {
      expect(APPLICATION_TRANSITIONS.applied).toEqual([
        'under_review',
        'shortlisted',
        'rejected',
        'withdrawn',
      ]);
      expect(APPLICATION_TRANSITIONS.shortlisted).toEqual([
        'in_process',
        'selected',
        'rejected',
        'withdrawn',
      ]);
      // Once selected, the student's exit is declining, not withdrawing.
      expect(APPLICATION_TRANSITIONS.selected).toEqual(['offer_declined']);
    });

    it('matches the documented offer lifecycle', () => {
      expect(PLACEMENT_TRANSITIONS.offered).toEqual(['accepted', 'declined', 'offer_revoked']);
      expect(PLACEMENT_TRANSITIONS.accepted).toEqual(['joined', 'not_joined', 'offer_revoked']);
    });

    it('treats the terminal states as terminal', () => {
      for (const status of ['rejected', 'withdrawn', 'offer_declined'] as const) {
        expect(APPLICATION_TRANSITIONS[status]).toEqual([]);
      }
      for (const status of ['declined', 'joined', 'not_joined', 'offer_revoked'] as const) {
        expect(PLACEMENT_TRANSITIONS[status]).toEqual([]);
      }
    });
  });

  describe('officeTransitions', () => {
    it('removes the student-owned targets and keeps the rest', () => {
      const result = officeTransitions<'a' | 'b' | 'c'>(
        { a: ['b', 'c'], b: ['c'], c: [] },
        ['c'],
      );

      expect(result).toEqual({ a: ['b'], b: [], c: [] });
    });

    it('keeps every source status, even when it loses all its targets', () => {
      const result = officeTransitions<'a' | 'b'>({ a: ['b'], b: [] }, ['b']);
      expect(Object.keys(result)).toEqual(['a', 'b']);
    });

    it('does not mutate the map it was given', () => {
      const source: Record<'a' | 'b' | 'c', Array<'a' | 'b' | 'c'>> = {
        a: ['b', 'c'],
        b: [],
        c: [],
      };

      officeTransitions<'a' | 'b' | 'c'>(source, ['c']);
      expect(source.a).toEqual(['b', 'c']);
    });
  });

  describe('the office view the UI renders', () => {
    /**
     * Withdrawing and declining are the student's own actions — the service
     * throws for a staff caller, so a button for either must never appear.
     */
    it('never offers the office a student-owned application transition', () => {
      for (const targets of Object.values(OFFICE_APPLICATION_TRANSITIONS)) {
        for (const owned of STUDENT_APPLICATION_TRANSITIONS) {
          expect(targets).not.toContain(owned);
        }
      }
    });

    it('never offers the office accepting or declining an offer', () => {
      for (const targets of Object.values(OFFICE_PLACEMENT_TRANSITIONS)) {
        for (const owned of STUDENT_PLACEMENT_TRANSITIONS) {
          expect(targets).not.toContain(owned);
        }
      }
    });

    it('keeps every office transition the server would accept', () => {
      for (const status of APPLICATION_STATUS) {
        const expected = APPLICATION_TRANSITIONS[status].filter(
          (target) => !STUDENT_APPLICATION_TRANSITIONS.includes(target),
        );
        expect(OFFICE_APPLICATION_TRANSITIONS[status]).toEqual(expected);
      }

      for (const status of PLACEMENT_STATUS) {
        const expected = PLACEMENT_TRANSITIONS[status].filter(
          (target) => !STUDENT_PLACEMENT_TRANSITIONS.includes(target),
        );
        expect(OFFICE_PLACEMENT_TRANSITIONS[status]).toEqual(expected);
      }
    });

    it('leaves the office exactly the offer actions it owns', () => {
      expect(OFFICE_PLACEMENT_TRANSITIONS.offered).toEqual(['offer_revoked']);
      expect(OFFICE_PLACEMENT_TRANSITIONS.accepted).toEqual([
        'joined',
        'not_joined',
        'offer_revoked',
      ]);
    });
  });
});
