import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnAttendance } from '@/api/queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();

let permissions: string[] = ['attendance:read_own'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/attendance',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) };
});

const { default: StudentAttendancePage } = await import('@/app/student/attendance/page');

function session(overrides: Partial<OwnAttendance['sessions'][number]> = {}) {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    date: '2026-03-02T00:00:00.000Z',
    status: 'present',
    remarks: null,
    wasModified: false,
    ...overrides,
  };
}

function attendance(overrides: Partial<OwnAttendance> = {}): OwnAttendance {
  return {
    studentId: 'student-1',
    rollNumber: 'CS22B001',
    threshold: 75,
    percentage: 86.4,
    isBelowThreshold: false,
    counts: { present: 38, absent: 5, late: 3, excused: 2, onDuty: 1, total: 49 },
    sessionsNeededForThreshold: 0,
    sessions: [session()],
    ...overrides,
  };
}

const urls = () => apiGet.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  permissions = ['attendance:read_own'];
  replace.mockReset();
  apiGet.mockReset();
  apiGet.mockResolvedValue(attendance());
});

describe('Student attendance page', () => {
  /* --------------------------------- summary -------------------------------- */

  it('renders the overall percentage and the required threshold', async () => {
    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText('86.4%')).toBeInTheDocument();
    expect(screen.getByText('Required threshold')).toBeInTheDocument();
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
  });

  it('shows the roll number returned with the record', async () => {
    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText(/Roll number CS22B001/)).toBeInTheDocument();
  });

  it('renders every status count from the backend', async () => {
    renderWithQuery(<StudentAttendancePage />);

    const breakdown = await screen.findByRole('list', { name: 'Session breakdown' });

    const rows: Array<[string, string]> = [
      ['present', '38'],
      ['absent', '5'],
      ['late', '3'],
      ['excused', '2'],
      ['on duty', '1'],
    ];

    for (const [label, count] of rows) {
      const row = within(breakdown).getByText(label).closest('li')!;
      expect(within(row).getByText(count)).toBeInTheDocument();
    }

    // Total sessions comes from counts.total, not from summing the rows.
    expect(screen.getByText('49')).toBeInTheDocument();
  });

  /* -------------------------------- threshold ------------------------------- */

  it('confirms the threshold is met when isBelowThreshold is false', async () => {
    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText('Meeting the threshold')).toBeInTheDocument();
    expect(screen.queryByText('Attendance needs attention')).not.toBeInTheDocument();
  });

  it('warns when isBelowThreshold is true and states the shortfall', async () => {
    apiGet.mockResolvedValue(
      attendance({ percentage: 61.2, isBelowThreshold: true, sessionsNeededForThreshold: 9 }),
    );

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText('Attendance needs attention')).toBeInTheDocument();
    expect(screen.getByText('Below threshold')).toBeInTheDocument();
    expect(screen.getByText(/approximately 9 additional qualifying sessions/i)).toBeInTheDocument();
  });

  /**
   * A student can be below the threshold with no achievable recovery, in which
   * case the server sends 0. Claiming "0 more sessions" would be a lie.
   */
  it('does not promise a recovery when the server reports no shortfall figure', async () => {
    apiGet.mockResolvedValue(
      attendance({ percentage: 40, isBelowThreshold: true, sessionsNeededForThreshold: 0 }),
    );

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText('Below threshold')).toBeInTheDocument();
    expect(screen.queryByText(/additional qualifying session/i)).not.toBeInTheDocument();
  });

  /** The threshold is a college setting; the page must never assume 75. */
  it('renders a non-default threshold as sent', async () => {
    apiGet.mockResolvedValue(attendance({ threshold: 85, percentage: 80, isBelowThreshold: true }));

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText(/threshold of 85%/)).toBeInTheDocument();
    expect(screen.queryByText(/threshold of 75%/)).not.toBeInTheDocument();
  });

  /* --------------------------------- sessions ------------------------------- */

  it('renders the session history', async () => {
    apiGet.mockResolvedValue(
      attendance({
        sessions: [
          session({ id: 'record-1', status: 'present' }),
          session({
            id: 'record-2',
            status: 'absent',
            date: '2026-03-03T00:00:00.000Z',
            remarks: 'Medical leave submitted',
            wasModified: true,
          }),
        ],
      }),
    );

    renderWithQuery(<StudentAttendancePage />);

    // The table and the narrow-screen cards both render in jsdom, since the
    // responsive classes do not actually remove either from the DOM.
    expect(await screen.findAllByText('Medical leave submitted')).not.toHaveLength(0);
    expect(screen.getAllByText('Corrected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('02 Mar 2026').length).toBeGreaterThan(0);
  });

  /** The tally is fixed, but a stored value should never crash the page. */
  it('renders an unexpected status without crashing', async () => {
    apiGet.mockResolvedValue(
      attendance({ sessions: [session({ status: 'some_new_status' })] }),
    );

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findAllByText('some new status')).not.toHaveLength(0);
  });

  /* ------------------------------- date filter ------------------------------ */

  it('sends a complete date range as from and to', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(urls().some((url) => url.includes('from='))).toBe(true));

    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-06-30' } });
    await waitFor(() => expect(urls().some((url) => url.includes('to='))).toBe(true));

    for (const url of urls()) expect(url.startsWith('/attendance/me')).toBe(true);
  });

  /**
   * A date input reports every keystroke. A partial value must not be sent and,
   * more importantly, must not throw on `toISOString()`.
   */
  it('sends nothing while a date is incomplete', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    const before = urls().length;

    for (const partial of ['2', '20', '202', '2026', '2026-0', '2026-01', '2026-01-0']) {
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: partial } });
    }

    expect(urls()).toHaveLength(before);
    expect(urls().every((url) => !url.includes('from='))).toBe(true);
    // Still alive: an invalid date would have thrown during the render.
    expect(screen.getByText('86.4%')).toBeInTheDocument();
  });

  it('rejects an impossible date', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-02-31' } });

    await waitFor(() => expect(screen.getByText('86.4%')).toBeInTheDocument());
    expect(urls().every((url) => !url.includes('from='))).toBe(true);
  });

  it('clears the range and drops the date parameters', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(urls().some((url) => url.includes('from='))).toBe(true));

    await user.click(screen.getByRole('button', { name: /clear dates/i }));

    await waitFor(() => expect(urls().at(-1)).toBe('/attendance/me'));
  });

  /* --------------------------------- states --------------------------------- */

  it('shows a loading state rather than misleading zeros', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentAttendancePage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('Meeting the threshold')).not.toBeInTheDocument();
  });

  /**
   * No sessions in a period does not mean zero attendance. The summary the
   * server sent stays on screen and stays authoritative.
   */
  it('shows an empty session state while keeping the server summary', async () => {
    apiGet.mockResolvedValue(attendance({ sessions: [] }));

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findAllByText(/no attendance recorded yet/i)).not.toHaveLength(0);
    expect(screen.getByText('86.4%')).toBeInTheDocument();
    expect(screen.getByText('Meeting the threshold')).toBeInTheDocument();
  });

  it('describes an empty period differently from an empty record', async () => {
    apiGet.mockResolvedValue(attendance({ sessions: [] }));

    renderWithQuery(<StudentAttendancePage />);
    await screen.findAllByText(/no attendance recorded yet/i);

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });

    expect(await screen.findAllByText(/no sessions in the selected period/i)).not.toHaveLength(0);
  });

  it('shows an error state with a retry and no internal detail', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Mongo timed out on attendance_records', 500, [], 'req-88'),
    );

    renderWithQuery(<StudentAttendancePage />);

    expect(await screen.findByText(/could not load your attendance/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByText(/req-88/)).toBeInTheDocument();
    // The raw backend message is not put in front of the student.
    expect(screen.queryByText(/attendance_records/)).not.toBeInTheDocument();
  });

  /* --------------------------------- security ------------------------------- */

  it('reads only /attendance/me and never sends a student id', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(urls().some((url) => url.includes('from='))).toBe(true));

    expect(urls().length).toBeGreaterThan(0);
    for (const url of urls()) {
      expect(url.startsWith('/attendance/me')).toBe(true);
      expect(url).not.toContain('studentId');
      expect(url).not.toContain('/attendance/students/');
    }
  });

  it('never reaches a staff attendance surface', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    for (const url of urls()) {
      expect(url).not.toContain('/attendance/sessions');
      expect(url).not.toContain('/attendance/reports/');
    }
  });

  it('redirects a caller without attendance:read_own', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentAttendancePage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('86.4%')).not.toBeInTheDocument();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests attendance without attendance:read_own', async () => {
    permissions = ['result:read_own', 'job:read'];

    renderWithQuery(<StudentAttendancePage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(apiGet).not.toHaveBeenCalled();
  });

  /* ------------------------------ no fabrication ---------------------------- */

  /**
   * The server queries `courseId: null`, so there is no per-subject figure to
   * show. This pins that none is invented from the session list.
   */
  it('presents the figures as overall and offers no subject breakdown', async () => {
    apiGet.mockResolvedValue(
      attendance({
        sessions: [
          session({ id: 'record-1', status: 'present' }),
          session({ id: 'record-2', status: 'absent' }),
        ],
      }),
    );

    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    expect(screen.getByText(/reflects your overall attendance/i)).toBeInTheDocument();
    expect(screen.queryByText(/subject-wise/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/by subject/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/by course/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by subject/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by course/i)).not.toBeInTheDocument();
  });

  /** Only the two parameters the endpoint accepts are offered. */
  it('offers no filter the endpoint cannot honour', async () => {
    renderWithQuery(<StudentAttendancePage />);
    await screen.findByText('86.4%');

    expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by batch/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/select student/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/academic year/i)).not.toBeInTheDocument();
  });
});
