import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiPatch = vi.fn();
const refreshUser = vi.fn();
const logout = vi.fn();

/** Mutable so a test can model the session before and after the change. */
let user: Record<string, unknown> | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/change-password',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user,
    isAuthenticated: Boolean(user),
    isBootstrapping: false,
    login: vi.fn(),
    logout,
    refreshUser,
    updateUser: vi.fn(),
  }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiPatch: (...args: unknown[]) => apiPatch(...args) };
});

const { default: ChangePasswordPage } = await import('@/app/change-password/page');

const CURRENT = 'OldPassw0rd';
const NEXT = 'NewPassw0rd';

async function fillForm(actor: ReturnType<typeof userEvent.setup>) {
  await actor.type(screen.getByLabelText(/^current password/i), CURRENT);
  await actor.type(screen.getByLabelText(/^new password/i), NEXT);
  await actor.type(screen.getByLabelText(/^confirm new password/i), NEXT);
}

const submit = () => screen.getByRole('button', { name: /update password and continue/i });

beforeEach(() => {
  /**
   * `RouteGuard` only skips its own redirect when the path already starts with
   * `/change-password`. jsdom defaults to `/`, which would make the guard fire
   * and pollute the redirect assertions — so put the browser where it really is.
   */
  window.history.replaceState({}, '', '/change-password');

  replace.mockReset();
  apiPatch.mockReset();
  refreshUser.mockReset();
  logout.mockReset();

  // The state that sends a user here in the first place.
  user = {
    id: 'user-1',
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera@example.edu',
    roleKey: 'student',
    permissions: ['student:read_own'],
    mustChangePassword: true,
  };

  apiPatch.mockResolvedValue({ message: 'Your password has been changed.' });
  // The server clears the flag, so a refreshed session reflects that.
  refreshUser.mockImplementation(async () => {
    if (user) user.mustChangePassword = false;
  });
});

describe('Change password page', () => {
  it('renders and explains why it is required', () => {
    renderWithQuery(<ChangePasswordPage />);

    expect(screen.getByRole('heading', { name: /change your password/i })).toBeInTheDocument();
    expect(screen.getByText(/must set a new password before you can continue/i)).toBeInTheDocument();
    expect(screen.getByText(/why you are seeing this/i)).toBeInTheDocument();
  });

  it('shows the Peacefic brand', () => {
    renderWithQuery(<ChangePasswordPage />);

    expect(screen.getByText('Peacefic One')).toBeInTheDocument();
  });

  it('renders the three fields the schema requires', () => {
    renderWithQuery(<ChangePasswordPage />);

    expect(screen.getByLabelText(/^current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument();
  });

  /* -------------------------------- validation ------------------------------- */

  it('refuses an empty submission without calling the API', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await actor.click(submit());

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('rejects a weak new password using the shared rules', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await actor.type(screen.getByLabelText(/^current password/i), CURRENT);
    await actor.type(screen.getByLabelText(/^new password/i), 'weak');
    await actor.type(screen.getByLabelText(/^confirm new password/i), 'weak');
    await actor.click(submit());

    await waitFor(() => expect(apiPatch).not.toHaveBeenCalled());
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('rejects a mismatched confirmation', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await actor.type(screen.getByLabelText(/^current password/i), CURRENT);
    await actor.type(screen.getByLabelText(/^new password/i), NEXT);
    await actor.type(screen.getByLabelText(/^confirm new password/i), 'Different0ne');
    await actor.click(submit());

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  /** The schema forbids reusing the current password. */
  it('rejects a new password identical to the current one', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await actor.type(screen.getByLabelText(/^current password/i), CURRENT);
    await actor.type(screen.getByLabelText(/^new password/i), CURRENT);
    await actor.type(screen.getByLabelText(/^confirm new password/i), CURRENT);
    await actor.click(submit());

    expect(await screen.findByText(/must differ from the current one/i)).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  /* --------------------------------- success -------------------------------- */

  it('calls the existing change-password endpoint with the schema body', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/auth/change-password');
    expect(apiPatch.mock.calls.at(-1)?.[1]).toEqual({
      currentPassword: CURRENT,
      newPassword: NEXT,
      confirmPassword: NEXT,
    });
  });

  /**
   * The whole point of the page: the guard reads `mustChangePassword` from the
   * session, so it must be refreshed before navigating or the user is bounced
   * straight back here.
   */
  it('refreshes the session before redirecting, clearing mustChangePassword', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(user?.mustChangePassword).toBe(false);
  });

  it('redirects to the portal for the caller\'s role', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls.at(-1)?.[0])).toBe('/student');
  });

  it('never sends the user back to change-password', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    await waitFor(() => expect(replace).toHaveBeenCalled());

    for (const call of replace.mock.calls) {
      expect(String(call[0])).not.toContain('/change-password');
    }
  });

  it('disables the submit while the request is in flight', async () => {
    const actor = userEvent.setup();
    apiPatch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    await waitFor(() => expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled());
  });

  /* ---------------------------------- errors -------------------------------- */

  it('puts a wrong current password on its own field', async () => {
    const actor = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError(
        'VALIDATION_ERROR',
        'Your current password is incorrect.',
        400,
        [{ field: 'currentPassword', message: 'Incorrect password' }],
        'req-1',
      ),
    );

    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows a reuse rejection as a banner', async () => {
    const actor = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError('BUSINESS_RULE', 'That password was used recently.', 422, [], 'req-2'),
    );

    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    expect(await screen.findByText('That password was used recently.')).toBeInTheDocument();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('handles an unexpected failure without leaking the transport error', async () => {
    const actor = userEvent.setup();
    apiPatch.mockRejectedValue(new Error('socket hang up'));

    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);
    await actor.click(submit());

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/socket hang up/i)).not.toBeInTheDocument();
  });

  /* --------------------------------- security ------------------------------- */

  it('masks every password field', () => {
    renderWithQuery(<ChangePasswordPage />);

    expect(screen.getByLabelText(/^current password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^confirm new password/i)).toHaveAttribute('type', 'password');
  });

  it('never renders a password value as page text', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await fillForm(actor);

    const text = document.body.textContent ?? '';
    expect(text).not.toContain(CURRENT);
    expect(text).not.toContain(NEXT);
  });

  it('offers a way out for someone who cannot complete it', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<ChangePasswordPage />);

    await actor.click(screen.getByRole('button', { name: /sign out instead/i }));

    expect(logout).toHaveBeenCalled();
  });
});
