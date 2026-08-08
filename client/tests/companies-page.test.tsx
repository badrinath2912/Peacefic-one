import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Company, CompanyAnalytics } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();

const OFFICE = [
  'company:read',
  'company:create',
  'company:update',
  'company:verify',
  'company:blacklist',
];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/companies',
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

const { default: CompaniesPage } = await import('@/app/college/placements/companies/page');

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    name: 'Acme Technologies',
    legalName: 'Acme Technologies Private Limited',
    logoUrl: null,
    logoKey: null,
    website: 'https://acme.example.com',
    industry: 'Information Technology',
    companyType: 'product',
    sizeRange: '1001-5000',
    headquarters: 'Bengaluru',
    locations: ['Bengaluru'],
    description: null,
    email: 'careers@acme.example.com',
    phone: '+919876500001',
    contacts: [],
    isVerified: true,
    verifiedAt: '2026-01-10T00:00:00.000Z',
    verificationNote: null,
    status: 'active',
    blacklistReason: null,
    blacklistedAt: null,
    stats: {
      jobCount: 4,
      activeJobCount: 1,
      applicationCount: 120,
      offerCount: 9,
      lastDriveAt: '2026-02-01T00:00:00.000Z',
    },
    createdAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
}

const ANALYTICS: CompanyAnalytics = {
  total: 1,
  active: 1,
  blacklisted: 0,
  inactive: 0,
  verified: 1,
  industries: ['Information Technology', 'Finance'],
  byStatus: { active: 1 },
};

function paginated(items: Company[]) {
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
  apiGetPaginated.mockResolvedValue(paginated([company()]));
});

describe('Companies page', () => {
  it('lists companies with their drive and offer counts', async () => {
    renderWithQuery(<CompaniesPage />);

    expect(await screen.findByText('Acme Technologies')).toBeInTheDocument();

    // Scoped to the row: the industry also appears as a filter option.
    const row = screen.getByText('Acme Technologies').closest('tr')!;
    expect(within(row).getByText('Information Technology')).toBeInTheDocument();
    expect(within(row).getByText('1001-5000')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('9')).toBeInTheDocument();
  });

  it('calls the companies endpoint with server-side list params', async () => {
    renderWithQuery(<CompaniesPage />);

    await waitFor(() => expect(apiGetPaginated).toHaveBeenCalled());

    const url = String(apiGetPaginated.mock.calls[0]?.[0]);
    expect(url).toMatch(/^\/companies\?/);
    // Pagination and sorting are the server's job, never the client's.
    expect(url).toContain('page=1');
    expect(url).toContain('sort=name');
  });

  it('shows the analytics tiles', async () => {
    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Acme Technologies');

    /**
     * Every stat label is also a filter option or the page heading, so the
     * tiles are matched on the element type: a stat label is a paragraph, a
     * filter entry is an `option`.
     */
    const statLabel = (text: string) =>
      screen.getAllByText(text).find((element) => element.tagName === 'P');

    for (const label of ['Companies', 'Active', 'Verified', 'Blacklisted']) {
      expect(statLabel(label)).toBeDefined();
    }

    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
  });

  it('marks a verified company and a blacklisted one distinctly', async () => {
    apiGetPaginated.mockResolvedValue(
      paginated([
        company(),
        company({
          id: 'company-2',
          name: 'Bad Co',
          isVerified: false,
          status: 'blacklisted',
        }),
      ]),
    );

    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Bad Co');

    const badRow = screen.getByText('Bad Co').closest('tr')!;
    expect(within(badRow).getByText('Blacklisted')).toBeInTheDocument();
    expect(within(badRow).getByText('No')).toBeInTheDocument();

    const goodRow = screen.getByText('Acme Technologies').closest('tr')!;
    expect(within(goodRow).getByLabelText('Verified')).toBeInTheDocument();
  });

  it('populates the industry filter from analytics', async () => {
    renderWithQuery(<CompaniesPage />);

    // The select renders immediately; its options arrive with the analytics.
    const filter = await screen.findByLabelText('Filter by industry');
    await waitFor(() =>
      expect(within(filter).getByRole('option', { name: 'Finance' })).toBeInTheDocument(),
    );
  });

  it('refetches with a filter applied and resets to page one', async () => {
    const user = userEvent.setup();
    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Acme Technologies');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'blacklisted');

    await waitFor(() => {
      const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('status=blacklisted'))).toBe(true);
    });

    expect(screen.getByText(/1 filter applied/i)).toBeInTheDocument();
  });

  it('shows an empty state with a create action', async () => {
    apiGetPaginated.mockResolvedValue(paginated([]));
    renderWithQuery(<CompaniesPage />);

    expect(await screen.findByText(/no companies yet/i)).toBeInTheDocument();

    // The header carries the same action, so both are expected — the point is
    // that the empty state offers a way forward rather than a dead end.
    expect(screen.getAllByRole('link', { name: /add company/i })).toHaveLength(2);
  });

  it('shows a loading state before the rows arrive', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<CompaniesPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong on our side.', 500, [], 'req-77'),
    );

    renderWithQuery(<CompaniesPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByText(/req-77/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('hides the create action from a caller without company:create', async () => {
    permissions = ['company:read'];
    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Acme Technologies');
    expect(screen.queryByRole('link', { name: /add company/i })).not.toBeInTheDocument();
  });

  it('offers no bulk delete to a caller without company:update', async () => {
    const user = userEvent.setup();
    permissions = ['company:read'];
    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Acme Technologies');
    await user.click(screen.getByLabelText(/^Select row/));

    // The selection bar appears, but without the destructive action.
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('offers bulk delete to a caller who may manage companies', async () => {
    const user = userEvent.setup();
    renderWithQuery(<CompaniesPage />);

    await screen.findByText('Acme Technologies');
    await user.click(screen.getByLabelText(/^Select row/));

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  /** The guard decides what renders; the server independently returns 403. */
  it('redirects a caller without company:read away from the page', async () => {
    permissions = ['course:read'];
    renderWithQuery(<CompaniesPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('Acme Technologies')).not.toBeInTheDocument();
  });
});
