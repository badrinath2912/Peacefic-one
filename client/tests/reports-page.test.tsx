import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiClientPost = vi.fn();

/**
 * The four roles that hold `report:generate`, exactly as the catalogue defines
 * them. Reporting draws on other modules, so what each one sees differs sharply.
 */
const COLLEGE_ADMIN = [
  'report:generate',
  'report:export',
  'placement:report',
  'placement:read_all',
  'application:read_all',
  'interview:read_all',
  'company:read',
  'job:read',
  'exam:read',
  'course:read',
  'training:read',
  'student:export',
  'faculty:read',
  'department:read',
  'batch:read',
];

/** HOD: no `placement:report`, no `company:read`, no `job:read`. */
const HOD = [
  'report:generate',
  'report:export',
  'placement:read_all',
  'application:read_all',
  'interview:read_all',
  'exam:read',
  'course:read',
  'training:read',
  'student:export',
  'faculty:read',
  'department:read',
  'batch:read',
];

/** Faculty: reporting, but no export permission at all. */
const FACULTY = ['report:generate', 'exam:read', 'course:read', 'faculty:read', 'department:read', 'batch:read'];

let permissions: string[] = [...COLLEGE_ADMIN];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/reports',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions, { roleKey: 'college_admin' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiClient: {
      ...actual.apiClient,
      post: (...args: unknown[]) => apiClientPost(...args),
    },
  };
});

const { default: ReportsPage } = await import('@/app/college/reports/page');

/** Every analytics endpoint the page can reach, keyed by URL fragment. */
const ANALYTICS: Record<string, unknown> = {
  '/placements/analytics': {
    totalOffers: 120,
    offered: 30,
    accepted: 50,
    declined: 10,
    joined: 25,
    revoked: 3,
    notJoined: 2,
    placedStudents: 105,
    totalStudents: 300,
    placementPercentage: 35,
    averageCtc: 900_000,
    highestCtc: 4_400_000,
    lowestCtc: 320_000,
    medianCtc: 780_000,
    byStatus: {},
    byDepartment: [],
    byBatch: [],
    topRecruiters: [],
  },
  '/applications/analytics': {
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
    byStatus: {},
  },
  '/interviews/analytics': {
    total: 24,
    upcoming: 9,
    scheduled: 7,
    confirmed: 5,
    completed: 10,
    cancelled: 1,
    noShow: 1,
    cleared: 6,
    rejected: 3,
    pendingResult: 8,
    byStatus: {},
    byResult: {},
  },
  '/companies/analytics': {
    total: 18,
    active: 16,
    blacklisted: 1,
    inactive: 1,
    verified: 12,
    industries: [],
    byStatus: {},
  },
  '/jobs/analytics': {
    total: 9,
    open: 3,
    published: 4,
    draft: 2,
    closed: 3,
    byStatus: {},
    averageCtc: 900_000,
    highestCtc: 4_400_000,
    totalOpenings: 137,
  },
  '/examinations/analytics': {
    total: 14,
    byStatus: {},
    upcoming: 3,
    awaitingMarks: 2,
    published: 9,
    passRate: 91,
    averagePercent: 68,
  },
  '/courses/analytics': { total: 42, published: 38, draft: 4, byCategory: [] },
  '/training/analytics': {
    requests: { total: 11, pending: 3, approved: 7, rejected: 1, byStatus: {} },
    sessions: { total: 20, scheduled: 5, inProgress: 1, completed: 14, upcoming: 5, byStatus: {} },
    completion: {
      totalEnrolled: 240,
      totalCompleted: 210,
      completionRate: 87.5,
      averageFeedback: 4.3,
    },
  },
};

/** URLs the page must never request without the matching permission. */
const analyticsUrls = () => apiGet.mock.calls.map((call) => String(call[0]));
const requested = (fragment: string) =>
  analyticsUrls().some((url) => url.startsWith(fragment));

beforeEach(() => {
  permissions = [...COLLEGE_ADMIN];
  replace.mockReset();
  apiGet.mockReset();
  apiClientPost.mockReset();

  apiGet.mockImplementation((url: string) => {
    const match = Object.keys(ANALYTICS).find((key) => String(url).startsWith(key));
    return match ? Promise.resolve(ANALYTICS[match]) : Promise.resolve({});
  });

  apiClientPost.mockResolvedValue({ data: new Blob(['x']), headers: { 'x-row-count': '3' } });
});

describe('Reports page', () => {
  it('renders every section a college admin may see', async () => {
    renderWithQuery(<ReportsPage />);

    expect(await screen.findByRole('heading', { name: 'Placement' })).toBeInTheDocument();

    for (const section of [
      'Applications',
      'Interviews',
      'Recruiters and drives',
      'Examinations',
      'Courses',
      'Training',
      'Institution records',
    ]) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
    }
  });

  /** Figures come from the server; the page renders them and computes nothing. */
  it('renders the figures the API returned', async () => {
    renderWithQuery(<ReportsPage />);

    // The heading renders while the section is still loading, so wait on a figure.
    expect(await screen.findByText('120')).toBeInTheDocument();

    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('₹44.0 L')).toBeInTheDocument();
    expect(screen.getByText('4.7%')).toBeInTheDocument();
    expect(screen.getByText('87.5%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('requests every analytics endpoint the caller is entitled to', async () => {
    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Placement' });

    for (const fragment of Object.keys(ANALYTICS)) {
      await waitFor(() => expect(requested(fragment)).toBe(true));
    }
  });

  /* ------------------------------- the filter ------------------------------- */

  /**
   * `/placements/analytics` is the only endpoint here that accepts a filter.
   * No control is offered for the others, because `validate` would strip it.
   */
  it('sends the academic year only on the endpoint that accepts it', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Placement' });

    const filter = screen.getByLabelText(/academic year/i);
    const option = within(filter).getAllByRole('option')[1] as HTMLOptionElement;
    await user.selectOptions(filter, option.value);

    await waitFor(() =>
      expect(
        analyticsUrls().some(
          (url) =>
            url.startsWith('/placements/analytics') &&
            url.includes(`academicYear=${option.value}`),
        ),
      ).toBe(true),
    );

    // No other endpoint was given the filter.
    const leaked = analyticsUrls().filter(
      (url) => !url.startsWith('/placements/analytics') && url.includes('academicYear'),
    );
    expect(leaked).toEqual([]);
  });

  /* --------------------------------- exports -------------------------------- */

  it('exports through the server for an authorised caller', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Placement' });
    await user.click(screen.getByRole('button', { name: /^Students$/ }));

    await waitFor(() => expect(apiClientPost).toHaveBeenCalled());
    expect(String(apiClientPost.mock.calls.at(-1)?.[0])).toContain('/students/bulk/export');
  });

  /* ------------------------------ states ------------------------------------ */

  it('shows a loading state before the figures arrive', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<ReportsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry on the section that failed', async () => {
    apiGet.mockImplementation((url: string) => {
      if (String(url).startsWith('/placements/analytics')) {
        return Promise.reject(
          new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-88'),
        );
      }
      const match = Object.keys(ANALYTICS).find((key) => String(url).startsWith(key));
      return match ? Promise.resolve(ANALYTICS[match]) : Promise.resolve({});
    });

    renderWithQuery(<ReportsPage />);

    expect(await screen.findByText(/could not load these figures/i)).toBeInTheDocument();
    expect(screen.getByText(/req-88/)).toBeInTheDocument();

    // The other sections still render.
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeInTheDocument();
  });

  /** Institution records have no analytics endpoint, so they are exports only. */
  it('says plainly when a section has no summary behind it', async () => {
    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Institution records' });
    expect(screen.getByText(/no summary is published for this area/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('redirects a caller without report:generate', async () => {
    permissions = ['exam:read', 'course:read'];

    renderWithQuery(<ReportsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Placement' })).not.toBeInTheDocument();
  });

  /**
   * HOD holds `report:generate` but neither `placement:report`, `company:read`
   * nor `job:read`. Those three requests must never leave the browser.
   */
  it('never requests the endpoints a HOD cannot read', async () => {
    permissions = [...HOD];

    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Applications' });

    expect(requested('/placements/analytics')).toBe(false);
    expect(requested('/companies/analytics')).toBe(false);
    expect(requested('/jobs/analytics')).toBe(false);

    // What they may read is still fetched.
    expect(requested('/applications/analytics')).toBe(true);
    expect(requested('/interviews/analytics')).toBe(true);
    expect(requested('/examinations/analytics')).toBe(true);
  });

  it('hides the sections a HOD cannot read', async () => {
    permissions = [...HOD];

    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Applications' });

    expect(screen.queryByRole('heading', { name: 'Placement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recruiters and drives' })).not.toBeInTheDocument();

    // And the filter belongs to the placement section, so it goes too.
    expect(screen.queryByLabelText(/academic year/i)).not.toBeInTheDocument();
  });

  /**
   * Faculty hold `report:generate` and no export permission whatsoever. Not one
   * export control may render, and no export request may be made.
   */
  it('offers a caller without report:export no export controls at all', async () => {
    permissions = [...FACULTY];

    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Examinations' });

    expect(screen.queryByRole('button', { name: /^Students$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Examinations$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Courses$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Faculty$/ })).not.toBeInTheDocument();

    expect(screen.getByText(/exporting is not available to you/i)).toBeInTheDocument();
    expect(apiClientPost).not.toHaveBeenCalled();
  });

  it('never requests placement or training analytics for faculty', async () => {
    permissions = [...FACULTY];

    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Examinations' });

    expect(requested('/placements/analytics')).toBe(false);
    expect(requested('/applications/analytics')).toBe(false);
    expect(requested('/interviews/analytics')).toBe(false);
    expect(requested('/companies/analytics')).toBe(false);
    expect(requested('/jobs/analytics')).toBe(false);
    expect(requested('/training/analytics')).toBe(false);

    expect(requested('/examinations/analytics')).toBe(true);
    expect(requested('/courses/analytics')).toBe(true);
  });

  /**
   * Exporting needs `report:export` and the module's own permission. Holding
   * the first without the second must not render the control.
   */
  it('hides an export whose module permission is missing', async () => {
    permissions = ['report:generate', 'report:export', 'exam:read'];

    renderWithQuery(<ReportsPage />);

    await screen.findByRole('heading', { name: 'Examinations' });

    // `exam:read` is held, so this one shows.
    expect(screen.getByRole('button', { name: /^Examinations$/ })).toBeInTheDocument();

    // These module permissions are absent.
    expect(screen.queryByRole('button', { name: /^Students$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Faculty$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Departments$/ })).not.toBeInTheDocument();
  });

  it('tells a caller with no readable module that there is nothing for them', async () => {
    permissions = ['report:generate'];

    renderWithQuery(<ReportsPage />);

    expect(await screen.findByText(/no reports are available to you/i)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
