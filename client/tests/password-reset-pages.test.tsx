import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { renderWithQuery } from './helpers/render';

const apiPost = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/forgot-password',
  useParams: () => ({}),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiPost: (...args: unknown[]) => apiPost(...args) };
});

const { default: ForgotPasswordPage } = await import('@/app/(auth)/forgot-password/page');
const { default: ResetPasswordPage } = await import('@/app/(auth)/reset-password/page');

const TOKEN = 'reset-token-that-is-long-enough';

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ message: 'ok' });
  searchParams = new URLSearchParams();
});

/* ============================== forgot password ============================= */

describe('Forgot password page', () => {
  const submit = () => screen.getByRole('button', { name: /send reset instructions/i });

  it('renders the form', () => {
    renderWithQuery(<ForgotPasswordPage />);

    expect(screen.getByRole('heading', { name: /forgot your password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(submit()).toBeInTheDocument();
  });

  it('requires an email', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ForgotPasswordPage />);

    await user.click(submit());

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('rejects an invalid email without calling the API', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.click(submit());

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('posts to the existing endpoint', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.edu');
    await user.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/auth/forgot-password');
    expect(apiPost.mock.calls.at(-1)?.[1]).toEqual({ email: 'asha@example.edu' });
  });

  it('disables the submit while sending', async () => {
    const user = userEvent.setup();
    apiPost.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.edu');
    await user.click(submit());

    await waitFor(() => expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled());
  });

  /**
   * The server answers identically whether or not the address exists. The page
   * must not turn that into a confirmation that the account was found.
   */
  it('confirms without revealing whether the account exists', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.edu');
    await user.click(submit());

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/account (was )?found/i);
    expect(body).not.toMatch(/no account/i);
    expect(body).not.toMatch(/does not exist/i);
  });

  it('surfaces a rate-limit response', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(
      new ApiError('RATE_LIMITED', 'Too many attempts. Try again later.', 429, [], 'req-1'),
    );

    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.edu');
    await user.click(submit());

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it('handles an unexpected failure without leaking the transport error', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(new Error('socket hang up'));

    renderWithQuery(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'asha@example.edu');
    await user.click(submit());

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/socket hang up/i)).not.toBeInTheDocument();
  });

  it('links back to sign in', () => {
    renderWithQuery(<ForgotPasswordPage />);

    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login');
  });
});

/* ============================== reset password ============================== */

describe('Reset password page', () => {
  const submit = () => screen.getByRole('button', { name: /^reset password$/i });

  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'CorrectHorse9');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'CorrectHorse9');
  }

  it('renders the form when a token is present', () => {
    searchParams = new URLSearchParams({ token: TOKEN });
    renderWithQuery(<ResetPasswordPage />);

    expect(screen.getByRole('heading', { name: /set a new password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument();
  });

  /** A link without a token can never succeed, so it is refused up front. */
  it('refuses a link with no token', () => {
    renderWithQuery(<ResetPasswordPage />);

    expect(screen.getByRole('heading', { name: /link is incomplete/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/reset code/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  /** The token belongs in the request body, never on screen. */
  it('never displays the token', () => {
    searchParams = new URLSearchParams({ token: TOKEN });
    renderWithQuery(<ResetPasswordPage />);

    expect(document.body.textContent ?? '').not.toContain(TOKEN);
  });

  it('sends the token from the URL together with the code', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });

    renderWithQuery(<ResetPasswordPage />);
    await fillForm(user);
    await user.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/auth/reset-password');
    expect(apiPost.mock.calls.at(-1)?.[1]).toEqual({
      token: TOKEN,
      otp: '123456',
      newPassword: 'CorrectHorse9',
      confirmPassword: 'CorrectHorse9',
    });
  });

  it('rejects a password mismatch before calling the API', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });

    renderWithQuery(<ResetPasswordPage />);
    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'CorrectHorse9');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'DifferentPass9');
    await user.click(submit());

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('rejects a weak password using the shared rules', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });

    renderWithQuery(<ResetPasswordPage />);
    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'weak');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'weak');
    await user.click(submit());

    await waitFor(() => expect(apiPost).not.toHaveBeenCalled());
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('puts an invalid code on the code field', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });
    apiPost.mockRejectedValue(
      new ApiError(
        'VALIDATION_ERROR',
        'That code is invalid or has expired.',
        400,
        [{ field: 'otp', message: 'Invalid or expired code' }],
        'req-2',
      ),
    );

    renderWithQuery(<ResetPasswordPage />);
    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
  });

  /** An expired or already-used link arrives as an authentication error. */
  it('explains an expired or reused link', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });
    apiPost.mockRejectedValue(
      new ApiError(
        'AUTHENTICATION_ERROR',
        'This reset link is invalid or has already been used.',
        401,
        [],
        'req-3',
      ),
    );

    renderWithQuery(<ResetPasswordPage />);
    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByText(/already been used/i)).toBeInTheDocument();
  });

  it('confirms success and says every device was signed out', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });

    renderWithQuery(<ResetPasswordPage />);
    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByRole('heading', { name: /password reset/i })).toBeInTheDocument();
    expect(screen.getByText(/every device has been signed out/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute('href', '/login');
  });

  it('disables the submit while resetting', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ token: TOKEN });
    apiPost.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<ResetPasswordPage />);
    await fillForm(user);
    await user.click(submit());

    await waitFor(() => expect(screen.getByRole('button', { name: /resetting/i })).toBeDisabled());
  });
});
