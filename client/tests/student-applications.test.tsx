import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobApplication, Placement } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();

const STUDENT = ['job:read', 'application:read', 'application:withdraw', 'placement:read'];
let permissions: string[] = [...STUDENT];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/applications',
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

const { default: StudentApplicationsPage } = await import('@/app/student/applications/page');

/** A status badge is a span; the same word in the filter is an option. */
const statusBadge = (text: string) =>
  screen.queryAllByText(text).find((element) => element.tagName === 'SPAN');

function application(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 'application-1',
    jobPostingId: { id: 'job-1', title: 'Software Engineer' } as unknown as JobApplication['jobPostingId'],
    companyId: { id: 'company-1', name: 'Acme Technologies' } as unknown as JobApplication['companyId'],
    studentId: 'student-1',
    status: 'shortlisted',
    currentRound: 1,
    coverLetter: null,
    answers: [],
    resumeUrl: null,
    eligibilitySnapshot: {
      cgpa: 8.42,
      activeBacklogs: 0,
      totalBacklogs: 0,
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

function offer(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'offer-1',
    studentId: 'student-1',
    applicationId: 'application-2',
    jobPostingId: 'job-2',
    companyId: { id: 'company-2', name: 'Globex' } as unknown as Placement['companyId'],
    departmentId: 'dept-1',
    batchId: 'batch-1',
    offerDate: '2026-01-20T00:00:00.000Z',
    joiningDate: null,
    designation: 'Analyst',
    location: 'Pune',
    jobType: 'full_time',
    package: {
      currency: 'INR',
      ctc: 1_500_000,
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

beforeEach(() => {
  permissions = [...STUDENT];
  replace.mockReset();
  apiGet.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (url === '/placements/me') return Promise.resolve([]);
    return Promise.resolve([application()]);
  });
});

describe('Student applications page', () => {
  it('lists the student’s own applications', async () => {
    renderWithQuery(<StudentApplicationsPage />);

    expect(await screen.findByRole('link', { name: 'Software Engineer' })).toBeInTheDocument();
    expect(screen.getByText('Acme Technologies')).toBeInTheDocument();

    // Every status word is also a filter option, so the badge is matched on
    // being a span rather than an option.
    expect(statusBadge('Shortlisted')).toBeDefined();
  });

  it('never sends a student id — identity comes from the token', async () => {
    renderWithQuery(<StudentApplicationsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/applications/me');
    expect(urls.every((url) => !url.includes('studentId'))).toBe(true);
  });

  it('shows the offer alongside the application it belongs to', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/placements/me') return Promise.resolve([offer()]);
      return Promise.resolve([
        application(),
        application({ id: 'application-2', status: 'selected' }),
      ]);
    });

    renderWithQuery(<StudentApplicationsPage />);

    await screen.findByText(/you have been selected for 1 role/i);
    expect(screen.getByText(/₹15\.0 L · Offered/)).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    apiGet.mockImplementation((url: string) => {
      if (url === '/placements/me') return Promise.resolve([]);
      return Promise.resolve([
        application(),
        application({ id: 'application-2', status: 'rejected' }),
      ]);
    });

    renderWithQuery(<StudentApplicationsPage />);

    await waitFor(() => expect(statusBadge('Shortlisted')).toBeDefined());
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'rejected');

    await waitFor(() => expect(statusBadge('Shortlisted')).toBeUndefined());
    expect(statusBadge('Rejected')).toBeDefined();
  });

  it('shows an empty state pointing at the drives', async () => {
    apiGet.mockResolvedValue([]);
    renderWithQuery(<StudentApplicationsPage />);

    expect(await screen.findByText(/have not applied to anything yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse opportunities/i })).toBeInTheDocument();
  });

  it('shows a loading state first', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentApplicationsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-12'),
    );

    renderWithQuery(<StudentApplicationsPage />);

    expect(await screen.findByText(/could not load your applications/i)).toBeInTheDocument();
    expect(screen.getByText(/req-12/)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('redirects a caller without application:read', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentApplicationsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it('calls only self-service endpoints', async () => {
    renderWithQuery(<StudentApplicationsPage />);

    await screen.findByRole('link', { name: 'Software Engineer' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    for (const url of urls) {
      expect(url === '/applications/me' || url === '/placements/me').toBe(true);
    }
  });
});
