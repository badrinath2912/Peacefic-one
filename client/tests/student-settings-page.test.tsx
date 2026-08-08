import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/api/auth-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const logout = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/settings',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ ...mockAuth([]), logout }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPatch: (...args: unknown[]) => apiPatch(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
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

const { default: StudentSettingsPage } = await import('@/app/student/settings/page');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    id: 'session-1',
    deviceLabel: 'Chrome on Windows',
    ip: '203.0.113.9',
    lastUsedAt: '2026-08-01T10:00:00.000Z',
    createdAt: '2026-07-28T09:00:00.000Z',
    expiresAt: '2026-08-28T09:00:00.000Z',
    isCurrent: true,
    ...overrides,
  };
}

const OTHER = session({
  id: 'session-2',
  deviceLabel: 'Safari on iPhone',
  ip: '198.51.100.4',
  isCurrent: false,
});

const urls = () => [
  ...apiGet.mock.calls.map((call) => String(call[0])),
  ...apiPatch.mock.calls.map((call) => String(call[0])),
  ...apiPost.mock.calls.map((call) => String(call[0])),
  ...apiDelete.mock.calls.map((call) => String(call[0])),
];

async function fillPasswordForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^current password/i), 'OldPassw0rd');
  await user.type(screen.getByLabelText(/^new password/i), 'NewPassw0rd');
  await user.type(screen.getByLabelText(/^confirm new password/i), 'NewPassw0rd');
}

beforeEach(() => {
  replace.mockReset();
  logout.mockReset();
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  apiDelete.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();

  apiGet.mockResolvedValue([session(), OTHER]);
  apiPatch.mockResolvedValue({ message: 'Your password has been changed.' });
  apiPost.mockResolvedValue({ message: 'Signed out on every device.', revoked: 2 });
  apiDelete.mockResolvedValue({ message: 'That device has been signed out.' });
});

describe('Student settings page', () => {
  it('renders both sections', async () => {
    renderWithQuery(<StudentSettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Active sessions' })).toBeInTheDocument();
  });

  /* -------------------------------- password -------------------------------- */

  it('renders the three fields the schema requires', () => {
    renderWithQuery(<StudentSettingsPage />);

    expect(screen.getByLabelText(/^current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument();
  });

  it('masks the fields and can reveal one at a time', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    const current = screen.getByLabelText(/^current password/i);
    expect(current).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show current password/i }));

    expect(current).toHaveAttribute('type', 'text');
    // Revealing one must not reveal the others.
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('type', 'password');
  });

  it('changes the password through PATCH /auth/change-password', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    const [url, body] = apiPatch.mock.calls.at(-1)!;
    expect(String(url)).toBe('/auth/change-password');
    expect(body).toEqual({
      currentPassword: 'OldPassw0rd',
      newPassword: 'NewPassw0rd',
      confirmPassword: 'NewPassw0rd',
    });
  });

  it('never puts a password in a URL', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    for (const url of urls()) {
      expect(url).not.toContain('OldPassw0rd');
      expect(url).not.toContain('NewPassw0rd');
      expect(url).not.toContain('password=');
    }
  });

  it('disables the submit while the change is in flight', async () => {
    const user = userEvent.setup();
    apiPatch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /changing/i })).toBeDisabled());
  });

  it('confirms success and clears every field', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByLabelText(/^current password/i)).toHaveValue(''));
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('');
    expect(screen.getByLabelText(/^confirm new password/i)).toHaveValue('');
  });

  it('refetches the sessions after a password change, since others are revoked', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await screen.findByText('Safari on iPhone');
    const before = apiGet.mock.calls.length;

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(before));
  });

  it('puts a wrong current password on the field it belongs to', async () => {
    const user = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError(
        'VALIDATION_ERROR',
        'Your current password is incorrect.',
        400,
        [{ field: 'currentPassword', message: 'Incorrect password' }],
        'req-7',
      ),
    );

    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
  });

  it('shows a server error without a field path as a form message', async () => {
    const user = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError('BUSINESS_RULE', 'That password was used recently.', 422, [], 'req-8'),
    );

    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText('That password was used recently.')).toBeInTheDocument();
  });

  /** Client-side, before anything is sent. */
  it('refuses a mismatched confirmation without calling the API', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await user.type(screen.getByLabelText(/^current password/i), 'OldPassw0rd');
    await user.type(screen.getByLabelText(/^new password/i), 'NewPassw0rd');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'Different0ne');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  /* -------------------------------- sessions -------------------------------- */

  it('lists the sessions from /auth/sessions with their real metadata', async () => {
    renderWithQuery(<StudentSettingsPage />);

    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Safari on iPhone')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.9')).toBeInTheDocument();
    expect(screen.getByText('198.51.100.4')).toBeInTheDocument();
    expect(apiGet.mock.calls.some((call) => String(call[0]) === '/auth/sessions')).toBe(true);
  });

  it('marks the current session and offers it no sign-out row action', async () => {
    renderWithQuery(<StudentSettingsPage />);

    const current = (await screen.findByText('Chrome on Windows')).closest('li')!;
    expect(within(current).getByText('This device')).toBeInTheDocument();
    expect(
      within(current).queryByRole('button', { name: /sign out chrome on windows/i }),
    ).not.toBeInTheDocument();

    const other = screen.getByText('Safari on iPhone').closest('li')!;
    expect(within(other).queryByText('This device')).not.toBeInTheDocument();
    expect(
      within(other).getByRole('button', { name: /sign out safari on iphone/i }),
    ).toBeInTheDocument();
  });

  it('signs out one device through DELETE /auth/sessions/:id and refreshes', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await screen.findByText('Safari on iPhone');
    const before = apiGet.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /sign out safari on iphone/i }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalled());
    expect(String(apiDelete.mock.calls.at(-1)?.[0])).toBe('/auth/sessions/session-2');

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(before));
  });

  it('shows an empty state rather than an error when there are no sessions', async () => {
    apiGet.mockResolvedValue([]);

    renderWithQuery(<StudentSettingsPage />);

    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('shows a session loading state', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentSettingsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('No active sessions')).not.toBeInTheDocument();
  });

  it('shows a session error with a retry and no internal detail', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Mongo timed out on sessions', 500, [], 'req-11'),
    );

    renderWithQuery(<StudentSettingsPage />);

    expect(await screen.findByText(/could not load your sessions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByText(/req-11/)).toBeInTheDocument();
    expect(screen.queryByText(/Mongo timed out/)).not.toBeInTheDocument();
  });

  /* ----------------------------- sign out everywhere ------------------------- */

  it('asks for confirmation before signing out everywhere', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await user.click(screen.getByRole('button', { name: /^sign out everywhere$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/sign out on every device\?/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('cancels without calling the API', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await user.click(screen.getByRole('button', { name: /^sign out everywhere$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(apiPost).not.toHaveBeenCalled();
  });

  /**
   * `logoutAll` revokes every session with no exception and the controller
   * clears the refresh cookie, so this browser is signed out too. The UI must
   * say so and then hand over to the normal sign-out flow.
   */
  it('signs out everywhere and ends the current session', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    expect(
      screen.getByText(/signs out every device, including this one/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^sign out everywhere$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/including this browser/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /sign out everywhere/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/auth/logout-all');

    // Hands back to the app's own sign-out, which clears state and redirects.
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  /* -------------------------------- security -------------------------------- */

  it('sends no user id on any request', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await screen.findByText('Safari on iPhone');
    await user.click(screen.getByRole('button', { name: /sign out safari on iphone/i }));
    await waitFor(() => expect(apiDelete).toHaveBeenCalled());

    for (const url of urls()) {
      expect(url).not.toContain('userId');
      expect(url).not.toContain('/users/');
    }

    for (const call of apiPatch.mock.calls) {
      expect(call[1]).not.toHaveProperty('userId');
    }
  });

  it('touches only the four auth endpoints that exist', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentSettingsPage />);

    await fillPasswordForm(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    const allowed = ['/auth/sessions', '/auth/change-password', '/auth/logout-all'];
    for (const url of urls()) {
      expect(allowed.some((prefix) => url.startsWith(prefix))).toBe(true);
    }
  });

  /* ------------------------------- preferences ------------------------------ */

  /**
   * `UserModel.preferences` is real and read on `/auth/session`, but nothing
   * writes it. No control for it may appear until an endpoint does.
   */
  it('requests no preferences endpoint, because none exists', async () => {
    renderWithQuery(<StudentSettingsPage />);

    await screen.findByText('Chrome on Windows');

    for (const url of urls()) {
      expect(url).not.toContain('preferences');
    }
  });

  it('renders no preference control that could not persist', async () => {
    renderWithQuery(<StudentSettingsPage />);

    await screen.findByText('Chrome on Windows');

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/theme/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/locale/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email notifications/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/push notifications/i)).not.toBeInTheDocument();
  });
});
