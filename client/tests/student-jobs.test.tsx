import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobApplication, StudentOpening } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();

const STUDENT = [
  'job:read',
  'application:read',
  'application:create',
  'application:withdraw',
  'placement:read',
  'placement:respond',
];

let permissions: string[] = [...STUDENT];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/jobs',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions, { roleKey: 'student' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) };
});

const { default: StudentJobsPage } = await import('@/app/student/jobs/page');

function opening(overrides: Partial<StudentOpening> = {}): StudentOpening {
  return {
    job: {
      id: 'job-1',
      companyId: { id: 'company-1', name: 'Acme Technologies', industry: 'IT' },
      title: 'Software Engineer',
      description: 'Build things that matter.',
      jobType: 'full_time',
      workMode: 'hybrid',
      locations: ['Bengaluru'],
      openings: 12,
      compensation: {
        currency: 'INR',
        ctcMin: 1_200_000,
        ctcMax: 1_800_000,
        fixedComponent: null,
        variableComponent: null,
        stipendPerMonth: null,
        bondMonths: null,
        bondAmount: null,
      },
      applicationCloseAt: '2026-02-05T00:00:00.000Z',
      status: 'published',
      selectionRounds: [],
      stats: { applicationCount: 0 },
    },
    eligible: true,
    reasons: [],
    ...overrides,
  } as unknown as StudentOpening;
}

function ineligible(): StudentOpening {
  const base = opening();

  return {
    ...base,
    job: {
      ...base.job,
      id: 'job-2',
      title: 'Data Analyst',
      jobType: 'internship',
      workMode: 'remote',
      locations: ['Pune'],
      compensation: { ...base.job.compensation, ctcMin: 600000, ctcMax: 600000 },
    },
    eligible: false,
    reasons: [{ rule: 'minimum_cgpa', message: 'Requires a CGPA of 8.0; yours is 7.2.' }],
  } as unknown as StudentOpening;
}

beforeEach(() => {
  permissions = [...STUDENT];
  replace.mockReset();
  apiGet.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (url === '/jobs/me/openings') return Promise.resolve([opening(), ineligible()]);
    if (url === '/applications/me') return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

describe('Student jobs page', () => {
  it('lists the open drives with the package and deadline', async () => {
    renderWithQuery(<StudentJobsPage />);

    expect(await screen.findByRole('link', { name: 'Software Engineer' })).toBeInTheDocument();
    expect(screen.getByText('₹12.0 L – ₹18.0 L')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Technologies').length).toBeGreaterThan(0);
  });

  /** The verdict comes from the server; the card only renders it. */
  it('marks each drive as qualifying or not from the API verdict', async () => {
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    const eligibleCard = screen.getByRole('link', { name: 'Software Engineer' }).closest('div')!;
    expect(within(eligibleCard.parentElement!).getByText('You qualify')).toBeInTheDocument();

    const otherCard = screen.getByRole('link', { name: 'Data Analyst' }).closest('div')!;
    expect(within(otherCard.parentElement!).getByText('Not eligible')).toBeInTheDocument();
  });

  it('reads identity from the token, never from a student id in the URL', async () => {
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/jobs/me/openings');
    expect(urls.every((url) => !url.includes('studentId'))).toBe(true);
  });

  /**
   * `GET /jobs/me/openings` returns one array with no server-side search, so
   * the filtering is client-side and must not refetch.
   */
  it('filters by search without refetching', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    const callsBefore = apiGet.mock.calls.length;

    await user.type(screen.getByLabelText('Search opportunities'), 'analyst');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Software Engineer' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Data Analyst' })).toBeInTheDocument();
    expect(apiGet.mock.calls.length).toBe(callsBefore);
  });

  it('filters by engagement', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    await user.selectOptions(screen.getByLabelText('Filter by engagement'), 'internship');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Software Engineer' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Data Analyst' })).toBeInTheDocument();
  });

  it('can hide the drives the student does not qualify for', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Data Analyst' });
    await user.click(screen.getByLabelText(/only roles i qualify for/i));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Data Analyst' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Software Engineer' })).toBeInTheDocument();
  });

  /**
   * The openings endpoint carries no applied flag, so it is joined from the
   * student's own applications rather than invented.
   */
  it('shows the application status on a drive already applied to', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/jobs/me/openings') return Promise.resolve([opening()]);
      if (url === '/applications/me')
        return Promise.resolve([
          { id: 'application-1', jobPostingId: 'job-1', status: 'shortlisted' } as JobApplication,
        ]);
      return Promise.resolve([]);
    });

    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    expect(screen.getByText('Shortlisted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my application/i })).toBeInTheDocument();
    expect(screen.queryByText('You qualify')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is open', async () => {
    apiGet.mockResolvedValue([]);
    renderWithQuery(<StudentJobsPage />);

    expect(await screen.findByText(/no drives are open right now/i)).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentJobsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-9'),
    );

    renderWithQuery(<StudentJobsPage />);

    expect(await screen.findByText(/could not load opportunities/i)).toBeInTheDocument();
    expect(screen.getByText(/req-9/)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('redirects a caller without job:read', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentJobsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Software Engineer' })).not.toBeInTheDocument();
  });

  /** Nothing on a student page may reach an office endpoint. */
  it('calls only the student self-service endpoints', async () => {
    renderWithQuery(<StudentJobsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    for (const url of urls) {
      expect(url.startsWith('/jobs/me') || url.startsWith('/applications/me')).toBe(true);
    }
  });
});
