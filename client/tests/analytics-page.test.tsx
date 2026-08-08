import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();

/** college_admin: lists departments and batches, and reads the figures. */
const COLLEGE_ADMIN = [
  'analytics:read',
  'analytics:read_all',
  'department:read',
  'batch:read',
];

let permissions: string[] = [...COLLEGE_ADMIN];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/analytics',
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
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
  };
});

const { default: AnalyticsPage } = await import('@/app/college/analytics/page');

const DEPARTMENT_ANALYTICS = {
  department: { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
  totalStudents: 312,
  totalBatches: 8,
  totalFaculty: 24,
  placedStudents: 198,
  placementRate: 63.5,
  averageCgpa: 7.84,
};

const BATCH_ANALYTICS = {
  batch: { id: 'batch-1', name: '2022–26', code: 'CSE-A', currentSemester: 7 },
  totalStudents: 58,
  capacity: 60,
  utilisation: 96.7,
  placedStudents: 41,
  placementRate: 70.7,
  averageCgpa: 8.02,
};

function paginated<T>(items: T[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 100,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

const urls = () => apiGet.mock.calls.map((call) => String(call[0]));
const listUrls = () => apiGetPaginated.mock.calls.map((call) => String(call[0]));
const requested = (fragment: string) => urls().some((url) => url.includes(fragment));

beforeEach(() => {
  permissions = [...COLLEGE_ADMIN];
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (String(url).includes('/batches/')) return Promise.resolve(BATCH_ANALYTICS);
    return Promise.resolve(DEPARTMENT_ANALYTICS);
  });

  apiGetPaginated.mockImplementation((url: string) => {
    if (String(url).startsWith('/departments'))
      return Promise.resolve(
        paginated([
          { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
          { id: 'dept-2', name: 'Electronics', code: 'ECE' },
        ]),
      );
    if (String(url).startsWith('/batches'))
      return Promise.resolve(paginated([{ id: 'batch-1', name: '2022–26', code: 'CSE-A' }]));
    return Promise.resolve(paginated([]));
  });
});

describe('Analytics page', () => {
  it('lists every department the caller may see', async () => {
    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findByText('CSE')).toBeInTheDocument();
    expect(screen.getByText('ECE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Departments' })).toBeInTheDocument();
  });

  /** Every figure is the server's; none is derived here. */
  it('renders the figures the analytics endpoint returned', async () => {
    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findAllByText('312')).not.toHaveLength(0);
    expect(screen.getAllByText('63.5%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7.84').length).toBeGreaterThan(0);
    expect(screen.getAllByText('24').length).toBeGreaterThan(0);
  });

  it('asks the analytics endpoint once per department', async () => {
    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    await waitFor(() => {
      expect(requested('/departments/dept-1/analytics')).toBe(true);
      expect(requested('/departments/dept-2/analytics')).toBe(true);
    });
  });

  /**
   * Neither analytics endpoint accepts a query parameter, so no filter control
   * exists. The department picker chooses which batches to ask about — it is
   * not a filter on the analytics API.
   */
  it('renders no filter controls, because the endpoints accept none', async () => {
    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    expect(screen.queryByLabelText(/academic year/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  /* --------------------------------- batches -------------------------------- */

  it('asks for no batches until a department is chosen', async () => {
    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    expect(listUrls().some((url) => url.startsWith('/batches'))).toBe(false);

    // The same words are the select's placeholder option, so the empty state
    // is matched on being a paragraph.
    expect(
      screen
        .getAllByText(/choose a department/i)
        .find((element) => element.tagName === 'P'),
    ).toBeDefined();
  });

  it('loads the batches of the chosen department and their figures', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');
    await user.selectOptions(screen.getByLabelText('Choose a department'), 'dept-1');

    await waitFor(() =>
      expect(listUrls().some((url) => url.includes('departmentId=dept-1'))).toBe(true),
    );

    expect(await screen.findByText('CSE-A')).toBeInTheDocument();
    await waitFor(() => expect(requested('/batches/batch-1/analytics')).toBe(true));
    expect(screen.getByText('96.7%')).toBeInTheDocument();
  });

  /* ---------------------------------- states -------------------------------- */

  it('shows a loading state before the departments arrive', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<AnalyticsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no active departments', async () => {
    apiGetPaginated.mockResolvedValue(paginated([]));

    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findByText(/no active departments/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-64'),
    );

    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findByText(/could not load departments/i)).toBeInTheDocument();
    expect(screen.getByText(/req-64/)).toBeInTheDocument();
  });

  /**
   * `assertCanAccessDepartment` denies one row, not the page. The other rows
   * must still render their figures.
   */
  it('marks a department outside the caller’s scope without failing the table', async () => {
    apiGet.mockImplementation((url: string) => {
      if (String(url).includes('/departments/dept-2/analytics')) {
        return Promise.reject(new ApiError('FORBIDDEN', 'Not allowed.', 403, [], 'req-9'));
      }
      if (String(url).includes('/batches/')) return Promise.resolve(BATCH_ANALYTICS);
      return Promise.resolve(DEPARTMENT_ANALYTICS);
    });

    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findByText(/not visible to you/i)).toBeInTheDocument();

    // The permitted row still shows its figures.
    const row = screen.getByText('CSE').closest('tr')!;
    expect(within(row).getByText('312')).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('redirects a caller holding neither analytics permission', async () => {
    permissions = ['department:read', 'batch:read'];

    renderWithQuery(<AnalyticsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('CSE')).not.toBeInTheDocument();
  });

  /**
   * The figures need `analytics:read`. A caller who can list departments but
   * not read the figures must never fire the analytics endpoint.
   */
  it('never requests department analytics without analytics:read', async () => {
    permissions = ['analytics:read_all', 'department:read', 'batch:read'];

    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    expect(requested('/analytics')).toBe(false);
    // The department list itself is still permitted.
    expect(listUrls().some((url) => url.startsWith('/departments'))).toBe(true);
  });

  it('never requests batches without batch:read, and hides the section', async () => {
    const user = userEvent.setup();
    permissions = ['analytics:read', 'department:read'];

    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    expect(screen.queryByRole('heading', { name: 'Batches' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a department')).not.toBeInTheDocument();
    expect(listUrls().some((url) => url.startsWith('/batches'))).toBe(false);

    // Nothing to click, and nothing fired.
    void user;
  });

  it('never requests departments without department:read, and says why', async () => {
    permissions = ['analytics:read'];

    renderWithQuery(<AnalyticsPage />);

    expect(await screen.findByText(/analytics are not available to you/i)).toBeInTheDocument();

    expect(listUrls().some((url) => url.startsWith('/departments'))).toBe(false);
    expect(apiGet).not.toHaveBeenCalled();
  });

  /** No student-level record is fetched or shown — only aggregates. */
  it('never requests student records', async () => {
    renderWithQuery(<AnalyticsPage />);

    await screen.findByText('CSE');

    expect(listUrls().some((url) => url.startsWith('/students'))).toBe(false);
    expect(urls().some((url) => url.startsWith('/students'))).toBe(false);
  });
});
