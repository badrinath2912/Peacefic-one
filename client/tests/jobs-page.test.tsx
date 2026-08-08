import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Company, JobAnalytics, JobPosting } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();

const OFFICE = [
  'job:read',
  'job:create',
  'job:update',
  'job:delete',
  'job:publish',
  'job:close',
  'company:read',
  'application:read_all',
];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/jobs',
  useParams: () => ({}),
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

const { default: JobPostingsPage } = await import('@/app/college/placements/jobs/page');

const COMPANY = {
  id: 'company-1',
  name: 'Acme Technologies',
  industry: 'Information Technology',
} as unknown as Company;

function job(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'job-1',
    companyId: COMPANY,
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
    eligibility: {
      departmentIds: [],
      batchIds: [],
      graduationYears: [2026],
      minCgpa: 7,
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
    selectionRounds: [
      { order: 1, name: 'Aptitude', type: 'aptitude', mode: 'online', durationMinutes: 60, description: null },
    ],
    applicationOpenAt: '2026-01-05T00:00:00.000Z',
    applicationCloseAt: '2026-02-05T00:00:00.000Z',
    driveDate: '2026-02-20T00:00:00.000Z',
    status: 'published',
    publishedAt: '2026-01-05T00:00:00.000Z',
    closedAt: null,
    closureReason: null,
    stats: {
      eligibleCount: 240,
      applicationCount: 86,
      shortlistedCount: 20,
      selectedCount: 4,
      eligibilityComputedAt: '2026-01-05T00:00:00.000Z',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ANALYTICS: JobAnalytics = {
  total: 9,
  open: 3,
  published: 4,
  draft: 2,
  closed: 3,
  byStatus: { published: 4, draft: 2, closed: 3 },
  averageCtc: 900_000,
  highestCtc: 4_400_000,
  totalOpenings: 137,
};

function paginated<T>(items: T[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 25,
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

  apiGet.mockResolvedValue(ANALYTICS);
  apiGetPaginated.mockImplementation((url: string) =>
    Promise.resolve(url.startsWith('/companies') ? paginated([COMPANY]) : paginated([job()])),
  );
});

describe('Job postings page', () => {
  it('lists postings with their company, package and applications', async () => {
    renderWithQuery(<JobPostingsPage />);

    expect(await screen.findByRole('link', { name: 'Software Engineer' })).toBeInTheDocument();

    // Scoped to the row: the company also appears as a filter option.
    const row = screen.getByRole('link', { name: 'Software Engineer' }).closest('tr')!;
    expect(within(row).getByText('Acme Technologies')).toBeInTheDocument();
    expect(within(row).getByText('₹12.0 L – ₹18.0 L')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('86')).toBeInTheDocument();
    expect(within(row).getByText('Published')).toBeInTheDocument();
  });

  it('calls the jobs endpoint with server-side list params', async () => {
    renderWithQuery(<JobPostingsPage />);

    await waitFor(() =>
      expect(
        apiGetPaginated.mock.calls.some((call) => String(call[0]).startsWith('/jobs?')),
      ).toBe(true),
    );

    const url = String(
      apiGetPaginated.mock.calls.find((call) => String(call[0]).startsWith('/jobs?'))?.[0],
    );

    // Paging and sorting belong to the server, never to the client.
    expect(url).toContain('page=1');
    expect(url).toContain('sort=-createdAt');
  });

  it('shows the analytics tiles', async () => {
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    /**
     * "Postings" is also the page heading and several labels double as filter
     * options, so a tile is matched on being a paragraph.
     */
    const statLabel = (text: string) =>
      screen.getAllByText(text).find((element) => element.tagName === 'P');

    for (const label of ['Postings', 'Accepting applications', 'Drafts', 'Total openings']) {
      expect(statLabel(label)).toBeDefined();
    }

    expect(screen.getByText('137')).toBeInTheDocument();
    expect(screen.getByText('₹44.0 L')).toBeInTheDocument();
  });

  it('refetches with a status filter applied', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'draft');

    await waitFor(() => {
      const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.startsWith('/jobs?') && url.includes('status=draft'))).toBe(
        true,
      );
    });

    expect(screen.getByText(/1 filter applied/i)).toBeInTheDocument();
  });

  it('populates the company filter from the companies endpoint', async () => {
    renderWithQuery(<JobPostingsPage />);

    const filter = await screen.findByLabelText('Filter by company');
    await waitFor(() =>
      expect(
        within(filter).getByRole('option', { name: 'Acme Technologies' }),
      ).toBeInTheDocument(),
    );
  });

  it('debounces the search into the request', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    await user.type(screen.getByLabelText('Search job postings'), 'analyst');

    await waitFor(
      () => {
        const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
        expect(urls.some((url) => url.includes('search=analyst'))).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it('shows an empty state that offers a way forward', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/companies') ? paginated([COMPANY]) : paginated([])),
    );

    renderWithQuery(<JobPostingsPage />);

    expect(await screen.findByText(/no job postings yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new posting/i })).toHaveLength(2);
  });

  it('shows a loading state before the rows arrive', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<JobPostingsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong on our side.', 500, [], 'req-91'),
    );

    renderWithQuery(<JobPostingsPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByText(/req-91/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('hides the create action from a caller without job:create', async () => {
    permissions = ['job:read'];
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    expect(screen.queryByRole('link', { name: /new posting/i })).not.toBeInTheDocument();
  });

  it('offers no bulk delete to a caller without job:delete', async () => {
    const user = userEvent.setup();
    permissions = ['job:read'];
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    await user.click(screen.getByLabelText(/^Select row/));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('offers bulk delete to a caller who may delete postings', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobPostingsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });
    await user.click(screen.getByLabelText(/^Select row/));

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  /** The guard decides what renders; the server independently returns 403. */
  it('redirects a caller without job:read away from the page', async () => {
    permissions = ['course:read'];
    renderWithQuery(<JobPostingsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Software Engineer' })).not.toBeInTheDocument();
  });
});
