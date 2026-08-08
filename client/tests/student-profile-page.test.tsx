import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnStudentProfile } from '@/api/queries';
import { ApiError } from '@/lib/api-client';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiPatch = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastPlain = vi.fn();

let permissions: string[] = ['student:read_own', 'student:update_own'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/profile',
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
    apiPatch: (...args: unknown[]) => apiPatch(...args),
  };
});

vi.mock('react-hot-toast', () => {
  const toast = Object.assign((...args: unknown[]) => toastPlain(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  });
  return { __esModule: true, default: toast, toast };
});

const { default: StudentProfilePage } = await import('@/app/student/profile/page');

function profile(overrides: Partial<OwnStudentProfile> = {}): OwnStudentProfile {
  return {
    id: 'student-1',
    rollNumber: 'CS22B001',
    registerNumber: '731122104001',
    admissionNumber: 'ADM2022001',
    currentSemester: 5,
    status: 'active',
    gender: 'female',
    photoUrl: null,
    programme: 'B.E. Computer Science',
    section: 'A',
    admissionDate: '2022-07-01T00:00:00.000Z',
    dateOfBirth: '2004-05-12T00:00:00.000Z',
    bloodGroup: 'O+',
    userId: {
      id: 'user-1',
      firstName: 'Meera',
      lastName: 'Iyer',
      fullName: 'Meera Iyer',
      email: 'meera.iyer@example.edu',
      phone: '+919876543210',
    },
    departmentId: { id: 'dept-1', name: 'Computer Science', code: 'CSE' },
    batchId: { id: 'batch-1', name: '2022–2026', code: 'CSE2022' },
    academics: {
      tenthPercent: 92,
      twelfthPercent: 89,
      diplomaPercent: null,
      currentCgpa: 8.6,
      activeBacklogs: 0,
      totalBacklogs: 1,
      yearGap: 0,
    },
    address: {
      line1: '12 Anna Salai',
      line2: null,
      city: 'Chennai',
      district: 'Tiruvallur',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600002',
    },
    guardian: {
      name: 'Lakshmi Iyer',
      relation: 'Mother',
      phone: '+919812345678',
      email: null,
    },
    skills: [
      { name: 'React', level: 'advanced', verified: true, verifiedVia: 'exam-1' },
      { name: 'SQL', level: 'intermediate', verified: false, verifiedVia: null },
    ],
    portfolioLinks: {
      github: 'https://github.com/meera',
      linkedin: null,
      portfolio: null,
      other: [],
    },
    placement: { isPlaced: false, isEligible: true, highestPackage: null },
    ...overrides,
  };
}

const urls = () => apiGet.mock.calls.map((call) => String(call[0]));
const patchBody = () => apiPatch.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /edit profile/i }));
  return screen.findByRole('button', { name: /save changes/i });
}

beforeEach(() => {
  permissions = ['student:read_own', 'student:update_own'];
  replace.mockReset();
  apiGet.mockReset();
  apiPatch.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastPlain.mockReset();

  apiGet.mockResolvedValue(profile());
  apiPatch.mockResolvedValue(profile());
});

describe('Student profile page', () => {
  /* ---------------------------------- read ---------------------------------- */

  it('renders the profile', async () => {
    renderWithQuery(<StudentProfilePage />);

    expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();
    expect(screen.getByText('meera.iyer@example.edu')).toBeInTheDocument();
    expect(screen.getByText('CS22B001')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText('Chennai')).toBeInTheDocument();
    expect(screen.getByText('Lakshmi Iyer')).toBeInTheDocument();
    expect(screen.getByText('https://github.com/meera')).toBeInTheDocument();
  });

  it('shows the institutional record as read only', async () => {
    renderWithQuery(<StudentProfilePage />);

    await screen.findByText('Meera Iyer');

    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('8.6')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<StudentProfilePage />);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('CS22B001')).not.toBeInTheDocument();
  });

  it('shows an error state with a retry and no internal detail', async () => {
    apiGet.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Mongo timed out on students', 500, [], 'req-42'),
    );

    renderWithQuery(<StudentProfilePage />);

    expect(await screen.findByText(/could not load your profile/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByText(/req-42/)).toBeInTheDocument();
    expect(screen.queryByText(/Mongo timed out/)).not.toBeInTheDocument();
  });

  /* ---------------------------------- edit ---------------------------------- */

  it('populates the editable fields with the saved values', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    await openEditor(user);

    expect(screen.getByLabelText('Mobile number')).toHaveValue('+919876543210');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('2004-05-12');
    expect(screen.getByLabelText('Gender')).toHaveValue('female');
    expect(screen.getByLabelText('Blood group')).toHaveValue('O+');
    expect(screen.getByLabelText('City')).toHaveValue('Chennai');
    expect(screen.getByLabelText('Skill 1')).toHaveValue('React');
  });

  it('offers no input for an institutional field', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    await openEditor(user);

    for (const label of [
      /roll number/i,
      /register number/i,
      /admission number/i,
      /department/i,
      /batch/i,
      /cgpa/i,
      /semester/i,
      /backlog/i,
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it('hides the edit action from a caller without student:update_own', async () => {
    permissions = ['student:read_own'];

    renderWithQuery(<StudentProfilePage />);
    await screen.findByText('Meera Iyer');

    expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  /* ---------------------------------- save ---------------------------------- */

  it('saves through PATCH /students/me', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'B+');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(String(apiPatch.mock.calls.at(-1)?.[0])).toBe('/students/me');
  });

  /** Only what changed: sending `skills` would reset their verified mark. */
  it('sends only the field that changed', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'B+');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    expect(patchBody()).toEqual({ bloodGroup: 'B+' });
    expect(patchBody()).not.toHaveProperty('skills');
    expect(patchBody()).not.toHaveProperty('address');
  });

  it('never sends an institutional field or a student id', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'A+');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    const body = patchBody()!;
    for (const key of [
      'id',
      'studentId',
      'rollNumber',
      'registerNumber',
      'admissionNumber',
      'departmentId',
      'batchId',
      'academics',
      'currentCgpa',
      'currentSemester',
      'status',
      'placement',
      'userId',
    ]) {
      expect(body).not.toHaveProperty(key);
    }

    expect(Object.keys(body).every((key) =>
      ['phone', 'dateOfBirth', 'gender', 'bloodGroup', 'address', 'guardian', 'skills', 'portfolioLinks'].includes(key),
    )).toBe(true);
  });

  it('confirms the save and returns to the read view', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'B+');
    await user.click(save);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Profile updated.'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument(),
    );
  });

  it('does not call the API when nothing changed', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.click(save);

    await waitFor(() => expect(toastPlain).toHaveBeenCalled());
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('restores the saved values when the edit is cancelled', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'AB-');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Back to the read view, still showing what the server holds.
    expect(await screen.findByText('O+')).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();

    await openEditor(user);
    expect(screen.getByLabelText('Blood group')).toHaveValue('O+');
  });

  it('disables save while the request is in flight', async () => {
    const user = userEvent.setup();
    apiPatch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'B+');
    await user.click(save);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled(),
    );
  });

  /* ------------------------------- validation ------------------------------- */

  it('puts a server field error on the field it belongs to', async () => {
    const user = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError(
        'VALIDATION_ERROR',
        'Validation failed',
        400,
        [{ field: 'phone', message: 'Must be a valid phone number' }],
        'req-9',
      ),
    );

    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Mobile number'));
    await user.type(screen.getByLabelText('Mobile number'), '+919000000000');
    await user.click(save);

    expect(await screen.findByText('Must be a valid phone number')).toBeInTheDocument();
    // Still editing, so the correction can be made.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows a server error without a field path as a form message', async () => {
    const user = userEvent.setup();
    apiPatch.mockRejectedValue(
      new ApiError('BUSINESS_RULE', 'That change is not allowed right now.', 422, [], 'req-10'),
    );

    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Blood group'));
    await user.type(screen.getByLabelText('Blood group'), 'B+');
    await user.click(save);

    expect(await screen.findByText('That change is not allowed right now.')).toBeInTheDocument();
  });

  /* --------------------------------- skills --------------------------------- */

  it('shows a verified skill but offers no way to grant verification', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);

    await screen.findByText('Meera Iyer');
    expect(screen.getByText(/A verified mark is added by your institution/i)).toBeInTheDocument();

    await openEditor(user);

    expect(screen.queryByLabelText(/verified/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /verified/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('warns that editing skills clears the verified mark', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    await openEditor(user);

    expect(
      screen.getByText(/Editing your skills clears their verified mark/i),
    ).toBeInTheDocument();
  });

  it('sends skills as name and level only, never verification', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.clear(screen.getByLabelText('Skill 2'));
    await user.type(screen.getByLabelText('Skill 2'), 'PostgreSQL');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    const skills = patchBody()?.skills as Array<Record<string, unknown>>;
    expect(skills).toEqual([
      { name: 'React', level: 'advanced' },
      { name: 'PostgreSQL', level: 'intermediate' },
    ]);

    for (const skill of skills) {
      expect(skill).not.toHaveProperty('verified');
      expect(skill).not.toHaveProperty('verifiedVia');
    }
  });

  it('drops a skill row left blank', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.click(screen.getByRole('button', { name: /add skill/i }));
    await user.click(save);

    await waitFor(() => expect(toastPlain).toHaveBeenCalled());
    expect(apiPatch).not.toHaveBeenCalled();
  });

  /* --------------------------------- security ------------------------------- */

  it('reads only /students/me', async () => {
    renderWithQuery(<StudentProfilePage />);
    await screen.findByText('Meera Iyer');

    expect(urls().length).toBeGreaterThan(0);
    for (const url of urls()) {
      expect(url).toBe('/students/me');
      expect(url).not.toContain('studentId');
    }
  });

  it('redirects a caller without student:read_own', async () => {
    permissions = ['result:read_own'];

    renderWithQuery(<StudentProfilePage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument();
  });

  /** The request must not leave the browser, not merely be refused. */
  it('never requests the profile without student:read_own', async () => {
    permissions = ['job:read'];

    renderWithQuery(<StudentProfilePage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(apiGet).not.toHaveBeenCalled();
  });

  /* ------------------------------ empty profile ----------------------------- */

  it('handles a profile with nothing filled in yet', async () => {
    apiGet.mockResolvedValue(
      profile({
        dateOfBirth: null,
        bloodGroup: null,
        gender: null,
        address: null,
        guardian: null,
        skills: [],
        portfolioLinks: { github: null, linkedin: null, portfolio: null, other: [] },
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);

    expect(await screen.findByText('No address recorded.')).toBeInTheDocument();
    expect(screen.getByText('No guardian recorded.')).toBeInTheDocument();

    const save = await openEditor(user);

    // An untouched, entirely empty form must not fail validation on the
    // required lines inside an address nobody has entered.
    await user.type(screen.getByLabelText('Blood group'), 'A+');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(patchBody()).toEqual({ bloodGroup: 'A+' });
  });

  it('accepts a complete new address', async () => {
    apiGet.mockResolvedValue(profile({ address: null }));

    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.type(screen.getByLabelText('Address line 1'), '4 Gandhi Road');
    await user.type(screen.getByLabelText('City'), 'Madurai');
    await user.type(screen.getByLabelText('State'), 'Tamil Nadu');
    await user.type(screen.getByLabelText('PIN code'), '625001');
    await user.type(screen.getByLabelText('Country'), 'India');
    await user.click(save);

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());

    const address = patchBody()?.address as Record<string, unknown>;
    expect(address.line1).toBe('4 Gandhi Road');
    expect(address.city).toBe('Madurai');
    expect(address.pincode).toBe('625001');
  });

  it('refuses a half-entered address before it reaches the server', async () => {
    apiGet.mockResolvedValue(profile({ address: null }));

    const user = userEvent.setup();
    renderWithQuery(<StudentProfilePage />);
    const save = await openEditor(user);

    await user.type(screen.getByLabelText('City'), 'Madurai');
    await user.click(save);

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(apiPatch).not.toHaveBeenCalled();
  });
});
