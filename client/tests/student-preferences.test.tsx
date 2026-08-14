import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { renderWithQuery } from './helpers/render';

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();
const updateUser = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

/** Mutable so a test can model the session before and after a save. */
let user: Record<string, unknown>;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/settings',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user,
    isAuthenticated: true,
    isBootstrapping: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser,
  }),
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

const { default: SettingsPage } = await import('@/app/student/settings/page');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function sessionUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'meera@example.edu',
    firstName: 'Meera',
    lastName: 'Iyer',
    fullName: 'Meera Iyer',
    avatarUrl: null,
    phone: '+919876543210',
    roleKey: 'student',
    permissions: ['student:read_own', 'student:update_own'],
    mustChangePassword: false,
    preferences: {
      theme: 'system',
      locale: 'en-IN',
      emailNotifications: true,
      pushNotifications: true,
    },
    ...overrides,
  };
}

const savePrefs = () => screen.getByRole('button', { name: /save preferences/i });

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  apiDelete.mockReset();
  updateUser.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();

  user = sessionUser();
  apiGet.mockResolvedValue([]);
  apiPatch.mockImplementation(async (url: string, body: Record<string, unknown>) => ({
    user: { ...sessionUser(), preferences: { ...sessionUser().preferences, ...body } },
  }));
});

describe('Student preferences', () => {
  it('renders the current preference values', () => {
    user = sessionUser({
      preferences: {
        theme: 'dark',
        locale: 'en-IN',
        emailNotifications: false,
        pushNotifications: true,
      },
    });

    renderWithQuery(<SettingsPage />);

    expect(screen.getByLabelText('Theme')).toHaveValue('dark');
    expect(screen.getByRole('checkbox', { name: /email notifications/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /push notifications/i })).toBeChecked();
  });

  /** Nothing to save until something differs from the stored value. */
  it('disables the save until a preference changes', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    expect(savePrefs()).toBeDisabled();

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    expect(savePrefs()).toBeEnabled();
  });

  it('sends only what changed', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/auth/preferences');
    // Untouched settings are omitted so the server's partial write leaves them.
    expect(apiPatch.mock.calls.at(-1)?.[1]).toEqual({ theme: 'dark' });
  });

  it('sends a toggled notification flag', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await actor.click(screen.getByRole('checkbox', { name: /email notifications/i }));
    await actor.click(savePrefs());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch.mock.calls.at(-1)?.[1]).toEqual({ emailNotifications: false });
  });

  /** The endpoint answers with the rebuilt session user; the shell must take it. */
  it('syncs the session from the response', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    const patched = updateUser.mock.calls.at(-1)?.[0] as { preferences: { theme: string } };
    expect(patched.preferences.theme).toBe('dark');
  });

  it('confirms on success', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Preferences saved.'));
  });

  it('surfaces a server error and leaves the session untouched', async () => {
    const actor = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'That theme is not recognised.', 400, [], 'req-1'),
    );

    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('That theme is not recognised.'),
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('disables the save while in flight', async () => {
    const actor = userEvent.setup();
    apiPatch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());

    await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled());
  });

  /** A notification opt-out must not read as opting out of security email. */
  it('says security email is always sent', () => {
    renderWithQuery(<SettingsPage />);

    expect(screen.getByText(/security messages such as password resets are always sent/i))
      .toBeInTheDocument();
  });

  it('touches only the preferences endpoint', async () => {
    const actor = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await actor.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await actor.click(savePrefs());
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    for (const call of apiPatch.mock.calls) {
      expect(String(call[0])).toBe('/auth/preferences');
    }
  });
});

/* ============================== account details ============================= */

const { default: ProfilePage } = await import('@/app/student/profile/page');

function studentProfile() {
  return {
    id: 'student-1',
    rollNumber: 'CS22B001',
    registerNumber: null,
    admissionNumber: 'ADM2022001',
    currentSemester: 5,
    status: 'active',
    gender: 'female',
    photoUrl: null,
    programme: 'B.E. Computer Science',
    section: 'A',
    admissionDate: '2022-07-01T00:00:00.000Z',
    dateOfBirth: null,
    bloodGroup: null,
    userId: {
      id: 'user-1',
      firstName: 'Meera',
      lastName: 'Iyer',
      fullName: 'Meera Iyer',
      email: 'meera@example.edu',
      phone: '+919876543210',
    },
    departmentId: { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
    batchId: { id: 'batch-1', name: '2022–2026', code: 'CSE2022' },
    academics: {
      tenthPercent: null,
      twelfthPercent: null,
      diplomaPercent: null,
      currentCgpa: 8.6,
      activeBacklogs: 0,
      totalBacklogs: 0,
      yearGap: 0,
    },
    address: null,
    guardian: null,
    skills: [],
    portfolioLinks: { github: null, linkedin: null, portfolio: null, other: [] },
    placement: { isPlaced: false, isEligible: true, highestPackage: null },
  };
}

const saveAccount = () => screen.getByRole('button', { name: /save account details/i });

describe('Student account details', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue(studentProfile());
    apiPatch.mockImplementation(async (_url: string, body: Record<string, unknown>) => ({
      user: { ...sessionUser(), ...body },
    }));
  });

  it('loads the current name from the session', async () => {
    renderWithQuery(<ProfilePage />);

    expect(await screen.findByLabelText(/^first name/i)).toHaveValue('Meera');
    expect(screen.getByLabelText(/^last name/i)).toHaveValue('Iyer');
  });

  it('disables the save until something changes', async () => {
    renderWithQuery(<ProfilePage />);

    await screen.findByLabelText(/^first name/i);
    expect(saveAccount()).toBeDisabled();
  });

  it('sends only the changed field to the profile endpoint', async () => {
    const actor = userEvent.setup({ delay: null });
    renderWithQuery(<ProfilePage />);

    const first = await screen.findByLabelText(/^first name/i);
    await actor.clear(first);
    await actor.type(first, 'Meenakshi');
    await actor.click(saveAccount());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/auth/profile');
    expect(apiPatch.mock.calls.at(-1)?.[1]).toEqual({ firstName: 'Meenakshi' });
  });

  it('syncs the session so the shell shows the new name', async () => {
    const actor = userEvent.setup({ delay: null });
    renderWithQuery(<ProfilePage />);

    const first = await screen.findByLabelText(/^first name/i);
    await actor.clear(first);
    await actor.type(first, 'Meenakshi');
    await actor.click(saveAccount());

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect((updateUser.mock.calls.at(-1)?.[0] as { firstName: string }).firstName)
      .toBe('Meenakshi');
  });

  /** Client-side guard mirrors the schema's `min(1)`. */
  it('refuses an empty name without calling the API', async () => {
    const actor = userEvent.setup({ delay: null });
    renderWithQuery(<ProfilePage />);

    const first = await screen.findByLabelText(/^first name/i);
    await actor.clear(first);

    expect(await screen.findByText(/first name is required/i)).toBeInTheDocument();
    expect(saveAccount()).toBeDisabled();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('surfaces a server error and leaves the session untouched', async () => {
    const actor = userEvent.setup({ delay: null });
    apiPatch.mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'That name is not acceptable.', 400, [], 'req-2'),
    );

    renderWithQuery(<ProfilePage />);

    const first = await screen.findByLabelText(/^first name/i);
    await actor.clear(first);
    await actor.type(first, 'Meenakshi');
    await actor.click(saveAccount());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('That name is not acceptable.'));
    expect(updateUser).not.toHaveBeenCalled();
  });

  /**
   * `phone` is written by the student profile form below via `/students/me`.
   * Offering it here too would give one field two owners.
   */
  it('offers no phone field in account details', async () => {
    renderWithQuery(<ProfilePage />);

    await screen.findByLabelText(/^first name/i);

    const card = screen.getByText('Account details').closest('div')?.parentElement;
    expect(card).not.toBeNull();
    expect(card?.textContent).not.toMatch(/mobile number/i);
  });
});
