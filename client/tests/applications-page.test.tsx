import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationAnalytics, JobApplication } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPost = vi.fn();

/** The placement officer: may read every application, shortlist, reject, select. */
const OFFICE = [
  'application:read_all',
  'application:shortlist',
  'application:reject',
  'placement:create',
  'company:read',
  'job:read',
  'student:read_all',
];

/**
 * HOD as the catalogue actually defines them: the read permission and none of
 * the actions, with `department:read` but neither `company:read` nor `job:read`.
 */
const HOD = ['application:read_all', 'student:read', 'department:read'];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/applications',
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
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

const { default: ApplicationsPage } = await import('@/app/college/placements/applications/page');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function application(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 'application-1',
    jobPostingId: {
      id: 'job-1',
      title: 'Software Engineer',
      status: 'published',
      applicationCloseAt: '2026-02-05T00:00:00.000Z',
    } as unknown as JobApplication['jobPostingId'],
    companyId: {
      id: 'company-1',
      name: 'Acme Technologies',
      industry: 'Information Technology',
    } as unknown as JobApplication['companyId'],
    studentId: {
      id: 'student-1',
      rollNumber: 'CS22B001',
      userId: { firstName: 'Meera', lastName: 'Iyer', email: 'meera@example.edu' },
    },
    status: 'applied',
    currentRound: 0,
    coverLetter: null,
    answers: [],
    resumeUrl: null,
    eligibilitySnapshot: {
      cgpa: 8.42,
      activeBacklogs: 0,
      totalBacklogs: 1,
      attendancePercent: 88,
      capturedAt: '2026-01-06T00:00:00.000Z',
    },
    appliedAt: '2026-01-06T00:00:00.000Z',
    withdrawnAt: null,
    withdrawalReason: null,
    rejectedAt: null,
    rejectionReason: null,
    selectedAt: null,
    history: [],
    ...overrides,
  };
}

const ANALYTICS: ApplicationAnalytics = {
  total: 86,
  applied: 40,
  underReview: 12,
  shortlisted: 20,
  inProcess: 8,
  selected: 4,
  rejected: 2,
  withdrawn: 0,
  offerDeclined: 0,
  inProgress: 84,
  conversionRate: 4.7,
  byStatus: { applied: 40, shortlisted: 20 },
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
  apiPost.mockReset();

  apiGet.mockResolvedValue(ANALYTICS);

  apiGetPaginated.mockImplementation((url: string) => {
    if (url.startsWith('/companies'))
      return Promise.resolve(paginated([{ id: 'company-1', name: 'Acme Technologies' }]));
    if (url.startsWith('/jobs'))
      return Promise.resolve(paginated([{ id: 'job-1', title: 'Software Engineer' }]));
    if (url.startsWith('/departments'))
      return Promise.resolve(paginated([{ id: 'dept-1', name: 'Computer Science', code: 'CSE' }]));
    return Promise.resolve(paginated([application()]));
  });
});

describe('Applications page', () => {
  it('lists applications with the candidate, role and frozen CGPA', async () => {
    renderWithQuery(<ApplicationsPage />);

    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toBeInTheDocument();

    const row = screen.getByRole('link', { name: 'Meera Iyer' }).closest('tr')!;
    expect(within(row).getByText('CS22B001')).toBeInTheDocument();
    expect(within(row).getByText('Software Engineer')).toBeInTheDocument();
    expect(within(row).getByText('Acme Technologies')).toBeInTheDocument();
    expect(within(row).getByText('8.42')).toBeInTheDocument();
    expect(within(row).getByText('Applied')).toBeInTheDocument();
  });

  it('calls the applications endpoint with server-side list params', async () => {
    renderWithQuery(<ApplicationsPage />);

    await waitFor(() =>
      expect(
        apiGetPaginated.mock.calls.some((call) => String(call[0]).startsWith('/applications?')),
      ).toBe(true),
    );

    const url = String(
      apiGetPaginated.mock.calls.find((call) => String(call[0]).startsWith('/applications?'))?.[0],
    );

    expect(url).toContain('page=1');
    expect(url).toContain('sort=-appliedAt');
  });

  /**
   * `JobApplicationRepository` declares no searchable fields, so the server
   * drops `?search=`. Offering a box that silently does nothing would be worse
   * than offering none.
   */
  it('offers no search box, because the endpoint cannot search', async () => {
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows the pipeline tiles from the analytics endpoint', async () => {
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const statLabel = (text: string) =>
      screen.getAllByText(text).find((element) => element.tagName === 'P');

    for (const label of ['Applications', 'Under review', 'Shortlisted', 'In process', 'Selected']) {
      expect(statLabel(label)).toBeDefined();
    }

    expect(screen.getByText('86')).toBeInTheDocument();
  });

  it('refetches with a status filter and resets to page one', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'shortlisted');

    await waitFor(() => {
      const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some((url) => url.startsWith('/applications?') && url.includes('status=shortlisted')),
      ).toBe(true);
    });

    expect(screen.getByText(/1 filter applied/i)).toBeInTheDocument();
  });

  it('filters by role using the job postings endpoint', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const filter = screen.getByLabelText('Filter by role');
    await waitFor(() =>
      expect(within(filter).getByRole('option', { name: 'Software Engineer' })).toBeInTheDocument(),
    );

    await user.selectOptions(filter, 'job-1');

    await waitFor(() => {
      const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some((url) => url.startsWith('/applications?') && url.includes('jobPostingId=job-1')),
      ).toBe(true);
    });
  });

  it('shows an empty state', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/applications') ? paginated([]) : paginated([])),
    );

    renderWithQuery(<ApplicationsPage />);
    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument();
  });

  it('shows a loading state before the rows arrive', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<ApplicationsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong on our side.', 500, [], 'req-55'),
    );

    renderWithQuery(<ApplicationsPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByText(/req-55/)).toBeInTheDocument();
  });

  /* ------------------------------ bulk actions ------------------------------ */

  it('bulk shortlists the selected rows', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({ successCount: 1, failureCount: 0, results: [] });

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.click(screen.getByLabelText(/^Select row/));
    await user.click(screen.getByRole('button', { name: /^Shortlist$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /shortlist 1/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/applications/bulk/shortlist');
  });

  /** Rejection carries a reason, so it uses the shared reason dialog. */
  it('asks for a reason before a bulk reject', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.click(screen.getByLabelText(/^Select row/));
    await user.click(screen.getByRole('button', { name: /^Reject$/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/reason/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /**
   * `application:read_all` opens the page; it does not imply `company:read` or
   * `job:read`. A HOD holds the first and neither of the others, so the two
   * lookups must never leave the browser — handling a 403 is not enough.
   */
  it('never requests companies or drives for a caller who cannot read them', async () => {
    permissions = [...HOD];

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/companies'))).toBe(false);
    expect(urls.some((url) => url.startsWith('/jobs'))).toBe(false);

    // The applications themselves are still fetched — the page works.
    expect(urls.some((url) => url.startsWith('/applications?'))).toBe(true);
  });

  it('never requests departments without department:read', async () => {
    permissions = ['application:read_all'];

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/departments'))).toBe(false);
  });

  /** Rather than a filter that can never be populated. */
  it('hides the filters a read-only caller cannot populate', async () => {
    permissions = [...HOD];

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    expect(screen.queryByLabelText('Filter by company')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by role')).not.toBeInTheDocument();

    // Status needs no lookup, and HOD holds `department:read`.
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by department')).toBeInTheDocument();
  });

  /** The gate must not cost an authorised caller anything. */
  it('still requests companies and drives for a placement officer', async () => {
    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/companies'))).toBe(true);
    expect(urls.some((url) => url.startsWith('/jobs'))).toBe(true);

    expect(screen.getByLabelText('Filter by company')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by role')).toBeInTheDocument();
  });

  /** HOD may read every application but drive none of them. */
  it('offers no bulk actions to a caller with read access only', async () => {
    const user = userEvent.setup();
    permissions = [...HOD];

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.click(screen.getByLabelText(/^Select row/));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Shortlist$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument();
  });

  it('offers shortlist but not reject to a caller holding only application:shortlist', async () => {
    const user = userEvent.setup();
    permissions = ['application:read_all', 'application:shortlist'];

    renderWithQuery(<ApplicationsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.click(screen.getByLabelText(/^Select row/));

    expect(screen.getByRole('button', { name: /^Shortlist$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument();
  });

  /**
   * `placement:read_all` is not `application:read_all` — holding the first must
   * not open a page that lists every student's application.
   */
  it('redirects a caller holding placement:read_all but not application:read_all', async () => {
    permissions = ['placement:read_all', 'placement:report'];

    renderWithQuery(<ApplicationsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Meera Iyer' })).not.toBeInTheDocument();
  });

  it('redirects a student holding only application:read', async () => {
    permissions = ['application:read', 'application:create'];

    renderWithQuery(<ApplicationsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
