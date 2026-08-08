import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Company } from '@/api/placement-queries';

import { mockAuth, renderWithQuery } from './helpers/render';

const push = vi.fn();
const back = vi.fn();
const apiGetPaginated = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back }),
  usePathname: () => '/college/placements/jobs/new',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(['job:read', 'job:create', 'job:update'], { roleKey: 'placement_officer' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
  };
});

const { JobForm } = await import('@/components/placement/job-form');

const COMPANY_ID = '507f1f77bcf86cd799439011';

const COMPANY = { id: COMPANY_ID, name: 'Acme Technologies' } as unknown as Company;

function paginated<T>(items: T[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 200,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  apiGetPaginated.mockReset();

  apiGetPaginated.mockImplementation((url: string) => {
    if (url.startsWith('/companies')) return Promise.resolve(paginated([COMPANY]));
    if (url.startsWith('/departments'))
      return Promise.resolve(paginated([{ id: 'dept-1', name: 'Computer Science', code: 'CSE' }]));
    if (url.startsWith('/batches'))
      return Promise.resolve(
        paginated([{ id: 'batch-1', name: '2022–26', code: 'CSE-A', departmentId: 'dept-1' }]),
      );
    return Promise.resolve(paginated([]));
  });
});

describe('Job posting form', () => {
  it('renders every section a drive needs', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    expect(await screen.findByLabelText(/job title/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /selection rounds/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /who can apply/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum ctc/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/applications close/i)).toBeInTheDocument();
  });

  it('offers companies from the API rather than a free-text box', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    const select = await screen.findByLabelText(/^Company/);
    expect(select.tagName).toBe('SELECT');

    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Acme Technologies' })).toBeInTheDocument(),
    );
  });

  it('refuses to submit an empty form and reports the missing fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithQuery(<JobForm mode="create" onSubmit={onSubmit} />);

    await screen.findByLabelText(/job title/i);
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/job title is required/i)).toBeInTheDocument();
    expect(screen.getByText(/description is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a maximum CTC below the minimum, as the schema does', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithQuery(<JobForm mode="create" onSubmit={onSubmit} />);

    const min = await screen.findByLabelText(/minimum ctc/i);
    await user.clear(min);
    await user.type(min, '1800000');

    const max = screen.getByLabelText(/maximum ctc/i);
    await user.clear(max);
    await user.type(max, '1200000');

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/maximum ctc must be at least the minimum/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /* ---------------------------- selection rounds ---------------------------- */

  it('starts with a usable set of rounds and can add one', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add round/i }));
    expect(await screen.findByText('Round 4')).toBeInTheDocument();
  });

  it('removes a round and renumbers the rest without a gap', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);
    await user.click(screen.getByRole('button', { name: /remove round 2/i }));

    await waitFor(() => expect(screen.queryByText('Round 3')).not.toBeInTheDocument());
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
  });

  it('reorders rounds', async () => {
    const user = userEvent.setup();
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);

    const names = () =>
      screen.getAllByLabelText(/^Name/).map((input) => (input as HTMLInputElement).value);

    expect(names()[0]).toBe('Aptitude test');

    await user.click(screen.getByRole('button', { name: /move round 1 later/i }));

    await waitFor(() => expect(names()[0]).toBe('Technical interview'));
    expect(names()[1]).toBe('Aptitude test');
  });

  it('cannot move the first round earlier or the last one later', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);

    expect(screen.getByRole('button', { name: /move round 1 earlier/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move round 3 later/i })).toBeDisabled();
  });

  /* --------------------------- eligibility builder --------------------------- */

  it('exposes every eligibility criterion the backend defines', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);

    // The two relation pickers are multi-selects, not single form controls.
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('Batches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose departments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose batches/i })).toBeInTheDocument();

    for (const label of [
      /graduating years/i,
      /minimum cgpa/i,
      /minimum class x %/i,
      /minimum class xii %/i,
      /minimum diploma %/i,
      /accepted qualifications/i,
      /maximum active backlogs/i,
      /maximum backlogs ever/i,
      /minimum attendance %/i,
      /maximum year gap/i,
      /required skills/i,
      /^gender$/i,
      /open to already-placed students/i,
      /conditions in the company's words/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('groups the criteria so an officer can read them', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);

    for (const heading of [
      /^cohort$/i,
      /academic record/i,
      /backlogs, attendance and gaps/i,
      /skills and other conditions/i,
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('says plainly that free-text conditions are never evaluated', async () => {
    renderWithQuery(<JobForm mode="create" onSubmit={vi.fn()} />);

    await screen.findByLabelText(/job title/i);
    expect(screen.getByText(/never checked automatically/i)).toBeInTheDocument();
  });

  /** The server refuses the change; the form should not invite it. */
  it('locks eligibility once students have applied', async () => {
    renderWithQuery(
      <JobForm
        mode="edit"
        onSubmit={vi.fn()}
        eligibilityLocked
        eligibilityLockedReason="14 student(s) have already applied."
      />,
    );

    expect(await screen.findByText(/14 student\(s\) have already applied\./)).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum cgpa/i)).toBeDisabled();
    expect(screen.getByLabelText(/required skills/i)).toBeDisabled();
  });

  it('leaves the rest of the form editable while eligibility is locked', async () => {
    renderWithQuery(<JobForm mode="edit" onSubmit={vi.fn()} eligibilityLocked />);

    expect(await screen.findByLabelText(/job title/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/minimum ctc/i)).not.toBeDisabled();
  });

  /* -------------------------------- submission ------------------------------- */

  it('submits a complete draft in the shape the API expects', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'job-9' });

    renderWithQuery(
      <JobForm
        mode="create"
        onSubmit={onSubmit}
        defaultValues={
          {
            companyId: COMPANY_ID,
            title: 'Software Engineer',
            description: 'A full description of the role, well over twenty characters.',
            locations: ['Bengaluru'],
            openings: 12,
            compensation: {
              currency: 'INR',
              ctcMin: 1_200_000,
              ctcMax: 1_800_000,
              fixedComponent: null,
              variableComponent: null,
              stipendPerMonth: null,
              bondMonths: null,
              bondAmount: null,
            },
            applicationOpenAt: '2030-01-05',
            applicationCloseAt: '2030-02-05',
          } as never
        }
      />,
    );

    await screen.findByLabelText(/job title/i);
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const values = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(values.companyId).toBe(COMPANY_ID);
    expect(values.title).toBe('Software Engineer');
    // Unset optional criteria travel as null, not NaN.
    expect((values.eligibility as Record<string, unknown>).minCgpa).toBeNull();
    expect((values.selectionRounds as unknown[]).length).toBe(3);
  });

  /**
   * A posting cannot be moved to another company — the update endpoint has no
   * such field — so the picker is disabled rather than silently ignored.
   */
  it('locks the company on edit while keeping its value', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'job-1' });

    renderWithQuery(
      <JobForm
        mode="edit"
        lockCompany
        onSubmit={onSubmit}
        defaultValues={
          {
            companyId: COMPANY_ID,
            title: 'Software Engineer',
            description: 'A full description of the role, well over twenty characters.',
            locations: ['Bengaluru'],
            openings: 12,
            compensation: {
              currency: 'INR',
              ctcMin: 1_200_000,
              ctcMax: 1_800_000,
              fixedComponent: null,
              variableComponent: null,
              stipendPerMonth: null,
              bondMonths: null,
              bondAmount: null,
            },
            applicationOpenAt: '2030-01-05',
            applicationCloseAt: '2030-02-05',
          } as never
        }
      />,
    );

    const select = await screen.findByLabelText(/^Company/);
    expect(select).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect((onSubmit.mock.calls[0]![0] as Record<string, unknown>).companyId).toBe(COMPANY_ID);
  });
});
