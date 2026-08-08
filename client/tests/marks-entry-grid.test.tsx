import { calculateGrade, type GradeBandInput, type GradePolicyInput } from '@peacefic/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MarksEntry } from '@/api/examination-queries';
import {
  MarksEntryGrid,
  type MarksDraft,
  type MarksRow,
} from '@/components/examinations/marks-entry-grid';

const BANDS: GradeBandInput[] = [
  { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true },
  { letter: 'A', minPercent: 70, maxPercent: 89.99, gradePoint: 9, isPass: true },
  { letter: 'B', minPercent: 55, maxPercent: 69.99, gradePoint: 7, isPass: true },
  { letter: 'P', minPercent: 40, maxPercent: 54.99, gradePoint: 5, isPass: true },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false },
];

const POLICY: GradePolicyInput = {
  passingPercent: 40,
  maxGraceMarks: 5,
  maxGracePerSemester: 0,
  attendanceBonusEnabled: false,
  attendanceBonusThreshold: 90,
  attendanceBonusMarks: 0,
  repeatPolicy: 'best_attempt',
  countFailedCredits: true,
  gpaDecimalPlaces: 2,
};

const MAX_MARKS = { theory: 60, practical: 20, internal: 20 };

function row(overrides: Partial<MarksRow> = {}): MarksRow {
  return {
    studentId: 'student-1',
    rollNumber: 'CS22B001',
    name: 'Meera Iyer',
    attempt: 1,
    isNonAppearing: false,
    attendanceStatus: 'present',
    existing: undefined,
    ...overrides,
  };
}

function draft(overrides: Partial<MarksDraft> = {}): MarksDraft {
  return { theory: '', practical: '', internal: '', graceMarks: '0', ...overrides };
}

function renderGrid(rows: MarksRow[], drafts: Record<string, MarksDraft>) {
  return render(
    <MarksEntryGrid
      rows={rows}
      drafts={drafts}
      maxMarks={MAX_MARKS}
      bands={BANDS}
      policy={POLICY}
      onChange={vi.fn()}
      isRowLocked={() => false}
    />,
  );
}

/** The row a candidate's numbers live in, found by their roll number. */
function rowFor(rollNumber: string): HTMLElement {
  return screen.getByRole('rowheader', { name: new RegExp(rollNumber) }).closest('tr')!;
}

describe('MarksEntryGrid', () => {
  /**
   * The point of the shared engine is that the preview and the server cannot
   * disagree. This asserts it directly rather than trusting the import: the
   * grid's rendered grade is compared against `calculateGrade` for the same
   * input, across every band boundary.
   */
  it.each([
    ['0', '0', '0', 'F', 0],
    ['24', '8', '8', 'P', 40],
    ['33', '11', '11', 'B', 55],
    ['42', '14', '14', 'A', 70],
    ['54', '18', '18', 'O', 90],
    ['60', '20', '20', 'O', 100],
  ])(
    'renders the same grade the engine computes for %s/%s/%s',
    (theory, practical, internal, expectedLetter, expectedPercent) => {
      const drafts = { 'student-1': draft({ theory, practical, internal }) };

      const expected = calculateGrade(
        {
          obtained: {
            theory: Number(theory),
            practical: Number(practical),
            internal: Number(internal),
          },
          maximum: MAX_MARKS,
          graceMarks: 0,
          attendancePercent: null,
        },
        BANDS,
        POLICY,
      );

      expect(expected.letter).toBe(expectedLetter);
      expect(expected.percentage).toBe(expectedPercent);

      renderGrid([row()], drafts);

      const cells = within(rowFor('CS22B001')).getAllByRole('cell');

      // Total, percentage and grade sit in the last four columns.
      expect(cells.at(-4)).toHaveTextContent(String(expected.finalTotal));
      expect(cells.at(-3)).toHaveTextContent(`${expected.percentage}%`);
      expect(cells.at(-2)).toHaveTextContent(expected.letter);
    },
  );

  it('applies grace exactly as the engine caps it', () => {
    // 38% before grace; the policy allows 5 marks, so 20 is clipped to 5.
    const drafts = { 'student-1': draft({ theory: '20', practical: '10', internal: '8', graceMarks: '20' }) };

    const expected = calculateGrade(
      {
        obtained: { theory: 20, practical: 10, internal: 8 },
        maximum: MAX_MARKS,
        graceMarks: 20,
        attendancePercent: null,
      },
      BANDS,
      POLICY,
    );

    expect(expected.graceApplied).toBe(5);
    expect(expected.isPass).toBe(true);

    renderGrid([row()], drafts);

    const cells = within(rowFor('CS22B001')).getAllByRole('cell');
    expect(cells.at(-3)).toHaveTextContent(`${expected.percentage}%`);
    expect(cells.at(-2)).toHaveTextContent('+5 grace');
  });

  /** Absent, debarred and malpractice fail outright, whatever is typed. */
  it('shows a fail for a non-appearing candidate carrying full marks', () => {
    const drafts = { 'student-1': draft({ theory: '60', practical: '20', internal: '20' }) };

    renderGrid([row({ isNonAppearing: true, attendanceStatus: 'malpractice' })], drafts);

    const cells = within(rowFor('CS22B001')).getAllByRole('cell');
    expect(cells.at(-3)).toHaveTextContent('0%');
    expect(cells.at(-2)).toHaveTextContent('F');
    expect(cells.at(-1)).toHaveTextContent(/malpractice/i);
  });

  it('flags a component mark above its maximum before the server has to', () => {
    const drafts = { 'student-1': draft({ theory: '75' }) };

    renderGrid([row()], drafts);

    const theoryInput = screen.getByLabelText('theory marks for CS22B001');
    expect(theoryInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables a component the exam does not carry marks in', () => {
    render(
      <MarksEntryGrid
        rows={[row()]}
        drafts={{ 'student-1': draft() }}
        maxMarks={{ theory: 100, practical: 0, internal: 0 }}
        bands={BANDS}
        policy={POLICY}
        onChange={vi.fn()}
        isRowLocked={() => false}
      />,
    );

    expect(screen.getByLabelText('practical marks for CS22B001')).toBeDisabled();
    expect(screen.getByLabelText('theory marks for CS22B001')).not.toBeDisabled();
  });

  it('disables grace entirely when the scale allows none', () => {
    render(
      <MarksEntryGrid
        rows={[row()]}
        drafts={{ 'student-1': draft() }}
        maxMarks={MAX_MARKS}
        bands={BANDS}
        policy={{ ...POLICY, maxGraceMarks: 0 }}
        onChange={vi.fn()}
        isRowLocked={() => false}
      />,
    );

    expect(screen.getByLabelText('Grace marks for CS22B001')).toBeDisabled();
  });

  it('locks a verified row so it cannot be overwritten in place', () => {
    const existing = { status: 'verified', history: [] } as unknown as MarksEntry;

    render(
      <MarksEntryGrid
        rows={[row({ existing })]}
        drafts={{ 'student-1': draft({ theory: '40' }) }}
        maxMarks={MAX_MARKS}
        bands={BANDS}
        policy={POLICY}
        onChange={vi.fn()}
        isRowLocked={(candidate) =>
          ['verified', 'locked'].includes(candidate.existing?.status ?? '')
        }
      />,
    );

    expect(screen.getByLabelText('theory marks for CS22B001')).toBeDisabled();
    expect(rowFor('CS22B001')).toHaveTextContent('verified');
  });

  it('marks a resit so an examiner sees it is not a first attempt', () => {
    renderGrid([row({ attempt: 3 })], { 'student-1': draft() });
    expect(rowFor('CS22B001')).toHaveTextContent('Attempt 3');
  });

  it('reports how many times a mark has already been corrected', () => {
    const existing = {
      status: 'locked',
      history: [{ version: 1 }, { version: 2 }],
    } as unknown as MarksEntry;

    renderGrid([row({ existing })], { 'student-1': draft({ theory: '40' }) });
    expect(rowFor('CS22B001')).toHaveTextContent('2 corrections');
  });

  it('renders every registered candidate, entered or not', () => {
    renderGrid(
      [
        row(),
        row({ studentId: 'student-2', rollNumber: 'CS22B002', name: 'Ravi Kumar' }),
        row({ studentId: 'student-3', rollNumber: 'CS22B003', name: 'Asha Rao' }),
      ],
      {
        'student-1': draft({ theory: '40' }),
        'student-2': draft(),
        'student-3': draft({ theory: '55' }),
      },
    );

    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
    expect(rowFor('CS22B002')).toHaveTextContent('Not entered');
  });
});
