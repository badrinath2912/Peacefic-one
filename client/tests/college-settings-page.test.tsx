import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnCollege } from '@/api/college-queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

/** Only college_admin holds the write permissions. */
const ADMIN = ['college:read', 'college:update', 'college:settings'];
let permissions: string[] = [...ADMIN];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/settings',
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
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPatch: (...args: unknown[]) => apiPatch(...args),
  };
});

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(() => undefined, {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  });
  return { __esModule: true, default: toast, toast };
});

const { default: CollegeSettingsPage } = await import('@/app/college/settings/page');

function college(overrides: Partial<OwnCollege> = {}): OwnCollege {
  return {
    id: 'college-1',
    name: 'PIT Institute of Technology',
    code: 'PIT',
    type: 'engineering',
    affiliatedTo: 'Anna University',
    accreditation: [],
    establishedYear: 2001,
    logoUrl: null,
    website: 'https://pit.example.edu',
    email: 'info@pit.example.edu',
    phone: '+919876543210',
    address: {
      line1: '1 Campus Road',
      line2: null,
      city: 'Coimbatore',
      district: null,
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '641004',
    },
    timezone: 'Asia/Kolkata',
    academicYearStartMonth: 6,
    status: 'active',
    primaryContact: {
      name: 'Asha Rao',
      email: 'asha@pit.example.edu',
      phone: '+919812345678',
      designation: 'Registrar',
    },
    settings: {
      allowStudentSelfRegistration: false,
      attendanceThresholdPercent: 75,
      gradingScale: 'gpa_10',
      certificateSignatory: { name: 'Asha Rao', designation: 'Registrar', signatureUrl: null },
    },
    stats: { totalStudents: 420, totalFaculty: 38, totalDepartments: 6, totalBatches: 12 },
    ...overrides,
  };
}

const urls = () => apiGet.mock.calls.map((call) => String(call[0]));
const saveProfile = () => screen.getByRole('button', { name: /save institution details/i });
const saveSettings = () => screen.getByRole('button', { name: /^save settings$/i });

beforeEach(() => {
  permissions = [...ADMIN];
  replace.mockReset();
  apiGet.mockReset();
  apiPatch.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();

  apiGet.mockResolvedValue(college());
  apiPatch.mockResolvedValue(college());
});

describe('College settings page', () => {
  /* ---------------------------------- load ---------------------------------- */

  it('renders and loads the institution', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    expect(
      await screen.findByRole('heading', { name: /institution settings/i }),
    ).toBeInTheDocument();
    expect(urls()).toContain('/colleges/me');
  });

  it('shows the registration details as read only', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    await screen.findByText('PIT');
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('populates the editable profile fields', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    expect(await screen.findByLabelText(/institution name/i)).toHaveValue(
      'PIT Institute of Technology',
    );
    expect(screen.getByLabelText(/^city/i)).toHaveValue('Coimbatore');
    expect(screen.getByLabelText(/^timezone/i)).toHaveValue('Asia/Kolkata');
  });

  it('populates the settings fields', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    expect(await screen.findByLabelText(/attendance threshold/i)).toHaveValue(75);
    expect(screen.getByLabelText(/grading scale/i)).toHaveValue('gpa_10');
    expect(screen.getByRole('checkbox', { name: /register themselves/i })).not.toBeChecked();
  });

  /** The code is the tenant's identity and is fixed at registration. */
  it('offers no way to edit the institution code', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    await screen.findByText('PIT');
    expect(screen.queryByLabelText(/institution code/i)).not.toBeInTheDocument();
  });

  /** It never leaves the server; it must not appear anywhere on the page. */
  it('never shows or offers the join code', async () => {
    renderWithQuery(<CollegeSettingsPage />);

    await screen.findByText('PIT');

    // The enrolment copy mentions a join code to explain how students join, so
    // the assertion is that no *input* for one exists and no value is shown.
    expect(screen.queryByRole('textbox', { name: /join code/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^join code$/i)).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').toMatch(/never displayed here/i);
  });

  /* --------------------------------- saving --------------------------------- */

  it('saves the profile to the college endpoint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const name = await screen.findByLabelText(/institution name/i);
    await user.clear(name);
    await user.type(name, 'PIT Institute');
    await user.click(saveProfile());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/colleges/me');
    expect((apiPatch.mock.calls.at(-1)?.[1] as Record<string, unknown>).name).toBe('PIT Institute');
  });

  it('saves settings to the settings endpoint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const threshold = await screen.findByLabelText(/attendance threshold/i);
    await user.clear(threshold);
    await user.type(threshold, '85');
    await user.click(saveSettings());

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/colleges/me/settings');
    expect(
      (apiPatch.mock.calls.at(-1)?.[1] as Record<string, unknown>).attendanceThresholdPercent,
    ).toBe(85);
  });

  it('confirms a successful save', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const threshold = await screen.findByLabelText(/attendance threshold/i);
    await user.clear(threshold);
    await user.type(threshold, '85');
    await user.click(saveSettings());

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Settings saved.'));
  });

  it('disables the submit while saving', async () => {
    const user = userEvent.setup({ delay: null });
    apiPatch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<CollegeSettingsPage />);

    const threshold = await screen.findByLabelText(/attendance threshold/i);
    await user.clear(threshold);
    await user.type(threshold, '85');
    await user.click(saveSettings());

    await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled());
  });

  /* -------------------------------- validation ------------------------------ */

  it('rejects an out-of-range threshold before calling the API', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const threshold = await screen.findByLabelText(/attendance threshold/i);
    await user.clear(threshold);
    await user.type(threshold, '150');
    await user.click(saveSettings());

    await waitFor(() => expect(apiPatch).not.toHaveBeenCalled());
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('rejects a malformed institution email client-side', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const email = await screen.findByLabelText(/^institution email/i);
    await user.clear(email);
    await user.type(email, 'not-an-email');
    await user.click(saveProfile());

    await waitFor(() => expect(apiPatch).not.toHaveBeenCalled());
  });

  it('puts a server field error on its field', async () => {
    const user = userEvent.setup({ delay: null });
    apiPatch.mockRejectedValue(
      new ApiError(
        'VALIDATION_ERROR',
        'Validation failed',
        400,
        [{ field: 'name', message: 'That name is already taken' }],
        'req-1',
      ),
    );

    renderWithQuery(<CollegeSettingsPage />);

    const name = await screen.findByLabelText(/institution name/i);
    await user.clear(name);
    await user.type(name, 'Taken');
    await user.click(saveProfile());

    expect(await screen.findByText('That name is already taken')).toBeInTheDocument();
  });

  /* ---------------------------------- states -------------------------------- */

  it('shows a loading state', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<CollegeSettingsPage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry and no internal detail', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Mongo timed out on colleges', 500, [], 'req-9'),
    );

    renderWithQuery(<CollegeSettingsPage />);

    expect(await screen.findByText(/could not load your institution/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/Mongo timed out/)).not.toBeInTheDocument();
  });

  /* -------------------------------- permissions ----------------------------- */

  it('shows the profile read-only without college:update', async () => {
    permissions = ['college:read', 'college:settings'];

    renderWithQuery(<CollegeSettingsPage />);

    await screen.findByText('PIT');
    expect(screen.queryByRole('button', { name: /save institution details/i })).not.toBeInTheDocument();

    const card = (await screen.findByText('Institution details')).closest('div')!.parentElement!;
    expect(within(card).getByText('View only')).toBeInTheDocument();
  });

  it('shows the settings read-only without college:settings', async () => {
    permissions = ['college:read', 'college:update'];

    renderWithQuery(<CollegeSettingsPage />);

    await screen.findByText('PIT');
    expect(screen.queryByRole('button', { name: /^save settings$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only an administrator can change these/i)).toBeInTheDocument();
  });

  it('redirects a caller without college:read', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<CollegeSettingsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('PIT')).not.toBeInTheDocument();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests the college without college:read', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<CollegeSettingsPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('touches only the college endpoints', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<CollegeSettingsPage />);

    const threshold = await screen.findByLabelText(/attendance threshold/i);
    await user.clear(threshold);
    await user.type(threshold, '80');
    await user.click(saveSettings());
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    for (const url of [...urls(), ...apiPatch.mock.calls.map((c) => String(c[0]))]) {
      expect(url.startsWith('/colleges/me')).toBe(true);
    }
  });
});
