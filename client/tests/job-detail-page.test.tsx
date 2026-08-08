import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Company, JobPosting, JobProfile } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const push = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

const OFFICE = [
  'job:read',
  'job:update',
  'job:delete',
  'job:publish',
  'job:close',
  'application:read_all',
];

let permissions: string[] = [...OFFICE];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, back: vi.fn() }),
  usePathname: () => '/college/placements/jobs/job-1',
  useParams: () => ({ id: 'job-1' }),
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

const { default: JobDetailPage } = await import('@/app/college/placements/jobs/[id]/page');

// jsdom does not implement the native dialog methods the dialogs drive.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const COMPANY = {
  id: 'company-1',
  name: 'Acme Technologies',
  industry: 'Information Technology',
  headquarters: 'Bengaluru',
  stats: { jobCount: 4, activeJobCount: 1, applicationCount: 120, offerCount: 9, lastDriveAt: null },
} as unknown as Company;

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'job-1',
    companyId: COMPANY,
    title: 'Software Engineer',
    description: 'Build things that matter.',
    jobType: 'full_time',
    workMode: 'hybrid',
    locations: ['Bengaluru', 'Pune'],
    openings: 12,
    compensation: {
      currency: 'INR',
      ctcMin: 1_200_000,
      ctcMax: 1_800_000,
      fixedComponent: 1_400_000,
      variableComponent: 200_000,
      stipendPerMonth: null,
      bondMonths: 12,
      bondAmount: 100_000,
    },
    eligibility: {
      departmentIds: [{ id: 'dept-1', name: 'Computer Science', code: 'CSE' }],
      batchIds: [],
      graduationYears: [2026],
      minCgpa: 7.5,
      maxActiveBacklogs: 0,
      maxTotalBacklogs: null,
      minTenthPercent: 60,
      minTwelfthPercent: null,
      minDiplomaPercent: null,
      minAttendancePercent: null,
      maxYearGap: null,
      genderRestriction: 'any',
      requiredSkills: ['Java', 'SQL'],
      qualifications: [],
      allowPlacedStudents: false,
      customCriteria: 'Must hold a valid passport.',
    },
    selectionRounds: [
      { order: 1, name: 'Aptitude', type: 'aptitude', mode: 'online', durationMinutes: 60, description: null },
      { order: 2, name: 'Tech round', type: 'technical_interview', mode: 'offline', durationMinutes: 45, description: 'Two problems.' },
    ],
    applicationOpenAt: '2026-01-05T00:00:00.000Z',
    applicationCloseAt: '2026-02-05T00:00:00.000Z',
    driveDate: '2026-02-20T00:00:00.000Z',
    status: 'draft',
    publishedAt: null,
    closedAt: null,
    closureReason: null,
    stats: {
      eligibleCount: 240,
      applicationCount: 0,
      shortlistedCount: 0,
      selectedCount: 0,
      eligibilityComputedAt: null,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function profile(overrides: Partial<JobProfile> = {}): JobProfile {
  const job = overrides.job ?? posting();

  return {
    job,
    company: COMPANY,
    counts: {
      eligible: job.stats.eligibleCount,
      applications: job.stats.applicationCount,
      shortlisted: job.stats.shortlistedCount,
      selected: job.stats.selectedCount,
      openings: job.openings,
    },
    window: {
      isOpen: false,
      opensAt: job.applicationOpenAt,
      closesAt: job.applicationCloseAt,
    },
    // The server's own answer — the page never recomputes the state machine.
    allowedTransitions: ['published', 'cancelled'],
    ...overrides,
  };
}

beforeEach(() => {
  permissions = [...OFFICE];
  replace.mockReset();
  push.mockReset();
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue(profile());
});

describe('Job posting detail page', () => {
  it('shows the role, its counts and its rounds in order', async () => {
    renderWithQuery(<JobDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Software Engineer' })).toBeInTheDocument();
    expect(screen.getByText('Build things that matter.')).toBeInTheDocument();
    expect(screen.getByText('Bengaluru, Pune')).toBeInTheDocument();
    expect(screen.getByText('₹12.0 L – ₹18.0 L')).toBeInTheDocument();

    expect(screen.getByText('Aptitude')).toBeInTheDocument();
    expect(screen.getByText('Tech round')).toBeInTheDocument();
    expect(screen.getByText(/Two problems\./)).toBeInTheDocument();
  });

  it('renders only the eligibility criteria that were set', async () => {
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    expect(screen.getByText('7.5 and above')).toBeInTheDocument();
    expect(screen.getByText('None outstanding')).toBeInTheDocument();
    expect(screen.getByText('Java, SQL')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();

    // Unset criteria are absent rather than shown as "any".
    expect(screen.queryByText('Class XII')).not.toBeInTheDocument();
    expect(screen.queryByText('Attendance')).not.toBeInTheDocument();
  });

  it('marks the free-text criteria as never checked automatically', async () => {
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    expect(screen.getByText('Must hold a valid passport.')).toBeInTheDocument();
    expect(screen.getByText(/never checked automatically/i)).toBeInTheDocument();
  });

  /** The server owns the state machine; the page renders what it was told. */
  it('offers exactly the transitions the server allowed', async () => {
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel drive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close applications' })).not.toBeInTheDocument();
  });

  it('confirms before publishing and posts the transition', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(posting({ status: 'published' }));

    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    // The header button carries the same label, so the confirm is scoped.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Publish\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/jobs/job-1/transition');
    expect(body).toMatchObject({ to: 'published' });
  });

  it('asks for a reason before cancelling', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    await user.click(screen.getByRole('button', { name: 'Cancel drive' }));

    expect(await screen.findByLabelText(/reason/i)).toBeInTheDocument();
  });

  it('blocks deletion once students have applied', async () => {
    apiGet.mockResolvedValue(profile({ job: posting({ stats: { ...posting().stats, applicationCount: 14 } }) }));

    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    expect(screen.getByText(/14 student\(s\) have applied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete posting/i })).toBeDisabled();
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(
      new ApiError('NOT_FOUND', 'Job posting not found.', 404, [], 'req-42'),
    );

    renderWithQuery(<JobDetailPage />);

    expect(await screen.findByText(/could not load this posting/i)).toBeInTheDocument();
    expect(screen.getByText(/req-42/)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('offers no transitions to a caller without job:publish', async () => {
    permissions = ['job:read', 'job:update'];
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel drive' })).not.toBeInTheDocument();
  });

  it('hides the edit action from a caller without job:update', async () => {
    permissions = ['job:read'];
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });

  /**
   * Eligible students names classmates with their CGPA and backlogs, so it sits
   * behind `application:read_all` rather than `job:read`.
   */
  it('hides the eligible-students link from a caller without application:read_all', async () => {
    permissions = ['job:read', 'job:update', 'job:publish'];
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('link', { name: /eligible students/i })).not.toBeInTheDocument();
  });

  it('offers no delete panel to a caller without job:delete', async () => {
    permissions = ['job:read', 'job:update'];
    renderWithQuery(<JobDetailPage />);

    await screen.findByRole('heading', { name: 'Software Engineer' });
    expect(screen.queryByRole('button', { name: /delete posting/i })).not.toBeInTheDocument();
  });

  it('redirects a caller without job:read away from the page', async () => {
    permissions = ['course:read'];
    renderWithQuery(<JobDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
