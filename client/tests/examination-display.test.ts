import { EXAM_LIFECYCLE } from '@peacefic/shared';
import { describe, expect, it } from 'vitest';

import {
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LIFECYCLE_TONES,
  lifecycleIndex,
  personName,
  relationField,
  TRANSITION_DESCRIPTIONS,
  TRANSITION_LABELS,
} from '@/lib/examination-display';

describe('examination display helpers', () => {
  describe('lifecycle metadata', () => {
    /**
     * A missing entry would render `undefined` in a badge rather than throwing,
     * so the maps are checked against the enum instead of being trusted.
     */
    it('covers every lifecycle state with a label, tone and transition copy', () => {
      for (const state of EXAM_LIFECYCLE) {
        expect(LIFECYCLE_LABELS[state]).toBeTruthy();
        expect(LIFECYCLE_TONES[state]).toBeTruthy();
        expect(TRANSITION_LABELS[state]).toBeTruthy();
        expect(TRANSITION_DESCRIPTIONS[state]).toBeTruthy();
      }
    });

    it('keeps the stepper in the same order as the shared enum', () => {
      expect(LIFECYCLE_ORDER).toEqual(EXAM_LIFECYCLE);
    });

    it('reports the position of each state for the progress track', () => {
      expect(lifecycleIndex('draft')).toBe(0);
      expect(lifecycleIndex('results_published')).toBe(5);
      expect(lifecycleIndex('archived')).toBe(EXAM_LIFECYCLE.length - 1);
    });
  });

  describe('relationField', () => {
    it('reads a field off a populated relation', () => {
      expect(relationField({ code: 'CS201', title: 'DSA' }, 'code')).toBe('CS201');
    });

    /** An unpopulated relation is a bare id string, not an object. */
    it('falls back to a dash when the relation was not populated', () => {
      expect(relationField('507f1f77bcf86cd799439011', 'code')).toBe('—');
      expect(relationField(null, 'code')).toBe('—');
      expect(relationField(undefined, 'code')).toBe('—');
    });

    it('falls back to a dash when the field itself is null', () => {
      expect(relationField({ code: null }, 'code')).toBe('—');
    });
  });

  describe('personName', () => {
    it('reads a name nested under userId, which is how students arrive', () => {
      expect(personName({ rollNumber: 'CS22B001', userId: { firstName: 'Meera', lastName: 'Iyer' } })).toBe(
        'Meera Iyer',
      );
    });

    it('reads a name off the object directly when there is no userId', () => {
      expect(personName({ firstName: 'Asha', lastName: 'Rao' })).toBe('Asha Rao');
    });

    it('handles a half-populated name without leaving a stray space', () => {
      expect(personName({ firstName: 'Asha' })).toBe('Asha');
    });

    it('falls back to a dash rather than rendering empty', () => {
      expect(personName(null)).toBe('—');
      expect(personName('507f1f77bcf86cd799439011')).toBe('—');
      expect(personName({ userId: 'unpopulated-id' })).toBe('—');
    });
  });
});
