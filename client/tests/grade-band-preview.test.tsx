import { calculateGrade, type GradeBandInput, type GradePolicyInput } from '@peacefic/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { GradeBandPreview } from '@/components/examinations/grade-band-preview';

const BANDS: GradeBandInput[] = [
  { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true },
  { letter: 'A', minPercent: 70, maxPercent: 89.99, gradePoint: 9, isPass: true },
  { letter: 'P', minPercent: 40, maxPercent: 69.99, gradePoint: 5, isPass: true },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false },
];

const POLICY: GradePolicyInput = {
  passingPercent: 40,
  maxGraceMarks: 5,
  maxGracePerSemester: 0,
  attendanceBonusEnabled: false,
  attendanceBonusThreshold: 90,
  attendanceBonusMarks: 3,
  repeatPolicy: 'best_attempt',
  countFailedCredits: true,
  gpaDecimalPlaces: 2,
};

describe('GradeBandPreview', () => {
  it('asks for a band before it will preview anything', () => {
    render(<GradeBandPreview bands={[]} policy={POLICY} />);
    expect(screen.getByText(/add at least one band/i)).toBeInTheDocument();
  });

  it('ignores half-typed bands rather than rendering a broken preview', () => {
    // A band the user has started but not named yet must not blank the preview.
    render(
      <GradeBandPreview
        bands={[...BANDS, { letter: '', minPercent: 0, maxPercent: 0, gradePoint: 0, isPass: true }]}
        policy={POLICY}
      />,
    );

    expect(screen.queryByText(/add at least one band/i)).not.toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
  });

  it('grades the default sample the same way the engine does', () => {
    const expected = calculateGrade(
      {
        obtained: { theory: 72, practical: 0, internal: 0 },
        maximum: { theory: 100, practical: 0, internal: 0 },
        graceMarks: 0,
        attendancePercent: 85,
      },
      BANDS,
      POLICY,
    );

    render(<GradeBandPreview bands={BANDS} policy={POLICY} />);

    // Scoped to the result panel: the same letters also appear in the
    // band-edge probe chips below it.
    const panel = within(screen.getByRole('status', { name: 'Computed grade' }));
    expect(panel.getByText(expected.letter)).toBeInTheDocument();
    expect(panel.getByText(`${expected.percentage}%`)).toBeInTheDocument();
    expect(panel.getByText(expected.isPass ? 'Pass' : 'Fail')).toBeInTheDocument();
  });

  it('regrades live as the marks change', async () => {
    const user = userEvent.setup();
    render(<GradeBandPreview bands={BANDS} policy={POLICY} />);

    const obtained = screen.getByLabelText('Marks obtained');
    await user.clear(obtained);
    await user.type(obtained, '95');

    const panel = within(screen.getByRole('status', { name: 'Computed grade' }));
    expect(panel.getByText('O')).toBeInTheDocument();
    expect(panel.getByText('Pass')).toBeInTheDocument();
  });

  /**
   * A scale can be configured so its lowest passing band starts below the
   * policy's pass mark. The preview must show the policy winning, because that
   * is what the server will do.
   */
  it('shows the policy pass mark overriding a more generous band', async () => {
    const user = userEvent.setup();
    render(<GradeBandPreview bands={BANDS} policy={{ ...POLICY, passingPercent: 50 }} />);

    const obtained = screen.getByLabelText('Marks obtained');
    await user.clear(obtained);
    await user.type(obtained, '45');

    // The band says P, which is a passing band; the 50% policy says fail.
    const panel = within(screen.getByRole('status', { name: 'Computed grade' }));
    expect(panel.getByText('P')).toBeInTheDocument();
    expect(panel.getByText('Fail')).toBeInTheDocument();
  });

  it('warns when the cap discards part of the grace awarded', async () => {
    const user = userEvent.setup();
    render(<GradeBandPreview bands={BANDS} policy={POLICY} />);

    const obtained = screen.getByLabelText('Marks obtained');
    await user.clear(obtained);
    await user.type(obtained, '100');

    const grace = screen.getByLabelText('Grace');
    await user.clear(grace);
    await user.type(grace, '5');

    expect(screen.getByText(/cap discarded part of the bonus or grace/i)).toBeInTheDocument();
  });

  it('probes every band edge so a gap is visible before saving', () => {
    render(<GradeBandPreview bands={BANDS} policy={POLICY} />);

    // Each band contributes its min and max; 0 and 100 are always included.
    for (const percent of [0, 39.99, 40, 69.99, 70, 89.99, 90, 100]) {
      expect(screen.getByTitle(new RegExp(`^${percent}% grades as`))).toBeInTheDocument();
    }
  });

  it('states the pass mark that decides the outcome', () => {
    render(<GradeBandPreview bands={BANDS} policy={{ ...POLICY, passingPercent: 33 }} />);
    expect(screen.getByText(/pass mark of 33%/i)).toBeInTheDocument();
  });
});
