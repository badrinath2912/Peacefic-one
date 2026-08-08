import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '@/api/audit-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGetPaginated = vi.fn();
const apiClientPost = vi.fn();

/** Only college_admin holds either audit permission. */
const COLLEGE_ADMIN = ['audit:read', 'audit:export'];

let permissions: string[] = [...COLLEGE_ADMIN];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/audit',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions, { roleKey: 'college_admin' }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
    apiClient: {
      ...actual.apiClient,
      post: (...args: unknown[]) => apiClientPost(...args),
    },
  };
});

const { default: AuditPage } = await import('@/app/college/audit/page');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'entry-1',
    userId: 'user-1',
    userEmail: 'admin@example.edu',
    userRole: 'college_admin',
    action: 'student.created',
    category: 'data',
    severity: 'info',
    entity: { type: 'Student', id: 'student-1', label: 'Meera Iyer' },
    changes: null,
    metadata: null,
    ip: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
    requestId: 'req-1234',
    outcome: 'success',
    errorMessage: null,
    createdAt: '2026-03-01T09:30:00.000Z',
    ...overrides,
  };
}

function paginated(items: AuditEntry[]) {
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

const urls = () => apiGetPaginated.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  permissions = [...COLLEGE_ADMIN];
  replace.mockReset();
  apiGetPaginated.mockReset();
  apiClientPost.mockReset();

  apiGetPaginated.mockResolvedValue(paginated([entry()]));
  apiClientPost.mockResolvedValue({
    data: new Blob(['x']),
    headers: { 'x-row-count': '3', 'content-disposition': 'attachment; filename="audit-log.xlsx"' },
  });
});

describe('Audit page', () => {
  it('renders an entry with who, what and the outcome', async () => {
    renderWithQuery(<AuditPage />);

    expect(await screen.findByText('admin@example.edu')).toBeInTheDocument();

    const row = screen.getByText('admin@example.edu').closest('tr')!;
    expect(within(row).getByText('Student created')).toBeInTheDocument();
    expect(within(row).getByText('student.created')).toBeInTheDocument();
    expect(within(row).getByText('Meera Iyer')).toBeInTheDocument();
    expect(within(row).getByText('Succeeded')).toBeInTheDocument();
  });

  it('requests the log with server-side list params', async () => {
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');

    const url = urls().find((entryUrl) => entryUrl.startsWith('/audit?'));
    expect(url).toBeDefined();
    expect(url).toContain('page=1');
    expect(url).toContain('sort=-createdAt');
  });

  it('says plainly that the record cannot be edited', async () => {
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
  });

  /* --------------------------------- filters -------------------------------- */

  it('sends the search term', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');
    await user.type(screen.getByLabelText('Search audit entries'), 'auth.login');

    await waitFor(
      () => expect(urls().some((url) => url.includes('search=auth.login'))).toBe(true),
      { timeout: 3000 },
    );
  });

  it.each([
    ['Filter by category', 'security', 'category=security'],
    ['Filter by severity', 'critical', 'severity=critical'],
    ['Filter by outcome', 'failure', 'outcome=failure'],
  ])('sends the %s selection', async (label, value, expected) => {
    const user = userEvent.setup();
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');
    await user.selectOptions(screen.getByLabelText(label), value);

    await waitFor(() => expect(urls().some((url) => url.includes(expected))).toBe(true));
  });

  /**
   * The API takes `from`/`to`, not the repository's operator syntax.
   * `fireEvent.change` rather than typing: a date input in jsdom does not
   * accept character-by-character entry.
   */
  it('sends the date range as from and to', async () => {
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(urls().some((url) => url.includes('from='))).toBe(true));

    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-06-01' } });
    await waitFor(() => expect(urls().some((url) => url.includes('to='))).toBe(true));

    // Never the bracket form, which Express reshapes and the parser ignores.
    expect(urls().every((url) => !url.includes('createdAt%5B'))).toBe(true);
  });

  /**
   * `express-mongo-sanitize` rewrites a dotted key, so an entity filter could
   * never work. It must not be offered.
   */
  it('offers no entity filter, which the sanitiser would break', async () => {
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');

    expect(screen.queryByLabelText(/filter by entity/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter by subject/i)).not.toBeInTheDocument();
  });

  /* ---------------------------------- detail -------------------------------- */

  it('opens an entry and shows its request metadata', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AuditPage />);

    await user.click(await screen.findByText('admin@example.edu'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('203.0.113.9')).toBeInTheDocument();
    expect(within(dialog).getByText('req-1234')).toBeInTheDocument();
    expect(within(dialog).getByText('Mozilla/5.0')).toBeInTheDocument();
  });

  /**
   * The server replaces secrets before storing them, so what arrives is already
   * `[redacted]`. This proves the UI shows that marker rather than a value.
   */
  it('shows redacted values rather than secrets', async () => {
    const user = userEvent.setup();

    apiGetPaginated.mockResolvedValue(
      paginated([
        entry({
          action: 'user.password_changed',
          category: 'security',
          changes: [{ field: 'password', from: '[redacted]', to: '[redacted]' }],
          metadata: { token: '[redacted]', note: 'kept' },
        }),
      ]),
    );

    renderWithQuery(<AuditPage />);
    await user.click(await screen.findByText('admin@example.edu'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('[redacted]').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('kept')).toBeInTheDocument();
  });

  /* ---------------------------------- states -------------------------------- */

  it('shows a loading state before the rows arrive', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<AuditPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an empty state', async () => {
    apiGetPaginated.mockResolvedValue(paginated([]));

    renderWithQuery(<AuditPage />);
    expect(await screen.findByText(/nothing recorded yet/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry and the request id', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500, [], 'req-55'),
    );

    renderWithQuery(<AuditPage />);

    expect(await screen.findByText(/could not load this/i)).toBeInTheDocument();
    expect(screen.getByText(/req-55/)).toBeInTheDocument();
  });

  /* ---------------------------------- export -------------------------------- */

  it('exports for a caller holding audit:export', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');
    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(apiClientPost).toHaveBeenCalled());
    expect(String(apiClientPost.mock.calls.at(-1)?.[0])).toContain('/audit/bulk/export');
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('hides export from a caller without audit:export, and never fires it', async () => {
    permissions = ['audit:read'];

    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');

    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(apiClientPost).not.toHaveBeenCalled();
  });

  it('redirects a caller without audit:read', async () => {
    permissions = ['student:read', 'report:generate'];

    renderWithQuery(<AuditPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('admin@example.edu')).not.toBeInTheDocument();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests the log without audit:read', async () => {
    permissions = ['report:generate', 'analytics:read'];

    renderWithQuery(<AuditPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(urls().some((url) => url.startsWith('/audit'))).toBe(false);
    expect(apiClientPost).not.toHaveBeenCalled();
  });

  it('requests nothing but the audit log', async () => {
    renderWithQuery(<AuditPage />);

    await screen.findByText('admin@example.edu');

    for (const url of urls()) expect(url.startsWith('/audit')).toBe(true);
  });
});
