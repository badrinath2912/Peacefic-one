import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { renderWithQuery } from './helpers/render';

const replace = vi.fn();
const push = vi.fn();
const apiPost = vi.fn();

let query = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, back: vi.fn() }),
  usePathname: () => '/verify-email',
  useParams: () => ({}),
  useSearchParams: () => query,
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiPost: (...args: unknown[]) => apiPost(...args) };
});

const { default: VerifyEmailPage } = await import('@/app/(auth)/verify-email/page');

const type = () => userEvent.setup({ delay: null });

const urls = () => apiPost.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  query = new URLSearchParams({ email: 'meera@example.edu' });
  replace.mockReset();
  push.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({ message: 'Your email address has been verified.' });
});

describe('Verify email page', () => {
  it('renders the form with the email carried over from registration', async () => {
    renderWithQuery(<VerifyEmailPage />);

    expect(screen.getByRole('heading', { name: /verify your email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email address/i)).toHaveValue('meera@example.edu');
    expect(screen.getByLabelText(/^verification code/i)).toBeInTheDocument();
  });

  it('states that the code expires', () => {
    renderWithQuery(<VerifyEmailPage />);

    expect(screen.getByText(/expires ten minutes/i)).toBeInTheDocument();
  });

  it('refuses a code that is not six digits, without calling the API', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '123');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText(/6 digits/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('posts email and code to the existing verify endpoint', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '966401');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost).toHaveBeenCalledWith('/auth/verify-email', {
      email: 'meera@example.edu',
      otp: '966401',
    });
  });

  /**
   * Verification returns a message and nothing else. Sending the user into a
   * portal would strand them on a page their account cannot load, because login
   * still refuses `pending_approval`.
   */
  it('does not sign the user in or redirect into a portal', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '966401');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('says the account is awaiting approval, not that it is usable', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '966401');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText(/emailed once it is approved/i)).toBeInTheDocument();
    // The one claim that would be false at this point.
    expect(screen.queryByText(/you can now sign in/i)).not.toBeInTheDocument();
  });

  it('shows an incorrect code on the code field', async () => {
    apiPost.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'That code is incorrect.', 400, [
        { field: 'otp', message: 'Incorrect code' },
      ]),
    );

    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '000000');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('Incorrect code')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Email verified' })).not.toBeInTheDocument();
  });

  it('shows an expired code clearly', async () => {
    apiPost.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'That code is invalid or has expired.', 400, [
        { field: 'otp', message: 'Invalid or expired code' },
      ]),
    );

    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '111111');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
  });

  it('shows a non-field error as a banner', async () => {
    apiPost.mockRejectedValue(
      new ApiError('BUSINESS_RULE', 'Too many incorrect attempts. Request a new code.', 422, []),
    );

    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '222222');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByText(/too many incorrect attempts/i)).toBeInTheDocument();
  });

  /* ---------------------------------- resend --------------------------------- */

  it('resends through the existing resend endpoint with the right purpose', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().click(screen.getByRole('button', { name: 'Send a new code' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost).toHaveBeenCalledWith('/auth/resend-otp', {
      email: 'meera@example.edu',
      purpose: 'email_verification',
    });
    expect(await screen.findByText(/new code is on its way/i)).toBeInTheDocument();
  });

  /** The server enforces one a minute; the button must not invite a 429. */
  it('locks the resend button behind a countdown after sending', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().click(screen.getByRole('button', { name: 'Send a new code' }));

    const button = await screen.findByRole('button', { name: /resend in \d+s/i });
    expect(button).toBeDisabled();
  });

  it('surfaces the server cooldown message rather than failing silently', async () => {
    apiPost.mockRejectedValue(
      new ApiError('RATE_LIMITED', 'Please wait a minute before requesting another code.', 429, []),
    );

    renderWithQuery(<VerifyEmailPage />);

    await type().click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByText(/wait a minute/i)).toBeInTheDocument();
  });

  it('will not resend without an email address', async () => {
    query = new URLSearchParams();

    renderWithQuery(<VerifyEmailPage />);

    await type().click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByText(/enter your email address first/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  /* --------------------------------- secrets --------------------------------- */

  /**
   * The code is a credential. It belongs in the input the user typed it into and
   * nowhere else — not echoed into a heading, a banner, or the success state.
   */
  it('never renders the code as page text', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '966401');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));

    await screen.findByRole('heading', { name: 'Email verified' });

    // Present only as an input value would be fine; as body text it is a leak.
    expect(screen.queryByText('966401')).not.toBeInTheDocument();
  });

  it('only ever calls the two existing auth endpoints', async () => {
    renderWithQuery(<VerifyEmailPage />);

    await type().type(screen.getByLabelText(/^verification code/i), '966401');
    await type().click(screen.getByRole('button', { name: 'Verify email' }));
    await waitFor(() => expect(apiPost).toHaveBeenCalled());

    for (const url of urls()) {
      expect(['/auth/verify-email', '/auth/resend-otp']).toContain(url);
    }
  });
});
