import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Placement } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

const OFFICE = [
  'placement:read_all',
  'placement:create',
  'placement:update',
  'placement:verify',
  'placement:report',
  'company:read',
];

/** HOD: reads placements, drives none of them. */
const HOD = ['placement:read_all', 'department:read'];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/offers/offer-1',
  useParams: () => ({ id: 'offer-1' }),
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
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

const { default: OfferDetailPage } = await import('@/app/college/placements/offers/[id]/page');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function offer(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'offer-1',
    studentId: {
      id: 'student-1',
      rollNumber: 'CS22B001',
      userId: { firstName: 'Meera', lastName: 'Iyer', email: 'meera@example.edu' },
    },
    applicationId: { id: 'application-1', status: 'selected', appliedAt: '2026-01-06T00:00:00.000Z' },
    jobPostingId: { id: 'job-1', title: 'Software Engineer' } as unknown as Placement['jobPostingId'],
    companyId: {
      id: 'company-1',
      name: 'Acme Technologies',
      industry: 'Information Technology',
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
      fixed: 1_500_000,
      variable: 300_000,
      stipendPerMonth: null,
      bondMonths: 12,
    },
    isPrimaryOffer: true,
    academicYear: '2025-26',
    status: 'offered',
    offerLetter: null,
    respondedAt: null,
    declineReason: null,
    revokeReason: null,
    joinedAt: null,
    notes: null,
    isVerified: false,
    history: [
      {
        from: null,
        to: 'offered',
        actedByRole: 'staff',
        at: '2026-01-20T00:00:00.000Z',
        reason: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  permissions = [...OFFICE];
  replace.mockReset();
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue(offer());
});

describe('Offer detail page', () => {
  it('shows the candidate, the package and the terms', async () => {
    renderWithQuery(<OfferDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument();
    expect(screen.getByText('₹18.0 L')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer I')).toBeInTheDocument();
    expect(screen.getByText('Bengaluru')).toBeInTheDocument();

    // The academic year shows twice: as a badge and in the offer details.
    expect(screen.getAllByText('2025-26').length).toBeGreaterThan(0);
  });

  it('formats each package component', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText('₹15.0 L')).toBeInTheDocument();
    expect(screen.getByText('₹3.0 L')).toBeInTheDocument();
    expect(screen.getByText('12 months')).toBeInTheDocument();
  });

  it('marks a primary and unverified offer', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText('Primary offer')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('renders the history with who acted', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    const list = screen
      .getAllByRole('list')
      .find((node) => node.textContent?.includes('By the placement office'))!;

    expect(within(list).getByText('Offered')).toBeInTheDocument();
  });

  it('links to the company and the drive', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('link', { name: 'Acme Technologies' })).toHaveAttribute(
      'href',
      '/college/placements/companies/company-1',
    );
    expect(screen.getByRole('link', { name: 'Software Engineer' })).toHaveAttribute(
      'href',
      '/college/placements/jobs/job-1',
    );
  });

  /* ------------------------------ offer letter ------------------------------ */

  /**
   * `Placement.offerLetter` is readable but nothing writes it — no create or
   * update path accepts one. The page must not imply otherwise.
   */
  it('shows no upload control when there is no offer letter', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByText(/no offer letter on this record/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
  });

  it('links to the letter when the record carries one', async () => {
    apiGet.mockResolvedValue(
      offer({ offerLetter: { url: 'https://files.example.edu/o.pdf', fileName: 'offer.pdf' } }),
    );

    renderWithQuery(<OfferDetailPage />);

    expect(await screen.findByRole('link', { name: /offer\.pdf/ })).toHaveAttribute(
      'href',
      'https://files.example.edu/o.pdf',
    );
  });

  /* ------------------------------- transitions ------------------------------ */

  /**
   * Accepting and declining belong to the student. The office holds
   * `placement:update` and still must never see those buttons.
   */
  it('never offers the office accept or decline', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Accept$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot answer on their behalf/i)).toBeInTheDocument();
  });

  it('offers only revoke while the offer is open', async () => {
    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('button', { name: /revoke offer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record joining/i })).not.toBeInTheDocument();
  });

  it('offers joining and no-show once the student has accepted', async () => {
    apiGet.mockResolvedValue(offer({ status: 'accepted', respondedAt: '2026-01-25T00:00:00.000Z' }));

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('button', { name: /record joining/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record no-show/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke offer/i })).toBeInTheDocument();
  });

  it('offers nothing from a terminal status', async () => {
    apiGet.mockResolvedValue(offer({ status: 'joined', joinedAt: '2026-07-01T00:00:00.000Z' }));

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /revoke offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record joining/i })).not.toBeInTheDocument();
  });

  it('requires a reason to revoke and posts it', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(offer({ status: 'offer_revoked' }));

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /revoke offer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'The company cancelled the role.');
    await user.click(within(dialog).getByRole('button', { name: /revoke offer/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/placements/offer-1/revoke');
    expect(body).toMatchObject({ reason: 'The company cancelled the role.' });
  });

  it('records joining without asking for a reason', async () => {
    const user = userEvent.setup();
    apiGet.mockResolvedValue(offer({ status: 'accepted' }));
    apiPost.mockResolvedValue(offer({ status: 'joined' }));

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /record joining/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/reason/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /record joining/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/placements/offer-1/joined');
  });

  it('verifies the placement', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(offer({ isVerified: true }));

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Verify$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Verify$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/placements/offer-1/verify');
    expect(body).toMatchObject({ isVerified: true });
  });

  /* --------------------------------- states --------------------------------- */

  it('reports a declined offer as the student’s decision', async () => {
    apiGet.mockResolvedValue(
      offer({ status: 'declined', declineReason: 'Accepted a better offer.' }),
    );

    renderWithQuery(<OfferDetailPage />);

    expect(await screen.findByText(/the student declined/i)).toBeInTheDocument();
    expect(screen.getByText('Accepted a better offer.')).toBeInTheDocument();
  });

  it('distinguishes withheld contact details from absent ones', async () => {
    apiGet.mockResolvedValue(
      offer({ studentId: { id: 'student-1', rollNumber: 'CS22B001', userId: 'unpopulated' } }),
    );

    renderWithQuery(<OfferDetailPage />);

    expect(await screen.findByText(/contact details are not visible to you/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Offer not found.', 404, [], 'req-3'));

    renderWithQuery(<OfferDetailPage />);

    expect(await screen.findByText(/could not load this offer/i)).toBeInTheDocument();
    expect(screen.getByText(/req-3/)).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<OfferDetailPage />);

    expect(screen.getByText(/loading offer/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('offers a read-only caller no actions and says why', async () => {
    permissions = [...HOD];

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /revoke offer/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access to this offer/i)).toBeInTheDocument();
  });

  it('hides Verify from a caller without placement:verify', async () => {
    permissions = ['placement:read_all', 'placement:update'];

    renderWithQuery(<OfferDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.queryByRole('button', { name: /^Verify$/ })).not.toBeInTheDocument();
  });

  /** A student's `placement:read` must not open the office record. */
  it('redirects a caller without placement:read_all', async () => {
    permissions = ['placement:read', 'placement:respond'];

    renderWithQuery(<OfferDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
