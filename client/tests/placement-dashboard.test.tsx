import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Placement, PlacementAnalytics } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();

const OFFICER = [
  'placement:read_all',
  'placement:report',
  'placement:create',
  'placement:update',
  'company:read',
  'department:read',
  'job:read',
];

/** HOD: may read placements, but not report, and not companies or drives. */
const HOD = ['placement:read_all', 'department:read', 'batch:read'];

let permissions: string[] = [...OFFICER];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements',
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

const { default: PlacementDashboardPage } = await import('@/app/college/placements/page');

const ANALYTICS: PlacementAnalytics = {
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
  byStatus: { offered: 30, accepted: 50 },
  byDepartment: [{ departmentId: 'dept-1', placed: 60, highestCtc: 4_400_000 }],
  byBatch: [{ batchId: 'batch-1', placed: 30, highestCtc: 4_400_000 }],
  topRecruiters: [{ companyId: 'company-1', offers: 18, highestCtc: 4_400_000 }],
};

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'offer-1',
    studentId: {
      id: 'student-1',
      rollNumber: 'CS22B001',
      userId: { firstName: 'Meera', lastName: 'Iyer', email: 'meera@example.edu' },
    },
    applicationId: 'application-1',
    jobPostingId: 'job-1',
    companyId: {
      id: 'company-1',
      name: 'Acme Technologies',
    } as unknown as Placement['companyId'],
    departmentId: 'dept-1',
    batchId: 'batch-1',
    offerDate: '2026-01-20T00:00:00.000Z',
    joiningDate: '2026-07-01T00:00:00.000Z',
    designation: 'Software Engineer I',
    location: 'Bengaluru',
    jobType: 'full_time',
    package: {
      currency: 'INR',
      ctc: 1_800_000,
      fixed: null,
      variable: null,
      stipendPerMonth: null,
      bondMonths: null,
    },
    isPrimaryOffer: true,
    academicYear: '2025-26',
    status: 'accepted',
    offerLetter: null,
    respondedAt: null,
    declineReason: null,
    revokeReason: null,
    joinedAt: null,
    notes: null,
    isVerified: false,
    history: [],
    ...overrides,
  };
}

function paginated<T>(items: T[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 8,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

beforeEach(() => {
  permissions = [...OFFICER];
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();

  apiGet.mockResolvedValue(ANALYTICS);
  apiGetPaginated.mockImplementation((url: string) => {
    if (url.startsWith('/companies'))
      return Promise.resolve(paginated([{ id: 'company-1', name: 'Acme Technologies' }]));
    if (url.startsWith('/departments'))
      return Promise.resolve(paginated([{ id: 'dept-1', name: 'Computer Science', code: 'CSE' }]));
    return Promise.resolve(paginated([placement()]));
  });
});

describe('Placement dashboard', () => {
  it('shows the headline figures', async () => {
    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByText('120');

    const statLabel = (text: string) =>
      screen.getAllByText(text).find((element) => element.tagName === 'P');

    for (const label of ['Offers made', 'Accepted', 'Joined', 'Placement rate']) {
      expect(statLabel(label)).toBeDefined();
    }

    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('formats every package figure', async () => {
    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByText('120');

    expect(screen.getAllByText('₹44.0 L').length).toBeGreaterThan(0);
    expect(screen.getByText('₹7.8 L')).toBeInTheDocument();
    expect(screen.getByText('₹9.0 L')).toBeInTheDocument();
    expect(screen.getByText('₹3.2 L')).toBeInTheDocument();
  });

  it('resolves department ids to names', async () => {
    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByText('120');
    expect(await screen.findByText('Computer Science')).toBeInTheDocument();
  });

  it('resolves recruiter ids to company names', async () => {
    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByText('120');

    expect(await screen.findByText('Top recruiters')).toBeInTheDocument();
    expect(screen.getByText('18 offers')).toBeInTheDocument();
  });

  it('lists the recent offers', async () => {
    renderWithQuery(<PlacementDashboardPage />);

    const link = await screen.findByRole('link', { name: 'Meera Iyer' });
    const row = link.closest('tr')!;

    expect(within(row).getByText('Acme Technologies')).toBeInTheDocument();
    expect(within(row).getByText('Software Engineer I')).toBeInTheDocument();
    expect(within(row).getByText('₹18.0 L')).toBeInTheDocument();
    expect(within(row).getByText('Accepted')).toBeInTheDocument();
  });

  it('filters by academic year', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByText('120');
    const filter = screen.getByLabelText('Filter by academic year');

    const option = within(filter).getAllByRole('option')[1] as HTMLOptionElement;
    await user.selectOptions(filter, option.value);

    await waitFor(() => {
      const urls = apiGet.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes(`academicYear=${option.value}`))).toBe(true);
    });
  });

  it('shows an empty table when nothing has been offered', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/placements') ? paginated([]) : paginated([])),
    );

    renderWithQuery(<PlacementDashboardPage />);
    expect(await screen.findByText(/no offers yet/i)).toBeInTheDocument();
  });

  it('shows a loading state before the figures arrive', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    apiGetPaginated.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithQuery(<PlacementDashboardPage />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state on the recent offers table', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-21'),
    );

    renderWithQuery(<PlacementDashboardPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByText(/req-21/)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /**
   * The case this dashboard exists to get right: a HOD holds
   * `placement:read_all` and neither `placement:report` nor `company:read`.
   */
  it('hides every reporting section from a caller without placement:report', async () => {
    permissions = [...HOD];

    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    expect(screen.queryByText('Top recruiters')).not.toBeInTheDocument();
    expect(screen.queryByText('Placement rate')).not.toBeInTheDocument();
    expect(screen.getByText(/figures are not available to you/i)).toBeInTheDocument();
  });

  it('never requests analytics without placement:report', async () => {
    permissions = [...HOD];

    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/placements/analytics'))).toBe(false);
  });

  it('never requests companies without company:read', async () => {
    permissions = [...HOD];

    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/companies'))).toBe(false);
  });

  it('never requests departments without department:read', async () => {
    permissions = ['placement:read_all'];

    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/departments'))).toBe(false);
  });

  it('hides the drives link from a caller without job:read', async () => {
    permissions = [...HOD];

    renderWithQuery(<PlacementDashboardPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    expect(screen.queryByRole('link', { name: /drives/i })).not.toBeInTheDocument();
  });

  it('still shows recent offers to a read-only caller', async () => {
    permissions = [...HOD];

    renderWithQuery(<PlacementDashboardPage />);

    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toBeInTheDocument();
  });

  it('redirects a caller without placement:read_all', async () => {
    permissions = ['placement:read'];

    renderWithQuery(<PlacementDashboardPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
