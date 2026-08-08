import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { OFFICE_ACTION_LABELS, interviewFixture } from './helpers/interview';
import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

const STUDENT = [
  'job:read',
  'application:read',
  'interview:read',
  'interview:respond',
  'placement:read',
  'placement:respond',
];

let permissions: string[] = [...STUDENT];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/interviews',
  useParams: () => ({ id: 'interview-1' }),
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

const { default: StudentInterviewsPage } = await import('@/app/student/interviews/page');
const { default: StudentInterviewDetailPage } = await import(
  '@/app/student/interviews/[id]/page'
);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(() => {
  permissions = [...STUDENT];
  replace.mockReset();
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue([interviewFixture()]);
});

describe('Student interviews list', () => {
  it('lists the caller’s own interviews', async () => {
    renderWithQuery(<StudentInterviewsPage />);

    expect(
      await screen.findByRole('link', { name: 'Technical Interview' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Software Engineer · Acme Technologies/)).toBeInTheDocument();
  });

  /** Identity is the token's, never the browser's. */
  it('uses the /me endpoint and never sends a student id', async () => {
    renderWithQuery(<StudentInterviewsPage />);

    await screen.findByRole('link', { name: 'Technical Interview' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/interviews/me');
    expect(urls.every((url) => !url.includes('studentId'))).toBe(true);
  });

  it('separates what is coming up from what is done', async () => {
    apiGet.mockResolvedValue([
      interviewFixture(),
      interviewFixture({ id: 'interview-2', roundName: 'HR Interview', status: 'completed' }),
    ]);

    renderWithQuery(<StudentInterviewsPage />);

    await screen.findByRole('link', { name: 'Technical Interview' });

    expect(screen.getByRole('heading', { name: 'Coming up' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Past' })).toBeInTheDocument();
  });

  it('shows empty, loading and error states', async () => {
    apiGet.mockResolvedValue([]);
    const { unmount } = renderWithQuery(<StudentInterviewsPage />);
    expect(await screen.findByText(/no interviews yet/i)).toBeInTheDocument();
    unmount();

    apiGet.mockReturnValue(new Promise(() => {}));
    const loading = renderWithQuery(<StudentInterviewsPage />);
    expect(loading.container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    loading.unmount();

    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-31'),
    );
    renderWithQuery(<StudentInterviewsPage />);
    expect(await screen.findByText(/could not load your interviews/i)).toBeInTheDocument();
  });

  it('redirects a caller without interview:read', async () => {
    permissions = ['result:read_own'];
    renderWithQuery(<StudentInterviewsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it('calls only self-service endpoints', async () => {
    renderWithQuery(<StudentInterviewsPage />);

    await screen.findByRole('link', { name: 'Technical Interview' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    for (const url of urls) expect(url.startsWith('/interviews/me')).toBe(true);
  });
});

describe('Student interview detail', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue(interviewFixture());
  });

  it('shows the slot, the panel and the instructions', async () => {
    renderWithQuery(<StudentInterviewDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Technical Interview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('45 minutes')).toBeInTheDocument();
    expect(screen.getByText('Priya Menon')).toBeInTheDocument();
    expect(screen.getByText('Have your ID ready.')).toBeInTheDocument();
  });

  it('reads its own record from the /me path', async () => {
    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/interviews/me/interview-1');
    expect(urls.every((url) => !url.includes('studentId'))).toBe(true);
  });

  /* -------------------------------- responding -------------------------------- */

  it('confirms attendance through the /me endpoint', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(interviewFixture({ status: 'confirmed' }));

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    await user.click(screen.getByRole('button', { name: /confirm attendance/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /confirm attendance/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/interviews/me/interview-1/confirm');
  });

  it('asks for a different time without moving the interview', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue(interviewFixture());

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    await user.click(screen.getByRole('button', { name: /ask to move/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/the current time stands/i)).toBeInTheDocument();

    await user.type(
      within(dialog).getByLabelText(/reason/i),
      'I have a university examination that morning.',
    );
    await user.click(within(dialog).getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls.at(-1)!;
    expect(url).toBe('/interviews/me/interview-1/request-reschedule');
    expect(body).toMatchObject({ reason: 'I have a university examination that morning.' });
  });

  it('does not offer confirmation once already confirmed', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({ status: 'confirmed', confirmedAt: '2026-02-05T09:00:00.000Z' }),
    );

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.queryByRole('button', { name: /confirm attendance/i })).not.toBeInTheDocument();
  });

  it('offers confirmation again after the office moves it', async () => {
    apiGet.mockResolvedValue(interviewFixture({ status: 'rescheduled' }));

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.getByRole('button', { name: /confirm attendance/i })).toBeInTheDocument();
    expect(screen.getByText(/has been moved/i)).toBeInTheDocument();
  });

  it('offers nothing on a cancelled interview', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({ status: 'cancelled', cancellationReason: 'The drive was postponed.' }),
    );

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.queryByRole('button', { name: /confirm attendance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask to move/i })).not.toBeInTheDocument();
    expect(screen.getByText('The drive was postponed.')).toBeInTheDocument();
  });

  it('shows a pending request rather than offering another', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({
        rescheduleRequest: {
          reason: 'Examination clash.',
          preferredSlots: [],
          requestedAt: '2026-02-05T09:00:00.000Z',
        },
      }),
    );

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.getByText(/you asked to move this interview/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask to move/i })).not.toBeInTheDocument();
  });

  it('shows the result once the office records it', async () => {
    apiGet.mockResolvedValue(
      interviewFixture({
        status: 'completed',
        result: {
          status: 'cleared',
          score: 82,
          maxScore: 100,
          feedback: 'Strong on data structures.',
          strengths: ['Algorithms'],
          improvements: [],
          recordedAt: '2026-02-10T11:00:00.000Z',
        },
      }),
    );

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.getByText('82 / 100')).toBeInTheDocument();
    expect(screen.getByText('Strong on data structures.')).toBeInTheDocument();
  });

  /**
   * An unannounced panel is a real state, distinct from one withheld. The API
   * returns the array either way, so this says "not announced" rather than
   * implying the student is being kept from something.
   */
  it('distinguishes an unannounced panel from a withheld one', async () => {
    apiGet.mockResolvedValue(interviewFixture({ interviewers: [] }));

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.getByText(/panel has not been announced/i)).toBeInTheDocument();
  });

  /** A 404 is the server refusing to confirm someone else's record exists. */
  it('treats a 404 as not found rather than revealing anything', async () => {
    apiGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Interview not found.', 404, [], 'req-5'));

    renderWithQuery(<StudentInterviewDetailPage />);

    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.getByText(/it may have been cancelled, or it is not yours/i)).toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  /** Nothing the office controls may appear on a student page. */
  it('never renders an office action', async () => {
    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });

    for (const label of OFFICE_ACTION_LABELS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  /** Reading is not a licence to answer. */
  it('hides both responses from a caller without interview:respond', async () => {
    permissions = ['interview:read'];

    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });
    expect(screen.queryByRole('button', { name: /confirm attendance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask to move/i })).not.toBeInTheDocument();
  });

  it('redirects a caller without interview:read', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentInterviewDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it('calls only self-service endpoints', async () => {
    renderWithQuery(<StudentInterviewDetailPage />);

    await screen.findByRole('heading', { name: 'Technical Interview' });

    const urls = apiGet.mock.calls.map((call) => String(call[0]));
    for (const url of urls) expect(url.startsWith('/interviews/me')).toBe(true);
  });
});
