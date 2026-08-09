import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Notification } from '@/api/notification-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

let permissions: string[] = ['notification:read'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/notifications',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuth(permissions),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
    apiPatch: (...args: unknown[]) => apiPatch(...args),
    apiDelete: (...args: unknown[]) => apiDelete(...args),
  };
});

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(() => undefined, {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  });
  return { __esModule: true, default: toast, toast };
});

const { NotificationInbox } = await import('@/components/notifications/notification-inbox');

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    type: 'placement.offer_made',
    category: 'placement',
    priority: 'normal',
    title: 'You have an offer',
    message: 'Zoho has made you an offer.',
    actionUrl: '/student/applications',
    actionLabel: 'View application',
    readAt: null,
    createdAt: '2026-08-01T09:30:00.000Z',
    ...overrides,
  };
}

function paginated(items: Notification[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      totalItems: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides,
    },
  };
}

const listUrls = () => apiGetPaginated.mock.calls.map((call) => String(call[0]));
const allUrls = () => [
  ...listUrls(),
  ...apiGet.mock.calls.map((call) => String(call[0])),
  ...apiPatch.mock.calls.map((call) => String(call[0])),
  ...apiDelete.mock.calls.map((call) => String(call[0])),
];

beforeEach(() => {
  permissions = ['notification:read'];
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();
  apiPatch.mockReset();
  apiDelete.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();

  apiGetPaginated.mockResolvedValue(paginated([notification()]));
  apiGet.mockResolvedValue({ unread: 1 });
  apiPatch.mockResolvedValue({ unread: 0 });
  apiDelete.mockResolvedValue({ unread: 0 });
});

describe('Notification inbox', () => {
  /* --------------------------------- listing -------------------------------- */

  it('lists notifications', async () => {
    renderWithQuery(<NotificationInbox />);

    expect(await screen.findByText('You have an offer')).toBeInTheDocument();
    expect(screen.getByText('Zoho has made you an offer.')).toBeInTheDocument();

    // Scoped to the row: "Placement" is also a category filter option.
    const row = screen.getByText('You have an offer').closest('li')!;
    expect(within(row).getByText('Placement')).toBeInTheDocument();

    expect(listUrls().some((url) => url.startsWith('/notifications?'))).toBe(true);
  });

  it('links to the action when one is provided', async () => {
    renderWithQuery(<NotificationInbox />);

    const link = await screen.findByRole('link', { name: 'View application' });
    expect(link).toHaveAttribute('href', '/student/applications');
  });

  it('marks an unread notification visually', async () => {
    apiGetPaginated.mockResolvedValue(
      paginated([
        notification({ id: 'n-1', title: 'Unread one', readAt: null }),
        notification({ id: 'n-2', title: 'Read one', readAt: '2026-08-02T00:00:00.000Z' }),
      ]),
    );

    renderWithQuery(<NotificationInbox />);

    const unreadRow = (await screen.findByText('Unread one')).closest('li')!;
    expect(within(unreadRow).getByText('Unread')).toBeInTheDocument();

    const readRow = screen.getByText('Read one').closest('li')!;
    expect(within(readRow).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    apiGetPaginated.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<NotificationInbox />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an empty state', async () => {
    apiGetPaginated.mockResolvedValue(paginated([]));

    renderWithQuery(<NotificationInbox />);

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
  });

  it('shows an error state with a retry and no internal detail', async () => {
    apiGetPaginated.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Mongo timed out on notifications', 500, [], 'req-31'),
    );

    renderWithQuery(<NotificationInbox />);

    expect(await screen.findByText(/could not load your notifications/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByText(/req-31/)).toBeInTheDocument();
    expect(screen.queryByText(/Mongo timed out/)).not.toBeInTheDocument();
  });

  /* --------------------------------- actions -------------------------------- */

  it('marks one as read', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await user.click(await screen.findByRole('button', { name: /mark "You have an offer" as read/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/notifications/n-1/read');
  });

  it('offers no mark-read action on an already read notification', async () => {
    apiGetPaginated.mockResolvedValue(
      paginated([notification({ readAt: '2026-08-02T00:00:00.000Z' })]),
    );

    renderWithQuery(<NotificationInbox />);
    await screen.findByText('You have an offer');

    // Specific to the row — "Mark all as read" in the header also matches /as read/i.
    expect(
      screen.queryByRole('button', { name: /mark "You have an offer" as read/i }),
    ).not.toBeInTheDocument();
  });

  it('marks all as read', async () => {
    const user = userEvent.setup();
    apiPatch.mockResolvedValue({ updated: 4, unread: 0 });

    renderWithQuery(<NotificationInbox />);

    await user.click(await screen.findByRole('button', { name: /mark all as read/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/notifications/read-all');
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('4 notifications marked as read.'),
    );
  });

  it('hides mark-all when nothing is unread', async () => {
    apiGet.mockResolvedValue({ unread: 0 });

    renderWithQuery(<NotificationInbox />);
    await screen.findByText('You have an offer');

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /mark all as read/i })).not.toBeInTheDocument(),
    );
  });

  it('archives a notification', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await user.click(await screen.findByRole('button', { name: /dismiss "You have an offer"/i }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalled());
    expect(String(apiDelete.mock.calls.at(-1)?.[0])).toBe('/notifications/n-1');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Notification dismissed.'));
  });

  it('refreshes the list after an action', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await screen.findByText('You have an offer');
    const before = apiGetPaginated.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /dismiss "You have an offer"/i }));

    await waitFor(() => expect(apiGetPaginated.mock.calls.length).toBeGreaterThan(before));
  });

  it('surfaces a failed action without breaking the list', async () => {
    const user = userEvent.setup();
    apiDelete.mockRejectedValue(new ApiError('FORBIDDEN', 'Not allowed.', 403, [], 'req-9'));

    renderWithQuery(<NotificationInbox />);

    await user.click(await screen.findByRole('button', { name: /dismiss/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not allowed.'));
    expect(screen.getByText('You have an offer')).toBeInTheDocument();
  });

  /* --------------------------------- filters -------------------------------- */

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await screen.findByText('You have an offer');
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'academic');

    await waitFor(() =>
      expect(listUrls().some((url) => url.includes('category=academic'))).toBe(true),
    );
  });

  it('filters to unread only', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await screen.findByText('You have an offer');
    await user.selectOptions(screen.getByLabelText('Filter by read state'), 'true');

    await waitFor(() => expect(listUrls().some((url) => url.includes('unread=true'))).toBe(true));
  });

  /**
   * The API honours only page, limit, category and unread. Offering anything
   * else would be a filter that silently does nothing.
   */
  it('offers no filter the API cannot honour', async () => {
    renderWithQuery(<NotificationInbox />);
    await screen.findByText('You have an offer');

    expect(screen.queryByLabelText(/priority/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sort/i)).not.toBeInTheDocument();

    for (const url of listUrls()) {
      expect(url).not.toContain('priority=');
      expect(url).not.toContain('sort=');
      expect(url).not.toContain('search=');
    }
  });

  /* ------------------------------- pagination ------------------------------- */

  it('pages through when there is more than one page', async () => {
    const user = userEvent.setup();
    apiGetPaginated.mockResolvedValue(
      paginated([notification()], { totalPages: 3, totalItems: 45, hasNextPage: true }),
    );

    renderWithQuery(<NotificationInbox />);

    await screen.findByText('Page 1 of 3');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(listUrls().some((url) => url.includes('page=2'))).toBe(true));
  });

  it('hides pagination for a single page', async () => {
    renderWithQuery(<NotificationInbox />);
    await screen.findByText('You have an offer');

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  /* -------------------------------- security -------------------------------- */

  it('redirects a caller without notification:read', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<NotificationInbox />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('You have an offer')).not.toBeInTheDocument();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests notifications without notification:read', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<NotificationInbox />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(apiGetPaginated).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('sends no user id and touches only notification endpoints', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NotificationInbox />);

    await user.click(await screen.findByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(apiDelete).toHaveBeenCalled());

    for (const url of allUrls()) {
      expect(url.startsWith('/notifications')).toBe(true);
      expect(url).not.toContain('userId');
    }
  });

  /** There is no send endpoint on the server, so the UI must not imply one. */
  it('offers no way to send a notification', async () => {
    renderWithQuery(<NotificationInbox />);
    await screen.findByText('You have an offer');

    expect(screen.queryByRole('button', { name: /send|compose|new notification/i })).not.toBeInTheDocument();
  });
});
