import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobApplication } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

const OFFICE = [
  'application:read_all',
  'application:shortlist',
  'application:reject',
  'placement:create',
  'student:read_all',
];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/applications/application-1',
  useParams: () => ({ id: 'application-1' }),
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

const { default: ApplicationDetailPage } = await import(
  '@/app/college/placements/applications/[id]/page'
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
    status: 'shortlisted',
    currentRound: 1,
    coverLetter: 'I have wanted to build compilers since second year.',
    answers: [{ question: 'Preferred location?', answer: 'Bengaluru' }],
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

beforeEach(() => {
  permissions = [...OFFICE];
  replace.mockReset();
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue(application());
});

describe('Application detail page', () => {
  it('shows the candidate, the role and the frozen academics', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument();
    expect(screen.getByText('CS22B001')).toBeInTheDocument();
    expect(screen.getByText('meera@example.edu')).toBeInTheDocument();
    expect(screen.getByText('8.42')).toBeInTheDocument();
    expect(screen.getByText(/frozen when the application was made/i)).toBeInTheDocument();
  });

  it('shows what the candidate submitted', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText(/wanted to build compilers/i)).toBeInTheDocument();
    expect(screen.getByText('Preferred location?')).toBeInTheDocument();
    expect(screen.getByText('Bengaluru')).toBeInTheDocument();
  });

  it('renders the history the server recorded, with who acted', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    // Breadcrumbs are a list too, so the timeline is picked by its content.
    const list = screen
      .getAllByRole('list')
      .find((node) => node.textContent?.includes('By the student'))!;

    expect(within(list).getByText('Applied')).toBeInTheDocument();
    expect(within(list).getByText('Shortlisted')).toBeInTheDocument();

    // The date and actor share one line, so these are substring matches.
    expect(within(list).getByText(/By the student/)).toBeInTheDocument();
    expect(within(list).getByText(/By the placement office/)).toBeInTheDocument();
    expect(within(list).getByText('Strong aptitude score.')).toBeInTheDocument();
  });

  it('links back to the job posting and the company', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('link', { name: 'Software Engineer' })).toHaveAttribute(
      'href',
      '/college/placements/jobs/job-1',
    );
    expect(screen.getByRole('link', { name: 'Acme Technologies' })).toHaveAttribute(
      'href',
      '/college/placements/companies/company-1',
    );
  });

  /* ------------------------------- transitions ------------------------------ */

  it('offers only the office actions legal from the current status', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    // shortlisted → in_process, selected, rejected
    expect(screen.getByRole('button', { name: /move to in process/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Select$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reject$/ })).toBeInTheDocument();

    // Not legal from here.
    expect(screen.queryByRole('button', { name: /move to review/i })).not.toBeInTheDocument();
  });

  /** Withdrawing and declining belong to the student; `advance()` refuses them. */
  it('never offers the student-owned actions', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decline offer/i })).not.toBeInTheDocument();
  });

  it('offers nothing from a terminal status', async () => {
    apiGet.mockResolvedValue(
      application({ status: 'rejected', rejectionReason: 'Did not clear the aptitude round.' }),
    );

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Select$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument();
    expect(screen.getByText('Did not clear the aptitude round.')).toBeInTheDocument();
  });

  it('advances the application through the advance endpoint', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(application({ status: 'in_process' }));

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /move to in process/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /move to in process/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/applications/application-1/advance');
    expect(body).toMatchObject({ to: 'in_process' });
  });

  it('requires a reason to reject and posts it', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(application({ status: 'rejected' }));

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Reject$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Did not clear the aptitude round.');
    await user.click(within(dialog).getByRole('button', { name: /^Reject$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/applications/application-1/reject');
    expect(body).toMatchObject({ reason: 'Did not clear the aptitude round.' });
  });

  it('selects through the select endpoint, not advance', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(application({ status: 'selected' }));

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Select$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Select$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/applications/application-1/select');
  });

  it('says that selecting does not itself create the offer, and offers the next step', async () => {
    apiGet.mockResolvedValue(application({ status: 'selected', selectedAt: '2026-01-20T00:00:00.000Z' }));

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText(/does not create the offer/i)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /record the offer/i })).toHaveAttribute(
      'href',
      '/college/placements/offers/new?applicationId=application-1',
    );
  });

  /** Recording an offer needs `placement:create`, not the selection permission. */
  it('hides the record-offer link from a caller without placement:create', async () => {
    permissions = ['application:read_all', 'application:shortlist', 'application:reject'];
    apiGet.mockResolvedValue(application({ status: 'selected' }));

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.queryByRole('link', { name: /record the offer/i })).not.toBeInTheDocument();
  });

  /* -------------------------------- redaction -------------------------------- */

  /**
   * An unpopulated user record means "not visible to you", which is a different
   * statement from "this student has no email".
   */
  it('distinguishes withheld contact details from absent ones', async () => {
    apiGet.mockResolvedValue(
      application({
        studentId: { id: 'student-1', rollNumber: 'CS22B001', userId: 'unpopulated-id' },
      }),
    );

    renderWithQuery(<ApplicationDetailPage />);

    expect(await screen.findByText(/contact details are not visible to you/i)).toBeInTheDocument();
    expect(screen.queryByText(/no contact information/i)).not.toBeInTheDocument();
  });

  /* --------------------------------- states --------------------------------- */

  it('reports a withdrawal as the student’s own action', async () => {
    apiGet.mockResolvedValue(
      application({ status: 'withdrawn', withdrawalReason: 'Accepted another offer.' }),
    );

    renderWithQuery(<ApplicationDetailPage />);

    expect(await screen.findByText(/withdrawn by the student/i)).toBeInTheDocument();
    expect(screen.getByText('Accepted another offer.')).toBeInTheDocument();
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Application not found.', 404, [], 'req-8'));

    renderWithQuery(<ApplicationDetailPage />);

    expect(await screen.findByText(/could not load this application/i)).toBeInTheDocument();
    expect(screen.getByText(/req-8/)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /**
   * The split that matters: selecting is what creates an offer, so it needs
   * `placement:create` rather than the shortlisting permission.
   */
  it('hides Select from a caller who may shortlist but not create placements', async () => {
    permissions = ['application:read_all', 'application:shortlist', 'application:reject'];

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('button', { name: /move to in process/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Select$/ })).not.toBeInTheDocument();
  });

  it('hides Reject from a caller without application:reject', async () => {
    permissions = ['application:read_all', 'application:shortlist'];

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument();
  });

  /** HOD: reads everything, drives nothing. */
  it('offers a read-only caller no actions and says why', async () => {
    permissions = ['application:read_all', 'student:read'];

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Select$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access to this application/i)).toBeInTheDocument();
  });

  it('hides the student record link from a caller who cannot read students', async () => {
    permissions = ['application:read_all', 'application:shortlist'];

    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.queryByRole('link', { name: /open student record/i })).not.toBeInTheDocument();
  });

  it('offers the student record link to a caller who may read students', async () => {
    renderWithQuery(<ApplicationDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByRole('link', { name: /open student record/i })).toHaveAttribute(
      'href',
      '/college/students/student-1',
    );
  });

  it('redirects a caller without application:read_all', async () => {
    permissions = ['application:read'];

    renderWithQuery(<ApplicationDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
