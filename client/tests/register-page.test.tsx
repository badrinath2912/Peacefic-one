import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiPost = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/register',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiPost: (...args: unknown[]) => apiPost(...args) };
});

const { default: RegisterPage } = await import('@/app/(auth)/register/institution/page');

/** Fills every required field with values the shared schema accepts. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^institution name/i), 'PIT Institute of Technology');
  await user.type(screen.getByLabelText(/^institution code/i), 'PIT');
  await user.type(screen.getByLabelText(/^year established/i), '2001');
  await user.type(screen.getByLabelText(/^institution email/i), 'info@pit.example.edu');
  await user.type(screen.getByLabelText(/^institution phone/i), '+919876543210');

  await user.type(screen.getByLabelText(/^address line 1/i), '1 Campus Road');
  await user.type(screen.getByLabelText(/^city/i), 'Coimbatore');
  await user.type(screen.getByLabelText(/^state/i), 'Tamil Nadu');
  await user.type(screen.getByLabelText(/^pin code/i), '641004');

  await user.type(screen.getByLabelText(/^first name/i), 'Asha');
  await user.type(screen.getByLabelText(/^last name/i), 'Rao');
  await user.type(screen.getByLabelText(/^work email/i), 'asha@pit.example.edu');
  await user.type(screen.getByLabelText(/^mobile number/i), '+919812345678');
  await user.type(screen.getByLabelText(/^designation/i), 'Registrar');
  await user.type(screen.getByLabelText(/^password/i), 'CorrectHorse9');
  await user.type(screen.getByLabelText(/^confirm password/i), 'CorrectHorse9');

  await user.click(screen.getByRole('checkbox'));
}

const submit = () => screen.getByRole('button', { name: /create account/i });

beforeEach(() => {
  replace.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({
    email: 'asha@pit.example.edu',
    message: 'Registration received. Verify your email, then a reviewer will approve your institution.',
  });
});

describe('Register page', () => {
  it('renders the registration form', () => {
    renderWithQuery(<RegisterPage />);

    expect(screen.getByRole('heading', { name: /register your institution/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^institution name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^work email/i)).toBeInTheDocument();
    expect(submit()).toBeInTheDocument();
  });

  it('groups the form into institution, address and administrator', () => {
    renderWithQuery(<RegisterPage />);

    expect(screen.getByRole('heading', { name: 'Institution' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Administrator account' })).toBeInTheDocument();
  });

  /* -------------------------------- validation ------------------------------- */

  it('refuses an empty submission without calling the API', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await user.click(submit());

    // The message comes from the shared schema, which words it "College name".
    expect(await screen.findByText(/college name is required/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/^work email/i));
    await user.type(screen.getByLabelText(/^work email/i), 'not-an-email');
    await user.click(submit());

    await waitFor(() => expect(apiPost).not.toHaveBeenCalled());
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('rejects a password mismatch', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/^confirm password/i));
    await user.type(screen.getByLabelText(/^confirm password/i), 'DifferentPass9');
    await user.click(submit());

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('requires the terms to be accepted', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    // Untick it again.
    await user.click(screen.getByRole('checkbox'));
    await user.click(submit());

    expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  /* --------------------------------- success -------------------------------- */

  it('posts to the existing registration endpoint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(String(apiPost.mock.calls.at(-1)?.[0])).toBe('/auth/register/college');
  });

  it('sends the nested college and admin shape the schema defines', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    await waitFor(() => expect(apiPost).toHaveBeenCalled());

    const body = (apiPost.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
    const college = body.college as Record<string, unknown>;
    const admin = body.admin as Record<string, unknown>;

    expect(body).toHaveProperty('college');
    expect(body).toHaveProperty('admin');
    expect(body.acceptTerms).toBe(true);
    expect(college.code).toBe('PIT');
    expect(college.establishedYear).toBe(2001);
    expect(admin.email).toBe('asha@pit.example.edu');
  });

  /**
   * The endpoint deliberately creates no session — it answers with a message
   * about verification and approval — so the page must not route into a portal.
   */
  it('shows what happens next instead of signing the user in', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    // Scoped to the heading: the server's message opens with the same words.
    expect(
      await screen.findByRole('heading', { name: /registration received/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/asha@pit.example.edu/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute('href', '/login');
    expect(replace).not.toHaveBeenCalled();
  });

  it('disables the submit while the request is in flight', async () => {
    const user = userEvent.setup({ delay: null });
    apiPost.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled(),
    );
  });

  /** Guards against a double-submit creating two institutions. */
  it('does not submit twice while pending', async () => {
    const user = userEvent.setup({ delay: null });
    apiPost.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /creating account/i }));
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  /* ---------------------------------- errors -------------------------------- */

  it('puts a duplicate institution code on its own field', async () => {
    const user = userEvent.setup({ delay: null });
    apiPost.mockRejectedValue(
      new ApiError(
        'DUPLICATE_RESOURCE',
        'That college code is already registered.',
        409,
        [{ field: 'college.code', message: 'Already in use' }],
        'req-1',
      ),
    );

    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    expect(await screen.findByText('Already in use')).toBeInTheDocument();
  });

  it('shows a server error without a field path as a banner', async () => {
    const user = userEvent.setup({ delay: null });
    apiPost.mockRejectedValue(
      new ApiError('DUPLICATE_RESOURCE', 'That email address is already registered.', 409, [], 'req-2'),
    );

    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    expect(await screen.findByText('That email address is already registered.')).toBeInTheDocument();
  });

  it('handles an unexpected failure safely', async () => {
    const user = userEvent.setup({ delay: null });
    apiPost.mockRejectedValue(new Error('socket hang up'));

    renderWithQuery(<RegisterPage />);

    await fillValidForm(user);
    await user.click(submit());

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    // The raw transport error is not shown to the visitor.
    expect(screen.queryByText(/socket hang up/i)).not.toBeInTheDocument();
  });

  /* -------------------------------- navigation ------------------------------ */

  it('links back to sign in', () => {
    renderWithQuery(<RegisterPage />);

    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login');
  });

  /** Registration is public: nothing may be requested before submission. */
  it('requests nothing on load', () => {
    renderWithQuery(<RegisterPage />);

    expect(apiPost).not.toHaveBeenCalled();
  });
});
