import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Exam, HallTicket } from '@/api/examination-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPost = vi.fn();

let permissions: string[] = ['exam:read'];
let routeParams: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/exams',
  useParams: () => routeParams,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

const { default: StudentExamsPage } = await import('@/app/student/exams/page');
const { default: StudentExamDetailPage } = await import('@/app/student/exams/[id]/page');

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 'exam-1',
    title: 'Data Structures End Semester',
    code: 'EXM-CS201-ES',
    examType: 'end_semester',
    courseId: { id: 'course-1', title: 'Data Structures', code: 'CS201', credits: 4 },
    departmentId: { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
    batchIds: [],
    semester: 3,
    academicYear: '2025-2026',
    maxMarks: { theory: 70, practical: 20, internal: 10 },
    totalMarks: 100,
    credits: 4,
    gradeScaleId: null,
    scheduledAt: '2026-04-18T04:30:00.000Z',
    durationMinutes: 180,
    venue: 'Block C — Hall 2',
    instructions: 'Non-programmable calculators are permitted.',
    status: 'published',
    trainingSessionId: null,
    resultsPublishedAt: null,
    currentResultVersion: 0,
    publications: [],
    stats: {
      registeredCount: 96,
      appearedCount: 94,
      absentCount: 2,
      passCount: 81,
      failCount: 13,
      averagePercent: 64.2,
      highestPercent: 97,
    },
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  } as Exam;
}

function hallTicket(overrides: Partial<HallTicket> = {}): HallTicket {
  return {
    id: 'reg-1',
    hallTicketNumber: 'HT-2026-000431',
    seatNumber: 'C2-17',
    rollNumber: 'CS22B001',
    batch: 'CSE 2022-26',
    attempt: 1,
    status: 'registered',
    ...overrides,
  };
}

function page(items: Exam[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides,
    },
  };
}

/** Every URL the page actually asked the network for. */
const urls = () => [
  ...apiGet.mock.calls.map((call) => String(call[0])),
  ...apiGetPaginated.mock.calls.map((call) => String(call[0])),
  ...apiPost.mock.calls.map((call) => String(call[0])),
];

beforeEach(() => {
  permissions = ['exam:read'];
  routeParams = { id: 'exam-1' };
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();
  apiPost.mockReset();
  apiGetPaginated.mockResolvedValue(page([exam()]));
  apiGet.mockResolvedValue(exam());
});

describe('Student exam list', () => {
  it('lists the exams the server returned, with schedule and status', async () => {
    renderWithQuery(<StudentExamsPage />);

    expect(await screen.findByRole('link', { name: 'Data Structures End Semester' })).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/Data Structures · CS201 · Semester 3/)).toBeInTheDocument();
    expect(screen.getByText('180 minutes')).toBeInTheDocument();
    expect(screen.getByText('Block C — Hall 2')).toBeInTheDocument();
  });

  it('requests only the student-scoped exam list — no roster, analytics or export', async () => {
    renderWithQuery(<StudentExamsPage />);

    await screen.findByRole('link', { name: 'Data Structures End Semester' });

    expect(apiGetPaginated).toHaveBeenCalledTimes(1);
    expect(urls()[0]).toMatch(/^\/examinations\?/);
    expect(urls().some((url) => /registrations|analytics|export|papers|marks/.test(url))).toBe(false);
  });

  it('does not re-filter server-supplied rows, so a widened lifecycle is never hidden client-side', async () => {
    // If the server ever returns a state this page did not anticipate, the row
    // must still render rather than vanish into a client-side filter.
    apiGetPaginated.mockResolvedValue(
      page([exam({ status: 'marks_entered', title: 'Operating Systems Mid Term' })]),
    );

    renderWithQuery(<StudentExamsPage />);

    expect(await screen.findByRole('link', { name: 'Operating Systems Mid Term' })).toBeInTheDocument();
    expect(screen.getByText('Marks entered')).toBeInTheDocument();
  });

  it('never renders cohort statistics on a student list row', async () => {
    renderWithQuery(<StudentExamsPage />);

    await screen.findByRole('link', { name: 'Data Structures End Semester' });

    // registeredCount, passCount, failCount and the averages arrive on the
    // payload but belong to the examination office, not to a classmate.
    expect(screen.queryByText(/96/)).not.toBeInTheDocument();
    expect(screen.queryByText(/64\.2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pass rate/i)).not.toBeInTheDocument();
  });

  it('flags an exam whose results have been released', async () => {
    apiGetPaginated.mockResolvedValue(
      page([exam({ status: 'results_published', resultsPublishedAt: '2026-05-02T00:00:00.000Z' })]),
    );

    renderWithQuery(<StudentExamsPage />);

    expect(await screen.findByText(/Results released/)).toBeInTheDocument();
  });

  it('shows an empty state when the student has no assessments', async () => {
    apiGetPaginated.mockResolvedValue(page([]));

    renderWithQuery(<StudentExamsPage />);

    expect(await screen.findByText('No assessments yet')).toBeInTheDocument();
  });

  it('shows an error state with the request id and retries on demand', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-exam-9'),
    );

    renderWithQuery(<StudentExamsPage />);

    expect(await screen.findByText('Could not load your assessments')).toBeInTheDocument();
    expect(screen.getByText(/req-exam-9/)).toBeInTheDocument();

    apiGetPaginated.mockResolvedValue(page([exam()]));
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /try again|retry/i }));

    expect(await screen.findByRole('link', { name: 'Data Structures End Semester' })).toBeInTheDocument();
  });

  it('pages forward through the list', async () => {
    apiGetPaginated.mockResolvedValue(
      page([exam()], { totalPages: 3, totalItems: 50, hasNextPage: true }),
    );

    renderWithQuery(<StudentExamsPage />);

    await screen.findByRole('link', { name: 'Data Structures End Semester' });
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(urls().some((url) => /page=2/.test(url))).toBe(true));
  });

  it('REQUEST MUST NOT LEAVE THE BROWSER without exam:read', async () => {
    permissions = ['attendance:read_own'];

    renderWithQuery(<StudentExamsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(apiGetPaginated).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('Student exam detail', () => {
  beforeEach(() => {
    apiGet.mockImplementation((url: string) =>
      url.includes('hall-tickets') ? Promise.resolve([hallTicket()]) : Promise.resolve(exam()),
    );
  });

  it('renders the schedule, marks breakdown and instructions', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Data Structures End Semester' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Block C — Hall 2')).toBeInTheDocument();
    expect(screen.getByText('180 minutes')).toBeInTheDocument();
    expect(screen.getByText('Non-programmable calculators are permitted.')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
  });

  it('renders the student’s own hall ticket', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    expect(await screen.findByText('HT-2026-000431')).toBeInTheDocument();
    expect(screen.getByText('CS22B001')).toBeInTheDocument();
    expect(screen.getByText('C2-17')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print hall ticket' })).toBeInTheDocument();
  });

  it('requests only the exam and the self-service hall ticket', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    await screen.findByText('HT-2026-000431');

    expect(urls().sort()).toEqual([
      '/examinations/exam-1',
      '/examinations/exam-1/hall-tickets',
    ]);
  });

  it('never requests papers, the roster, marks or analytics', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    await screen.findByText('HT-2026-000431');

    expect(
      urls().some((url) => /papers|registrations|\/marks|analytics|export|transition/.test(url)),
    ).toBe(false);
  });

  it('renders no paper, question or answer content', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    await screen.findByText('HT-2026-000431');

    expect(screen.queryByText(/question paper/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/answer key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attachment/i)).not.toBeInTheDocument();
  });

  it('does not ask for a hall ticket before the exam is published', async () => {
    apiGet.mockImplementation((url: string) =>
      url.includes('hall-tickets')
        ? Promise.resolve([hallTicket()])
        : Promise.resolve(exam({ status: 'scheduled' })),
    );

    renderWithQuery(<StudentExamDetailPage />);

    await screen.findByText(/will appear here once the examination is published/);

    expect(urls().some((url) => url.includes('hall-tickets'))).toBe(false);
  });

  it('explains a hall ticket that is not yet issued rather than showing a raw error', async () => {
    apiGet.mockImplementation((url: string) =>
      url.includes('hall-tickets')
        ? Promise.reject(
            new ApiError('UNPROCESSABLE_ENTITY', 'Exam is not published.', 422, [], 'req-ht-1'),
          )
        : Promise.resolve(exam()),
    );

    renderWithQuery(<StudentExamDetailPage />);

    expect(await screen.findByText(/hall ticket is not available yet/i)).toBeInTheDocument();
  });

  it('tells an unregistered student they have no hall ticket', async () => {
    apiGet.mockImplementation((url: string) =>
      url.includes('hall-tickets') ? Promise.resolve([]) : Promise.resolve(exam()),
    );

    renderWithQuery(<StudentExamDetailPage />);

    expect(await screen.findByText('No hall ticket')).toBeInTheDocument();
  });

  it('links to the results page once results are published', async () => {
    apiGet.mockImplementation((url: string) =>
      url.includes('hall-tickets')
        ? Promise.resolve([hallTicket()])
        : Promise.resolve(
            exam({ status: 'results_published', resultsPublishedAt: '2026-05-02T00:00:00.000Z' }),
          ),
    );

    renderWithQuery(<StudentExamDetailPage />);

    const alert = await screen.findByText('Results have been released');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View my results' })).toHaveAttribute(
      'href',
      '/student/results',
    );
  });

  it('shows an error state when the exam itself cannot be loaded', async () => {
    apiGet.mockRejectedValue(
      new ApiError('NOT_FOUND', 'Examination not found.', 404, [], 'req-exam-404'),
    );

    renderWithQuery(<StudentExamDetailPage />);

    expect(await screen.findByText('Could not load this assessment')).toBeInTheDocument();
    expect(screen.getByText(/req-exam-404/)).toBeInTheDocument();
  });

  it('REQUEST MUST NOT LEAVE THE BROWSER without exam:read', async () => {
    permissions = ['attendance:read_own'];

    renderWithQuery(<StudentExamDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(apiGet).not.toHaveBeenCalled();
    expect(apiGetPaginated).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('offers a way back to the list', async () => {
    renderWithQuery(<StudentExamDetailPage />);

    await screen.findByText('HT-2026-000431');

    expect(screen.getByRole('link', { name: /All assessments/ })).toHaveAttribute(
      'href',
      '/student/exams',
    );
  });
});
