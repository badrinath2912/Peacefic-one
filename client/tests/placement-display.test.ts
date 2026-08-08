import {
  APPLICATION_STATUS,
  COMPANY_STATUS,
  COMPANY_TYPE,
  JOB_STATUS,
  PLACEMENT_STATUS,
} from '@peacefic/shared';
import { describe, expect, it } from 'vitest';

import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  COMPANY_STATUS_LABELS,
  COMPANY_STATUS_TONES,
  COMPANY_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  JOB_TRANSITION_DESCRIPTIONS,
  JOB_TRANSITION_LABELS,
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  contactsWithheld,
  formatCtc,
  formatCtcRange,
  personName,
  relationField,
} from '@/lib/placement-display';

describe('placement display helpers', () => {
  describe('enum coverage', () => {
    /**
     * A missing entry renders `undefined` in a badge rather than throwing, so
     * the maps are checked against the enums instead of being trusted.
     */
    it('covers every company type and status', () => {
      for (const type of COMPANY_TYPE) expect(COMPANY_TYPE_LABELS[type]).toBeTruthy();

      for (const status of COMPANY_STATUS) {
        expect(COMPANY_STATUS_LABELS[status]).toBeTruthy();
        expect(COMPANY_STATUS_TONES[status]).toBeTruthy();
      }
    });

    it('covers every job status, including its transition copy', () => {
      for (const status of JOB_STATUS) {
        expect(JOB_STATUS_LABELS[status]).toBeTruthy();
        expect(JOB_STATUS_TONES[status]).toBeTruthy();
        expect(JOB_TRANSITION_LABELS[status]).toBeTruthy();
        expect(JOB_TRANSITION_DESCRIPTIONS[status]).toBeTruthy();
      }
    });

    it('covers every application and placement status', () => {
      for (const status of APPLICATION_STATUS) {
        expect(APPLICATION_STATUS_LABELS[status]).toBeTruthy();
        expect(APPLICATION_STATUS_TONES[status]).toBeTruthy();
      }

      for (const status of PLACEMENT_STATUS) {
        expect(PLACEMENT_STATUS_LABELS[status]).toBeTruthy();
        expect(PLACEMENT_STATUS_TONES[status]).toBeTruthy();
      }
    });

    /** The pipeline is the happy path only — terminal states are not stages. */
    it('lists the pipeline in order and excludes terminal states', () => {
      expect(APPLICATION_PIPELINE).toEqual([
        'applied',
        'under_review',
        'shortlisted',
        'in_process',
        'selected',
      ]);

      for (const terminal of ['rejected', 'withdrawn', 'offer_declined'] as const) {
        expect(APPLICATION_PIPELINE).not.toContain(terminal);
      }
    });
  });

  describe('formatCtc', () => {
    /** A CTC is discussed in lakhs and crores, so that is how it is shown. */
    it.each([
      [1_800_000, '₹18.0 L'],
      [1_250_000, '₹12.5 L'],
      [100_000, '₹1.0 L'],
      [12_000_000, '₹1.20 Cr'],
      [10_000_000, '₹1.00 Cr'],
    ])('renders %p as %s', (amount, expected) => {
      expect(formatCtc(amount)).toBe(expected);
    });

    it('leaves figures below a lakh unabbreviated', () => {
      expect(formatCtc(45_000)).toBe('₹45,000');
      expect(formatCtc(0)).toBe('₹0');
    });

    it('falls back to a dash rather than rendering a blank cell', () => {
      expect(formatCtc(null)).toBe('—');
      expect(formatCtc(undefined)).toBe('—');
    });

    it('defers to Intl for a non-rupee currency', () => {
      const formatted = formatCtc(90_000, 'USD');
      expect(formatted).toContain('90,000');
      expect(formatted).not.toContain('L');
    });
  });

  describe('formatCtcRange', () => {
    it('shows a band when the ends differ', () => {
      expect(formatCtcRange(1_200_000, 1_800_000)).toBe('₹12.0 L – ₹18.0 L');
    });

    /** A band of one figure reads as noise. */
    it('collapses to a single figure when they match', () => {
      expect(formatCtcRange(1_500_000, 1_500_000)).toBe('₹15.0 L');
    });

    it('handles a missing end', () => {
      expect(formatCtcRange(null, 1_800_000)).toBe('₹18.0 L');
      expect(formatCtcRange(1_200_000, null)).toBe('₹12.0 L');
      expect(formatCtcRange(null, null)).toBe('—');
    });
  });

  describe('relationField', () => {
    it('reads a field off a populated relation', () => {
      expect(relationField({ name: 'Acme', industry: 'IT' }, 'name')).toBe('Acme');
    });

    /** An unpopulated relation is a bare id string, not an object. */
    it('falls back to a dash when the relation was not populated', () => {
      expect(relationField('507f1f77bcf86cd799439011', 'name')).toBe('—');
      expect(relationField(null, 'name')).toBe('—');
      expect(relationField(undefined, 'name')).toBe('—');
      expect(relationField({ name: null }, 'name')).toBe('—');
    });
  });

  describe('personName', () => {
    it('reads a name nested under userId, which is how students arrive', () => {
      expect(
        personName({ rollNumber: 'CS22B001', userId: { firstName: 'Meera', lastName: 'Iyer' } }),
      ).toBe('Meera Iyer');
    });

    it('reads a name off the object directly', () => {
      expect(personName({ firstName: 'Priya', lastName: 'Menon' })).toBe('Priya Menon');
    });

    it('handles a half-populated name without a stray space', () => {
      expect(personName({ firstName: 'Priya' })).toBe('Priya');
    });

    it('falls back to a dash rather than rendering empty', () => {
      expect(personName(null)).toBe('—');
      expect(personName('507f1f77bcf86cd799439011')).toBe('—');
      expect(personName({ userId: 'unpopulated-id' })).toBe('—');
    });
  });

  describe('contactsWithheld', () => {
    /**
     * The server strips recruiter details for anyone who cannot manage
     * companies, so an empty set means "not visible to you" rather than "none
     * recorded" — the two need different empty states.
     */
    it('detects a redacted payload', () => {
      expect(contactsWithheld({ contacts: [], email: null, phone: null })).toBe(true);
    });

    it('does not treat a genuinely empty contact list as redacted', () => {
      expect(
        contactsWithheld({ contacts: [], email: 'careers@acme.example.com', phone: null }),
      ).toBe(false);

      expect(contactsWithheld({ contacts: [], email: null, phone: '+919876500001' })).toBe(false);
    });

    it('is false whenever any contact is present', () => {
      expect(contactsWithheld({ contacts: [{}], email: null, phone: null })).toBe(false);
    });
  });
});
