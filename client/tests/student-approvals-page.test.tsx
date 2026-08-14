import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudentRegistration } from '@/api/student-registration-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPost = vi.fn();

let permissions: string[] = ['student:approve', 'department:read', 'batch:read'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/students/approvals',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({ useAuth: () => mockAuth(permissions) }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...a: unknown[]) => apiGet(...a),
    apiGetPaginated: (...a: unknown[]) => apiGetPaginated(...a),
    apiPost: (...a: unknown[]) => apiPost(...a),
  };
});

const { default: ApprovalsPage } = await import('@/app/college/students/approvals/page');

// jsdom implements neither, and `ReasonDialog` uses a native <dialog>. Same
// shim the placement suites already use.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const type = () => userEvent.setup({ delay: null });
const urls = () => [
  ...apiGetPaginated.mock.calls.map((c) => String(c[0])),
  ...apiPost.mock.calls.map((c) => String(c[0])),
];

function registration(overrides: Partial<StudentRegistration> = {}): StudentRegistration {
  return {
    id: 'reg-1',
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera@example.edu',
    phone: '+919812345670',
    rollNumber: 'CS22B001',
    approvalStatus: 'pending',
    rejectionReason: null,
    reviewedAt: null,
    studentId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(items: StudentRegistration[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

/** Departments and batches are paginated through the same helper. */
function routePaginated(url: string) {
  if (url.startsWith('/students/registrations')) return Promise.resolve(page([registration()]));
  if (url.startsWith('/departments')) {
    return Promise.resolve({ items: [{ id: 'dept-1', name: 'Computer Science' }], pagination: {} });
  }
  if (url.startsWith('/batches')) {
    return Promise.resolve({ items: [{ id: 'batch-1', name: 'CSE 2022-26' }], pagination: {} });
  }
  return Promise.resolve(page([]));
}

beforeEach(() => {
  permissions = ['student:approve', 'department:read', 'batch:read'];
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();
  apiPost.mockReset();
  apiGetPaginated.mockImplementation((url: string) => routePaginated(url));
  apiPost.mockResolvedValue({});
});

describe('Student approvals page', () => {
  it('lists students awaiting review', async () => {
    renderWithQuery(<ApprovalsPage />);

    expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();
    expect(screen.getByText('meera@example.edu')).toBeInTheDocument();
    expect(screen.getByText('CS22B001')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
  });

  it('asks only for its own tenant, never sending a college id', async () => {
    renderWithQuery(<ApprovalsPage />);

    await screen.findByText('Meera Iyer');

    const listCall = urls().find((u) => u.startsWith('/students/registrations'));
    expect(listCall).toContain('approvalStatus=pending');
    // The server resolves the tenant from the token; a collegeId here would be
    // a tenant-selection parameter.
    expect(urls().some((u) => /collegeId/i.test(u))).toBe(false);
  });

  it('shows an empty state when nobody is waiting', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      url.startsWith('/students/registrations') ? Promise.resolve(page([])) : routePaginated(url),
    );

    renderWithQuery(<ApprovalsPage />);

    expect(await screen.findByText('Nobody is waiting')).toBeInTheDocument();
  });

  it('shows an error state when the queue cannot be loaded', async () => {
    apiGetPaginated.mockImplementation((url: string) =>
      url.startsWith('/students/registrations')
        ? Promise.reject(new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-1'))
        : routePaginated(url),
    );

    renderWithQuery(<ApprovalsPage />);

    expect(await screen.findByText(/req-1/)).toBeInTheDocument();
  });

  /* --------------------------------- approval -------------------------------- */

  it('separates student-submitted details from institution-assigned fields', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Review' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/submitted by the student/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/assigned by your institution/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/department/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^batch/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/admission number/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/admission date/i)).toBeInTheDocument();
  });

  it('refuses to submit without the required academic fields', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Review' }));
    await type().click(await screen.findByRole('button', { name: 'Approve student' }));

    expect(await screen.findAllByText('Required')).not.toHaveLength(0);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('keeps the batch list closed until a department is chosen', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByLabelText(/^batch/i)).toBeDisabled();
  });

  it('approves with the assigned academic fields', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Review' }));

    const dialog = await screen.findByRole('dialog');
    await type().selectOptions(within(dialog).getByLabelText(/department/i), 'dept-1');
    await waitFor(() => expect(within(dialog).getByLabelText(/^batch/i)).not.toBeDisabled());
    await type().selectOptions(within(dialog).getByLabelText(/^batch/i), 'batch-1');
    await type().type(within(dialog).getByLabelText(/admission number/i), 'ADM-001');
    await type().type(within(dialog).getByLabelText(/admission date/i), '2022-08-01');

    await type().click(within(dialog).getByRole('button', { name: 'Approve student' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls[0]?.[0])).toBe('/students/registrations/reg-1/approve');

    const body = apiPost.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.departmentId).toBe('dept-1');
    expect(body.batchId).toBe('batch-1');
    expect(body.admissionNumber).toBe('ADM-001');
    expect(body).not.toHaveProperty('collegeId');
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('roleId');
  });

  it('surfaces an approval failure without closing the form', async () => {
    apiPost.mockRejectedValue(
      new ApiError('DUPLICATE', 'That admission number is already in use.', 409, []),
    );

    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await type().selectOptions(within(dialog).getByLabelText(/department/i), 'dept-1');
    await waitFor(() => expect(within(dialog).getByLabelText(/^batch/i)).not.toBeDisabled());
    await type().selectOptions(within(dialog).getByLabelText(/^batch/i), 'batch-1');
    await type().type(within(dialog).getByLabelText(/admission number/i), 'ADM-001');
    await type().type(within(dialog).getByLabelText(/admission date/i), '2022-08-01');
    await type().click(within(dialog).getByRole('button', { name: 'Approve student' }));

    expect(await screen.findByText(/admission number is already in use/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /* -------------------------------- rejection -------------------------------- */

  it('requires a reason of at least ten characters before rejecting', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Reject' }));

    const confirm = await screen.findByRole('button', { name: 'Reject registration' });
    expect(confirm).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('rejects with the typed reason', async () => {
    renderWithQuery(<ApprovalsPage />);

    await type().click(await screen.findByRole('button', { name: 'Reject' }));
    await type().type(
      await screen.findByLabelText(/reason for rejection/i),
      'Roll number does not match our records.',
    );
    await type().click(screen.getByRole('button', { name: 'Reject registration' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls[0]?.[0])).toBe('/students/registrations/reg-1/reject');
    expect(apiPost.mock.calls[0]?.[1]).toEqual({
      reason: 'Roll number does not match our records.',
    });
  });

  /* ------------------------------- permissions ------------------------------- */

  it('REQUEST MUST NOT LEAVE THE BROWSER without student:approve', async () => {
    permissions = ['student:read'];

    renderWithQuery(<ApprovalsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(apiGetPaginated).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
