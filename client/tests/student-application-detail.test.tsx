import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobApplication, Placement } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

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
  usePathname: () => '/student/applications/application-1',
  useParams: () => ({ id: 'application-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions, { roleKey: 'student' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

const { default: StudentApplicationDetailPage } = await import(
  '@/app/student/applications/[id]/page'
);

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
      applicationCloseAt: '2026-02-05T00:00:00.000Z',
    } as unknown as JobApplication['jobPostingId'],
    companyId: {
      id: 'company-1',
      name: 'Acme Technologies',
      industry: 'Information Technology',
    } as unknown as JobApplication['companyId'],
    studentId: 'student-1',
    status: 'shortlisted',
    currentRound: 1,
    coverLetter: 'I have wanted to build compilers since second year.',
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
    history: [
      {
        from: null,
        to: 'applied',
        actedByRole: 'student',
        at: '2026-01-06T00:00:00.000Z',
        reason: null,
        roundOrder: null,
      },
      {
        from: 'applied',
        to: 'shortlisted',
        actedByRole: 'staff',
        at: '2026-01-10T00:00:00.000Z',
        reason: 'Strong aptitude score.',
        roundOrder: 1,
      },
    ],
    ...overrides,
  };
}

function offer(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'offer-1',
    studentId: 'student-1',
    applicationId: 'application-1',
    jobPostingId: 'job-1',
    companyId: { id: 'company-1', name: 'Acme Technologies' } as unknown as Placement['companyId'],
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
    status: 'offered',
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

function mockApi(app: JobApplication, offers: Placement[] = []) {
  apiGet.mockImplementation((url: string) => {
    if (url === '/placements/me') return Promise.resolve(offers);
    return Promise.resolve(app);
  });
}

beforeEach(() => {
  permissions = [...STUDENT];
  replace.mockReset();
  apiGet.mockReset();
  apiPost.mockReset();
  mockApi(application());
});

describe('Student application detail', () => {
  it('reads the application from the self-service path, with no student id', async () => {
    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/applications/me/application-1');
    expect(urls.every((url) => !url.includes('studentId'))).toBe(true);
  });

  it('shows the status, the round and the frozen record', async () => {
    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    // The status shows as a badge and again in the timeline, so the badge is
    // matched on being a span.
    expect(
      screen.getAllByText('Shortlisted').find((element) => element.tagName === 'SPAN'),
    ).toBeDefined();

    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('8.42')).toBeInTheDocument();
  });

  it('renders the timeline, naming who acted', async () => {
    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    const list = screen
      .getAllByRole('list')
      .find((node) => node.textContent?.includes('The placement office'))!;

    expect(within(list).getByText('Applied')).toBeInTheDocument();
    expect(within(list).getByText('Shortlisted')).toBeInTheDocument();
    expect(within(list).getByText(/You/)).toBeInTheDocument();
    expect(within(list).getByText('Strong aptitude score.')).toBeInTheDocument();
  });

  /* -------------------------------- withdraw -------------------------------- */

  it('withdraws with a reason', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(application({ status: 'withdrawn' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    await user.click(screen.getByRole('button', { name: /withdraw/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Accepted another offer.');
    await user.click(within(dialog).getByRole('button', { name: /^Withdraw$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/applications/me/application-1/withdraw');
    expect(body).toMatchObject({ reason: 'Accepted another offer.' });
  });

  /** The service refuses it — "decline the offer rather than withdrawing". */
  it('does not offer withdraw once selected', async () => {
    mockApi(application({ status: 'selected' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('button', { name: /^Withdraw$/ })).not.toBeInTheDocument();
  });

  it('does not offer withdraw from a terminal status', async () => {
    mockApi(application({ status: 'rejected', rejectionReason: 'Did not clear the round.' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('button', { name: /^Withdraw$/ })).not.toBeInTheDocument();
    expect(screen.getByText('Did not clear the round.')).toBeInTheDocument();
  });

  /* --------------------------------- offers --------------------------------- */

  it('shows the offer when the office has recorded one', async () => {
    mockApi(application({ status: 'selected' }), [offer()]);

    renderWithQuery(<StudentApplicationDetailPage />);

    expect(await screen.findByText('Your offer')).toBeInTheDocument();
    expect(screen.getByText('₹18.0 L')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer I')).toBeInTheDocument();
  });

  it('accepts an offer after confirming', async () => {
    const user = userEvent.setup();
    mockApi(application({ status: 'selected' }), [offer()]);
    apiPost.mockResolvedValue(offer({ status: 'accepted' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');
    await user.click(screen.getByRole('button', { name: /accept offer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /accept offer/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/placements/me/offer-1/accept');
  });

  it('declines an offer with a reason', async () => {
    const user = userEvent.setup();
    mockApi(application({ status: 'selected' }), [offer()]);
    apiPost.mockResolvedValue(offer({ status: 'declined' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');
    await user.click(screen.getByRole('button', { name: /decline offer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Taking a higher-paying role.');
    await user.click(within(dialog).getByRole('button', { name: /decline offer/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/placements/me/offer-1/decline');
    expect(body).toMatchObject({ reason: 'Taking a higher-paying role.' });
  });

  it('offers no answer once the offer is accepted', async () => {
    mockApi(application({ status: 'selected' }), [offer({ status: 'accepted' })]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');

    expect(screen.queryByRole('button', { name: /accept offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decline offer/i })).not.toBeInTheDocument();
    expect(screen.getByText(/you accepted this offer/i)).toBeInTheDocument();
  });

  it('offers no answer once the offer is declined', async () => {
    mockApi(application({ status: 'offer_declined' }), [
      offer({ status: 'declined', declineReason: 'Took another role.' }),
    ]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');

    expect(screen.queryByRole('button', { name: /accept offer/i })).not.toBeInTheDocument();
    expect(screen.getByText('Took another role.')).toBeInTheDocument();
  });

  it('explains a revoked offer without offering an answer', async () => {
    mockApi(application({ status: 'selected' }), [
      offer({ status: 'offer_revoked', revokeReason: 'The role was cancelled.' }),
    ]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');

    expect(screen.getByText(/company withdrew this offer/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept offer/i })).not.toBeInTheDocument();
  });

  it('reports a joined offer', async () => {
    mockApi(application({ status: 'selected' }), [offer({ status: 'joined' })]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');
    expect(screen.getByText(/you have joined/i)).toBeInTheDocument();
  });

  /**
   * Selected before the office recorded a written offer: the application
   * endpoint is the only decline path in that window.
   */
  it('declines on the application when no offer record exists yet', async () => {
    const user = userEvent.setup();
    mockApi(application({ status: 'selected' }), []);
    apiPost.mockResolvedValue(application({ status: 'offer_declined' }));

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.getByText(/has not recorded the written offer yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /decline offer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Going elsewhere.');
    await user.click(within(dialog).getByRole('button', { name: /decline offer/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe(
      '/applications/me/application-1/decline-offer',
    );
  });

  /* --------------------------------- states --------------------------------- */

  /** A 404 is the server refusing to confirm someone else's record exists. */
  it('treats a 404 as not found rather than revealing anything', async () => {
    apiGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Application not found.', 404, [], 'req-4'));

    renderWithQuery(<StudentApplicationDetailPage />);

    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.getByText(/it may have been removed, or it is not yours/i)).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<StudentApplicationDetailPage />);

    expect(screen.getByText(/loading application/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /** Nothing the office controls may appear on a student page. */
  it('never offers an office action', async () => {
    mockApi(application({ status: 'selected' }), [offer()]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');

    for (const label of [
      /shortlist/i,
      /^reject$/i,
      /^select$/i,
      /move to review/i,
      /move to in process/i,
      /revoke/i,
      /record joining/i,
      /record no-show/i,
      /^verify$/i,
    ]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('calls only self-service endpoints', async () => {
    mockApi(application({ status: 'selected' }), [offer()]);

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByText('Your offer');

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    for (const url of urls) {
      expect(url.startsWith('/applications/me') || url.startsWith('/placements/me')).toBe(true);
    }
  });

  it('redirects a caller without application:read', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentApplicationDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it('hides withdraw from a caller without application:withdraw', async () => {
    permissions = ['application:read', 'placement:read'];

    renderWithQuery(<StudentApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('button', { name: /^Withdraw$/ })).not.toBeInTheDocument();
  });
});
