import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transcript, TranscriptSubject } from '@/api/examination-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
let permissions: string[] = ['transcript:read_own', 'student:read_own'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/transcript',
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

const { default: StudentTranscriptPage } = await import('@/app/student/transcript/page');

function subject(overrides: Partial<TranscriptSubject> = {}): TranscriptSubject {
  return {
    courseId: 'course-1',
    courseCode: 'CS201',
    courseTitle: 'Data Structures and Algorithms',
    semester: 5,
    credits: 4,
    letter: 'A',
    gradePoint: 9,
    percentage: 79,
    isPass: true,
    attempt: 1,
    examId: 'exam-1',
    ...overrides,
  };
}

function transcript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    studentId: 'student-1',
    revision: 1,
    isCurrent: true,
    upToSemester: 5,
    cgpa: 9,
    totalCreditsAttempted: 4,
    totalCreditsEarned: 4,
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
    subjects: [subject()],
    generatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

/** The page also loads the student profile for the header. */
function routeResponses(transcriptValue: Transcript | null) {
  return (url: string) => {
    if (url === '/examinations/me/transcript') return Promise.resolve(transcriptValue);
    if (url === '/students/me') {
      return Promise.resolve({
        rollNumber: 'CS22B001',
        userId: { fullName: 'Meera Iyer' },
      });
    }
    return Promise.resolve(null);
  };
}

beforeEach(() => {
  permissions = ['transcript:read_own', 'student:read_own'];
  replace.mockReset();
  apiGet.mockReset();
});

describe('Student transcript page', () => {
  it('calls the self-service endpoint, with no student id in the URL', async () => {
    apiGet.mockImplementation(routeResponses(transcript()));
    renderWithQuery(<StudentTranscriptPage />);

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/examinations/me/transcript'));
    expect(apiGet.mock.calls.map((call) => String(call[0]))).not.toContain(
      expect.stringMatching(/transcripts\/[a-z0-9]/i),
    );
  });

  it('renders semester-wise history with courses, credits and grades', async () => {
    apiGet.mockImplementation(routeResponses(transcript()));
    renderWithQuery(<StudentTranscriptPage />);

    expect(await screen.findByText('Semester 5')).toBeInTheDocument();
    expect(screen.getByText('CS201')).toBeInTheDocument();
    expect(screen.getByText(/Data Structures and Algorithms/)).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows the SGPA for each semester and the overall CGPA', async () => {
    apiGet.mockImplementation(
      routeResponses(
        transcript({
          cgpa: 8.5,
          semesters: [
            { semester: 5, creditsAttempted: 4, creditsEarned: 4, gpa: 9, subjectCount: 1, failedCount: 0 },
            { semester: 6, creditsAttempted: 4, creditsEarned: 4, gpa: 8, subjectCount: 1, failedCount: 0 },
          ],
          subjects: [
            subject(),
            subject({ semester: 6, courseCode: 'CS301', courseTitle: 'Computer Networks' }),
          ],
        }),
      ),
    );

    renderWithQuery(<StudentTranscriptPage />);

    // CGPA in the stat card.
    expect(await screen.findByText('8.50')).toBeInTheDocument();

    // SGPA under each semester heading.
    const sgpaLabels = screen.getAllByText('SGPA');
    expect(sgpaLabels).toHaveLength(2);
    expect(screen.getByText('9.00')).toBeInTheDocument();
    expect(screen.getByText('8.00')).toBeInTheDocument();
  });

  it('groups each subject under the semester it was taken in', async () => {
    apiGet.mockImplementation(
      routeResponses(
        transcript({
          semesters: [
            { semester: 5, creditsAttempted: 4, creditsEarned: 4, gpa: 9, subjectCount: 1, failedCount: 0 },
            { semester: 6, creditsAttempted: 4, creditsEarned: 4, gpa: 8, subjectCount: 1, failedCount: 0 },
          ],
          subjects: [
            subject(),
            subject({ semester: 6, courseCode: 'CS301', courseTitle: 'Computer Networks' }),
          ],
        }),
      ),
    );

    renderWithQuery(<StudentTranscriptPage />);

    const fifth = (await screen.findByText('Semester 5')).closest('div.rounded-lg')!;
    const sixth = screen.getByText('Semester 6').closest('div.rounded-lg')!;

    expect(within(fifth as HTMLElement).getByText('CS201')).toBeInTheDocument();
    expect(within(fifth as HTMLElement).queryByText('CS301')).not.toBeInTheDocument();
    expect(within(sixth as HTMLElement).getByText('CS301')).toBeInTheDocument();
  });

  it('reports backlogs and attempt information', async () => {
    apiGet.mockImplementation(
      routeResponses(
        transcript({
          activeBacklogs: 2,
          totalBacklogs: 3,
          subjects: [subject({ attempt: 2, letter: 'P', gradePoint: 5, percentage: 45 })],
        }),
      ),
    );

    renderWithQuery(<StudentTranscriptPage />);

    expect(await screen.findByText('Active backlogs')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/attempt 2/i)).toBeInTheDocument();
  });

  /** A student with no issued transcript is a normal state, not an error. */
  it('shows an empty state when no transcript has been issued', async () => {
    apiGet.mockImplementation(routeResponses(null));
    renderWithQuery(<StudentTranscriptPage />);

    expect(await screen.findByText(/no transcript issued yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view my results/i })).toBeInTheDocument();
  });

  it('shows a loading state before the transcript arrives', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentTranscriptPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong on our side.', 500, [], 'req-456'),
    );

    renderWithQuery(<StudentTranscriptPage />);

    expect(await screen.findByText(/could not load your transcript/i)).toBeInTheDocument();
    expect(screen.getByText(/req-456/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('states the transcript is a snapshot, so a later correction is expected', async () => {
    apiGet.mockImplementation(routeResponses(transcript()));
    renderWithQuery(<StudentTranscriptPage />);

    expect(await screen.findByText(/snapshot taken on/i)).toBeInTheDocument();
    expect(screen.getByText(/issue a new revision/i)).toBeInTheDocument();
  });

  it('redirects a caller without transcript:read_own away from the page', async () => {
    permissions = ['course:read'];
    apiGet.mockImplementation(routeResponses(transcript()));

    renderWithQuery(<StudentTranscriptPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('CS201')).not.toBeInTheDocument();
  });
});
