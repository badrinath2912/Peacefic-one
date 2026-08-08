import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EligibleStudent, JobProfile } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();

const OFFICE = ['job:read', 'application:read_all'];
let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/jobs/job-1/eligible-students',
  useParams: () => ({ id: 'job-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions, { roleKey: 'placement_officer' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
  };
});

const { default: EligibleStudentsPage } = await import(
  '@/app/college/placements/jobs/[id]/eligible-students/page'
);

const PROFILE = {
  job: {
    id: 'job-1',
    title: 'Software Engineer',
    openings: 12,
    eligibility: {
      departmentIds: [],
      batchIds: [],
      graduationYears: [],
      minCgpa: 7.5,
      maxActiveBacklogs: 0,
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
    },
  },
  company: null,
  counts: { eligible: 2, applications: 0, shortlisted: 0, selected: 0, openings: 12 },
  window: { isOpen: true, opensAt: '2026-01-05T00:00:00.000Z', closesAt: '2026-02-05T00:00:00.000Z' },
  allowedTransitions: [],
} as unknown as JobProfile;

const STUDENTS: EligibleStudent[] = [
  {
    id: 'student-1',
    rollNumber: 'CS22B001',
    name: { firstName: 'Meera', lastName: 'Iyer' },
    departmentId: 'dept-1',
    batchId: 'batch-1',
    cgpa: 8.42,
    activeBacklogs: 0,
    isPlaced: false,
  },
  {
    id: 'student-2',
    rollNumber: 'EC22B044',
    name: { firstName: 'Arjun', lastName: 'Rao' },
    departmentId: 'dept-2',
    batchId: 'batch-2',
    cgpa: 7.9,
    activeBacklogs: 0,
    isPlaced: true,
  },
];

function paginated<T>(items: T[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 200,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

beforeEach(() => {
  permissions = [...OFFICE];
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();

  apiGet.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/eligible-students') ? STUDENTS : PROFILE),
  );

  apiGetPaginated.mockImplementation((url: string) => {
    if (url.startsWith('/departments'))
      return Promise.resolve(
        paginated([
          { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
          { id: 'dept-2', name: 'Electronics', code: 'ECE' },
        ]),
      );
    if (url.startsWith('/batches'))
      return Promise.resolve(
        paginated([
          { id: 'batch-1', name: '2022–26', code: 'CSE-A' },
          { id: 'batch-2', name: '2022–26', code: 'ECE-B' },
        ]),
      );
    return Promise.resolve(paginated([]));
  });
});

describe('Eligible students page', () => {
  it('lists each student with their department, batch and academics', async () => {
    renderWithQuery(<EligibleStudentsPage />);

    expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();

    const row = screen.getByText('Meera Iyer').closest('tr')!;
    expect(within(row).getByText('CS22B001')).toBeInTheDocument();
    expect(within(row).getByText('Computer Science')).toBeInTheDocument();
    expect(within(row).getByText('CSE-A')).toBeInTheDocument();
    expect(within(row).getByText('8.42')).toBeInTheDocument();
  });

  it('marks a student who already holds an offer', async () => {
    renderWithQuery(<EligibleStudentsPage />);

    await screen.findByText('Arjun Rao');
    const row = screen.getByText('Arjun Rao').closest('tr')!;
    expect(within(row).getByText('Already placed')).toBeInTheDocument();
  });

  it('shows the criteria that produced the list', async () => {
    renderWithQuery(<EligibleStudentsPage />);

    await screen.findByText('Meera Iyer');

    expect(screen.getByText('7.5 and above')).toBeInTheDocument();
    expect(screen.getByText('None outstanding')).toBeInTheDocument();
  });

  /** The endpoint returns one array, so the filtering is over what arrived. */
  it('filters by name without refetching', async () => {
    const user = userEvent.setup();
    renderWithQuery(<EligibleStudentsPage />);

    await screen.findByText('Meera Iyer');
    const callsBefore = apiGet.mock.calls.length;

    await user.type(screen.getByLabelText('Search eligible students'), 'arjun');

    await waitFor(() => expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument());
    expect(screen.getByText('Arjun Rao')).toBeInTheDocument();
    expect(apiGet.mock.calls.length).toBe(callsBefore);
  });

  it('filters by department', async () => {
    const user = userEvent.setup();
    renderWithQuery(<EligibleStudentsPage />);

    await screen.findByText('Meera Iyer');
    await user.selectOptions(screen.getByLabelText('Filter by department'), 'dept-2');

    await waitFor(() => expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument());
    expect(screen.getByText('Arjun Rao')).toBeInTheDocument();
    expect(screen.getByText(/showing 1 of 2/i)).toBeInTheDocument();
  });

  it('clears the filters', async () => {
    const user = userEvent.setup();
    renderWithQuery(<EligibleStudentsPage />);

    await screen.findByText('Meera Iyer');
    await user.selectOptions(screen.getByLabelText('Filter by department'), 'dept-2');

    await waitFor(() => expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();
  });

  it('explains an empty roster rather than showing a blank table', async () => {
    apiGet.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/eligible-students') ? [] : PROFILE),
    );

    renderWithQuery(<EligibleStudentsPage />);

    expect(
      await screen.findByText(/no students currently match this job/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/publishing is refused while nobody qualifies/i)).toBeInTheDocument();
  });

  it('shows a loading state before the roster arrives', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<EligibleStudentsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(
      new ApiError('FORBIDDEN', 'You do not have access to this.', 403, [], 'req-13'),
    );

    renderWithQuery(<EligibleStudentsPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /**
   * This page names classmates with their CGPA and backlog count, so `job:read`
   * — which every student holds — is not enough to reach it.
   */
  it('redirects a caller holding only job:read', async () => {
    permissions = ['job:read'];
    renderWithQuery(<EligibleStudentsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument();
  });

  it('never requests the roster without application:read_all', async () => {
    permissions = ['job:read'];
    renderWithQuery(<EligibleStudentsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith('/eligible-students'))).toBe(false);
  });
});
