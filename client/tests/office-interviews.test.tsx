import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterviewAnalytics } from '@/api/placement-queries';
import { ApiError } from '@/lib/api-client';

import { interviewFixture } from './helpers/interview';
import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPost = vi.fn();

/** placement_officer and college_admin hold the office set. */
const OFFICE = [
  'interview:read_all',
  'interview:schedule',
  'interview:update',
  'interview:record_result',
  'company:read',
  'job:read',
  'application:read_all',
];

/** HOD holds the read permission and nothing else. */
const HOD = ['interview:read_all', 'department:read'];

let permissions: string[] = [...OFFICE];
let currentParams: Record<string, string> = { id: 'interview-1' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/placements/interviews',
  useParams: () => currentParams,
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

const { default: InterviewsPage } = await import('@/app/college/placements/interviews/page');
const { default: InterviewDetailPage } = await import(
  '@/app/college/placements/interviews/[id]/page'
);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const ANALYTICS: InterviewAnalytics = {
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
  byStatus: { scheduled: 7 },
  byResult: { pending: 8 },
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
  currentParams = { id: 'interview-1' };
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();
  apiPost.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (url.includes('/interviews/analytics')) return Promise.resolve(ANALYTICS);
    return Promise.resolve(interviewFixture());
  });

  apiGetPaginated.mockImplementation((url: string) => {
    if (url.startsWith('/companies'))
      return Promise.resolve(paginated([{ id: 'company-1', name: 'Acme Technologies' }]));
    if (url.startsWith('/jobs'))
      return Promise.resolve(paginated([{ id: 'job-1', title: 'Software Engineer' }]));
    return Promise.resolve(paginated([interviewFixture()]));
  });
});

describe('Office interviews list', () => {
  it('lists interviews with the round, drive and slot', async () => {
    renderWithQuery(<InterviewsPage />);

    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toBeInTheDocument();

    const row = screen.getByRole('link', { name: 'Meera Iyer' }).closest('tr')!;
    expect(within(row).getByText('Technical Interview')).toBeInTheDocument();
    expect(within(row).getByText('Round 2')).toBeInTheDocument();
    expect(within(row).getByText('Software Engineer')).toBeInTheDocument();
    expect(within(row).getByText('Awaiting result')).toBeInTheDocument();
  });

  it('calls the interviews endpoint with server-side list params', async () => {
    renderWithQuery(<InterviewsPage />);

    await waitFor(() =>
      expect(
        apiGetPaginated.mock.calls.some((call) => String(call[0]).startsWith('/interviews?')),
      ).toBe(true),
    );

    const url = String(
      apiGetPaginated.mock.calls.find((call) => String(call[0]).startsWith('/interviews?'))?.[0],
    );

    expect(url).toContain('page=1');
    expect(url).toContain('sort=-scheduledAt');
  });

  it('shows the analytics tiles', async () => {
    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const statLabel = (text: string) =>
      screen.getAllByText(text).find((element) => element.tagName === 'P');

    for (const label of ['Interviews', 'Upcoming', 'Awaiting result', 'Cleared']) {
      expect(statLabel(label)).toBeDefined();
    }

    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'completed');

    await waitFor(() => {
      const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
      expect(
        urls.some((url) => url.startsWith('/interviews?') && url.includes('status=completed')),
      ).toBe(true);
    });
  });

  /**
   * `interviewListQuerySchema` carries no `scheduledAt`, and `validate` strips
   * unknown query keys — so a date filter would look like it worked and change
   * nothing. It is deliberately absent.
   */
  it('offers no date filter, because the query schema does not accept one', async () => {
    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    expect(screen.queryByLabelText(/filter by date/i)).not.toBeInTheDocument();
  });

  it('shows empty, loading and error states', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/interviews') ? paginated([]) : paginated([])),
    );

    const { unmount } = renderWithQuery(<InterviewsPage />);
    expect(await screen.findByText(/no interviews scheduled/i)).toBeInTheDocument();
    unmount();

    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const loading = renderWithQuery(<InterviewsPage />);
    expect(loading.container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    loading.unmount();

    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-77'),
    );
    renderWithQuery(<InterviewsPage />);
    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('hides the schedule action from a caller without interview:schedule', async () => {
    permissions = [...HOD];
    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });
    expect(screen.queryByRole('link', { name: /^Schedule$/ })).not.toBeInTheDocument();
  });

  it('redirects a faculty member, who holds no interview permission', async () => {
    permissions = ['student:read', 'attendance:mark'];
    renderWithQuery(<InterviewsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Meera Iyer' })).not.toBeInTheDocument();
  });

  /**
   * `interview:read_all` opens the page; it does not imply `job:read`. A HOD
   * holds the first and not the second, so the drives lookup must never leave
   * the browser — handling a 403 is not enough.
   */
  it('never requests drives for a caller who cannot read them', async () => {
    permissions = [...HOD];

    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/jobs'))).toBe(false);
    expect(urls.some((url) => url.startsWith('/companies'))).toBe(false);

    // The interviews themselves are still fetched — the page works for HOD.
    expect(urls.some((url) => url.startsWith('/interviews?'))).toBe(true);
  });

  it('hides the filters a read-only caller cannot populate', async () => {
    permissions = [...HOD];

    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    expect(screen.queryByLabelText('Filter by drive')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by company')).not.toBeInTheDocument();

    // These need no lookup at all.
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by mode')).toBeInTheDocument();
  });

  /** The gate must not cost an authorised caller anything. */
  it('still requests drives and companies for a placement officer', async () => {
    renderWithQuery(<InterviewsPage />);

    await screen.findByRole('link', { name: 'Meera Iyer' });

    const urls = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/jobs'))).toBe(true);
    expect(urls.some((url) => url.startsWith('/companies'))).toBe(true);

    expect(screen.getByLabelText('Filter by drive')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by company')).toBeInTheDocument();
  });

  it('never requests the list or analytics without interview:read_all', async () => {
    permissions = ['interview:read'];
    renderWithQuery(<InterviewsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    const listed = apiGetPaginated.mock.calls.map((call) => String(call[0]));
    expect(listed.some((url) => url.startsWith('/interviews?'))).toBe(false);

    const fetched = apiGet.mock.calls.map((call) => String(call[0]));
    expect(fetched.some((url) => url.includes('/interviews/analytics'))).toBe(false);
  });
});

describe('Office interview detail', () => {
  it('shows the slot, the panel and the candidate', async () => {
    renderWithQuery(<InterviewDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument();
    expect(screen.getByText('45 minutes')).toBeInTheDocument();
    expect(screen.getByText('Priya Menon')).toBeInTheDocument();
    expect(screen.getByText('CS22B001')).toBeInTheDocument();
    expect(screen.getByText('Have your ID ready.')).toBeInTheDocument();
  });

  it('surfaces a candidate reschedule request as a request, not a change', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({
        rescheduleRequest: {
          reason: 'I have a university examination that morning.',
          preferredSlots: ['2026-02-12T09:30:00.000Z'],
          requestedAt: '2026-02-05T09:00:00.000Z',
        },
      }),
    );

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText(/asked to move this interview/i)).toBeInTheDocument();
    expect(screen.getByText(/still your decision/i)).toBeInTheDocument();
  });

  /* ------------------------------- transitions ------------------------------ */

  it('offers only the transitions legal from the current status', async () => {
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    // scheduled → confirmed (student), rescheduled, in_progress, cancelled, no_show
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as no-show/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Move$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();

    // Not legal from `scheduled`.
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument();
  });

  /** Confirming belongs to the candidate; the office is refused it. */
  it('never offers the office the confirm action', async () => {
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.queryByRole('button', { name: /^Confirm$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm attendance/i })).not.toBeInTheDocument();
  });

  it('offers nothing from a terminal status', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({ status: 'cancelled', cancellationReason: 'The drive was postponed.' }),
    );

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Move$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start$/ })).not.toBeInTheDocument();
    expect(screen.getByText('The drive was postponed.')).toBeInTheDocument();
  });

  it('cancels with a reason', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(interviewFixture({ status: 'cancelled' }));

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/i), 'The company postponed the drive.');
    await user.click(within(dialog).getByRole('button', { name: /cancel interview/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/interviews/interview-1/cancel');
    expect(body).toMatchObject({ reason: 'The company postponed the drive.' });
  });

  it('moves the interview with a new time and a reason', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(interviewFixture({ status: 'rescheduled' }));

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Move$/ }));

    const dialog = await screen.findByRole('dialog');
    const when = within(dialog).getByLabelText(/new date and time/i);
    await user.type(when, '2026-02-12T11:00');
    await user.type(within(dialog).getByLabelText(/reason/i), 'The panel is unavailable.');
    await user.click(within(dialog).getByRole('button', { name: /move interview/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/interviews/interview-1/reschedule');
  });

  it('drives the generic transition endpoint for starting a round', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(interviewFixture({ status: 'in_progress' }));

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /^Start$/ }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Start$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/interviews/interview-1/transition');
    expect(body).toMatchObject({ to: 'in_progress' });
  });

  /* ---------------------------------- result --------------------------------- */

  /**
   * The load-bearing behaviour: a result is recorded, the application is not
   * touched, and the server's suggestion is shown as a suggestion.
   */
  it('records a result and shows the suggestion without applying it', async () => {
    const user = userEvent.setup();

    apiPost.mockResolvedValue({
      interview: interviewFixture({ status: 'completed' }),
      suggestedApplicationStatus: 'in_process',
    });

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /record result/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Record result$/ }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/interviews/interview-1/result');

    // Shown as advice, and explicitly not applied.
    expect(await screen.findByText(/suggested next step/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has changed on the application/i)).toBeInTheDocument();

    // No application endpoint was called.
    const urls = apiPost.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/applications'))).toBe(false);
  });

  it('offers only the outcomes the enum defines', async () => {
    const user = userEvent.setup();
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    await user.click(screen.getByRole('button', { name: /record result/i }));

    const dialog = await screen.findByRole('dialog');
    const outcome = within(dialog).getByLabelText(/interview outcome/i);

    for (const label of ['Cleared', 'Not cleared', 'On hold', 'Did not attend', 'Awaiting result']) {
      expect(within(outcome).getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('shows a recorded result', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({
        status: 'completed',
        result: {
          status: 'cleared',
          score: 82,
          maxScore: 100,
          feedback: 'Strong on data structures.',
          strengths: ['Algorithms'],
          improvements: ['System design'],
          recordedAt: '2026-02-10T11:00:00.000Z',
        },
      }),
    );

    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });
    expect(screen.getByText('82 / 100')).toBeInTheDocument();
    expect(screen.getByText('Strong on data structures.')).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /** HOD reads everything and drives nothing. */
  it('offers a read-only caller no actions and says why', async () => {
    permissions = [...HOD];
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Move$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancel$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record result/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access to this interview/i)).toBeInTheDocument();
  });

  it('hides recording from a caller without interview:record_result', async () => {
    permissions = ['interview:read_all', 'interview:update'];
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.getByRole('button', { name: /^Move$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record result/i })).not.toBeInTheDocument();
  });

  it('hides moving and cancelling from a caller without interview:update', async () => {
    permissions = ['interview:read_all', 'interview:record_result'];
    renderWithQuery(<InterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Meera Iyer' });

    expect(screen.queryByRole('button', { name: /^Move$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record result/i })).toBeInTheDocument();
  });

  it('shows an error state with a retry', async () => {
    apiGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Interview not found.', 404, [], 'req-2'));

    renderWithQuery(<InterviewDetailPage />);

    expect(await screen.findByText(/could not load this interview/i)).toBeInTheDocument();
    expect(screen.getByText(/req-2/)).toBeInTheDocument();
  });
});
