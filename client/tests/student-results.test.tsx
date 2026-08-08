import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnResult, OwnResults, WithheldResult } from '@/api/examination-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
let permissions: string[] = ['result:read_own'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/results',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) };
});

const { default: StudentResultsPage } = await import('@/app/student/results/page');

function result(overrides: Partial<OwnResult> = {}): OwnResult {
  return {
    id: 'entry-1',
    examId: 'exam-1',
    examTitle: 'DSA Semester Examination',
    examCode: 'DSA-SEM5',
    courseCode: 'CS201',
    courseTitle: 'Data Structures and Algorithms',
    semester: 5,
    credits: 4,
    attempt: 1,
    isRepeat: false,
    theory: 45,
    practical: 16,
    internal: 18,
    rawTotal: 79,
    attendanceBonus: 0,
    graceMarks: 0,
    finalTotal: 79,
    maxTotal: 100,
    percentage: 79,
    letter: 'A',
    gradePoint: 9,
    isPass: true,
    isAbsent: false,
    ...overrides,
  };
}

function withheld(overrides: Partial<WithheldResult> = {}): WithheldResult {
  return {
    examId: 'exam-2',
    examTitle: 'Operating Systems Examination',
    examCode: 'OS-SEM5',
    courseCode: 'CS202',
    courseTitle: 'Operating Systems',
    semester: 5,
    credits: 3,
    attempt: 1,
    ...overrides,
  };
}

function payload(overrides: Partial<OwnResults> = {}): OwnResults {
  return {
    results: [result()],
    withheld: [],
    summary: {
      cgpa: 9,
      totalCreditsEarned: 4,
      totalCreditsAttempted: 4,
      activeBacklogs: 0,
      totalBacklogs: 0,
      semesters: [
        {
          semester: 5,
          creditsAttempted: 4,
          creditsEarned: 4,
          gpa: 9,
          subjectCount: 1,
          failedCount: 0,
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  permissions = ['result:read_own'];
  replace.mockReset();
  apiGet.mockReset();
});

describe('Student results page', () => {
  it('calls the self-service endpoint, with no student id in the URL', async () => {
    apiGet.mockResolvedValue(payload());
    renderWithQuery(<StudentResultsPage />);

    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // The browser never names a student — the server reads it from the token.
    expect(apiGet).toHaveBeenCalledWith('/examinations/me/results');
    expect(String(apiGet.mock.calls[0]?.[0])).not.toMatch(/students\//);
  });

  it('renders a published result with its marks, grade and credits', async () => {
    apiGet.mockResolvedValue(payload());
    renderWithQuery(<StudentResultsPage />);

    const rows = await screen.findAllByText('Data Structures and Algorithms');
    expect(rows.length).toBeGreaterThan(0);

    expect(screen.getAllByText('DSA Semester Examination').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    // 79 / 100 appears in the table and again in the card layout.
    expect(screen.getAllByText(/79/).length).toBeGreaterThan(0);
  });

  it('shows the CGPA and the semester SGPA the API supplied', async () => {
    apiGet.mockResolvedValue(payload());
    renderWithQuery(<StudentResultsPage />);

    // Waits for the data, not the label: the stat card renders its label
    // immediately and shows a skeleton until the query resolves.
    const semesterHeading = await screen.findByText('Semester 5');

    // Both figures are 9.00 here, so each is read from its own block rather
    // than by a document-wide text match.
    const cgpaCard = screen.getByText('CGPA').closest('div.rounded-lg')!;
    expect(within(cgpaCard as HTMLElement).getByText('9.00')).toBeInTheDocument();
    expect(semesterHeading).toBeInTheDocument();

    const semesterRow = screen.getByText('Semester 5').closest('li')!;
    expect(within(semesterRow as HTMLElement).getByText('9.00')).toBeInTheDocument();
    expect(within(semesterRow as HTMLElement).getByText(/4 \/ 4 credits/)).toBeInTheDocument();
  });

  /**
   * A withheld result must be acknowledged so the student knows to ask, but it
   * must never read as a published grade.
   */
  it('separates a withheld result and shows no grade for it', async () => {
    apiGet.mockResolvedValue(payload({ results: [], withheld: [withheld()] }));
    renderWithQuery(<StudentResultsPage />);

    const heading = await screen.findByRole('heading', {
      name: /held by the examination office/i,
    });
    const section = heading.closest('section')!;

    expect(within(section).getByText('Withheld')).toBeInTheDocument();
    expect(within(section).getByText('Operating Systems')).toBeInTheDocument();
    expect(within(section).getByText(/not counted in your cgpa/i)).toBeInTheDocument();

    // No grade letter, percentage or total anywhere in the withheld block.
    expect(within(section).queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it('does not render a withheld section when nothing is withheld', async () => {
    apiGet.mockResolvedValue(payload());
    renderWithQuery(<StudentResultsPage />);

    await screen.findAllByText('Data Structures and Algorithms');
    expect(
      screen.queryByRole('heading', { name: /held by the examination office/i }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing has been published', async () => {
    apiGet.mockResolvedValue(
      payload({
        results: [],
        withheld: [],
        summary: {
          cgpa: 0,
          totalCreditsEarned: 0,
          totalCreditsAttempted: 0,
          activeBacklogs: 0,
          totalBacklogs: 0,
          semesters: [],
        },
      }),
    );

    renderWithQuery(<StudentResultsPage />);

    expect(await screen.findAllByText(/no results published yet/i)).not.toHaveLength(0);
    expect(
      screen.getAllByText(/results appear here as soon as your institution releases them/i).length,
    ).toBeGreaterThan(0);
  });

  it('shows a loading state before the results arrive', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentResultsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong on our side.', 500, [], 'req-123'),
    );

    renderWithQuery(<StudentResultsPage />);

    expect(await screen.findByText(/could not load your results/i)).toBeInTheDocument();
    expect(screen.getByText(/something went wrong on our side/i)).toBeInTheDocument();
    expect(screen.getByText(/req-123/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('marks a failed subject as a fail rather than a pass', async () => {
    apiGet.mockResolvedValue(
      payload({
        results: [
          result({
            letter: 'F',
            percentage: 31,
            finalTotal: 31,
            gradePoint: 0,
            isPass: false,
          }),
        ],
      }),
    );

    renderWithQuery(<StudentResultsPage />);
    expect(await screen.findAllByText('F')).not.toHaveLength(0);
  });

  it('flags a repeat attempt', async () => {
    apiGet.mockResolvedValue(
      payload({ results: [result({ isRepeat: true, attempt: 2 })] }),
    );

    renderWithQuery(<StudentResultsPage />);
    expect(await screen.findAllByText(/attempt 2/i)).not.toHaveLength(0);
  });

  it('filters by semester once more than one exists', async () => {
    apiGet.mockResolvedValue(
      payload({
        results: [
          result(),
          result({
            id: 'entry-2',
            semester: 6,
            courseCode: 'CS301',
            courseTitle: 'Computer Networks',
          }),
        ],
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<StudentResultsPage />);

    await screen.findAllByText('Computer Networks');

    await user.selectOptions(screen.getByLabelText('Filter by semester'), '6');

    expect(screen.getAllByText('Computer Networks').length).toBeGreaterThan(0);
    expect(screen.queryByText('Data Structures and Algorithms')).not.toBeInTheDocument();
  });

  /** The guard decides what renders; the server independently returns 403. */
  it('redirects a caller without result:read_own away from the page', async () => {
    permissions = ['course:read'];
    apiGet.mockResolvedValue(payload());

    renderWithQuery(<StudentResultsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('Data Structures and Algorithms')).not.toBeInTheDocument();
  });
});
