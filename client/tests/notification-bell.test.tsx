import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockAuth, renderWithQuery } from './helpers/render';

const apiGet = vi.fn();
let permissions: string[] = ['notification:read'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student',
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

const { NotificationBell } = await import('@/components/notifications/notification-bell');

const urls = () => apiGet.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  permissions = ['notification:read'];
  apiGet.mockReset();
  apiGet.mockResolvedValue({ unread: 3 });
});

describe('Notification bell', () => {
  it('renders and reads the unread count', async () => {
    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    expect(await screen.findByRole('link', { name: /3 unread/i })).toBeInTheDocument();
    expect(urls()).toContain('/notifications/unread-count');
  });

  it('shows the badge when there are unread notifications', async () => {
    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    const link = await screen.findByRole('link', { name: /3 unread/i });
    expect(link).toHaveTextContent('3');
  });

  /** A zero badge is visual noise — the absence of a badge already says it. */
  it('shows no badge when nothing is unread', async () => {
    apiGet.mockResolvedValue({ unread: 0 });

    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    const link = await screen.findByRole('link', { name: /none unread/i });
    expect(link).not.toHaveTextContent('0');
  });

  it('caps the badge at 99+', async () => {
    apiGet.mockResolvedValue({ unread: 250 });

    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    const link = await screen.findByRole('link', { name: /250 unread/i });
    expect(link).toHaveTextContent('99+');
  });

  it('links to the student inbox', async () => {
    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    const link = await screen.findByRole('link', { name: /unread/i });
    expect(link).toHaveAttribute('href', '/student/notifications');
  });

  it('links to the college inbox when given that portal', async () => {
    renderWithQuery(<NotificationBell inboxHref="/college/notifications" />);

    const link = await screen.findByRole('link', { name: /unread/i });
    expect(link).toHaveAttribute('href', '/college/notifications');
  });

  it('shows nothing while the count is loading', () => {
    apiGet.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    // The bell is there; only the badge waits for a number.
    const link = screen.getByRole('link', { name: /none unread/i });
    expect(link).toBeInTheDocument();
  });

  /** A failed count must not break the shell the bell sits in. */
  it('renders without a badge if the count fails', async () => {
    apiGet.mockRejectedValue(new Error('network'));

    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /none unread/i })).toBeInTheDocument();
  });

  /* -------------------------------- security -------------------------------- */

  it('renders nothing without notification:read', () => {
    permissions = ['student:read_own'];

    const { container } = renderWithQuery(
      <NotificationBell inboxHref="/student/notifications" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests the count without notification:read', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    await waitFor(() => expect(apiGet).not.toHaveBeenCalled());
  });

  it('sends no user id', async () => {
    renderWithQuery(<NotificationBell inboxHref="/student/notifications" />);

    await screen.findByRole('link', { name: /unread/i });

    for (const url of urls()) {
      expect(url).toBe('/notifications/unread-count');
      expect(url).not.toContain('userId');
    }
  });
});
