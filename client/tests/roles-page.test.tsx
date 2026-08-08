import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_KEYS,
  WILDCARD_PERMISSION,
} from '@peacefic/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockAuth, renderWithQuery } from './helpers/render';

const replace = vi.fn();
const apiGet = vi.fn();
const apiGetPaginated = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();

/** Only college_admin holds any `role:*` permission. */
const COLLEGE_ADMIN = ['role:read', 'role:create', 'role:update', 'role:delete', 'role:assign'];

let permissions: string[] = [...COLLEGE_ADMIN];
let currentParams: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/college/roles',
  useParams: () => currentParams,
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
    apiGetPaginated: (...args: unknown[]) => apiGetPaginated(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
    apiPatch: (...args: unknown[]) => apiPatch(...args),
    apiDelete: (...args: unknown[]) => apiDelete(...args),
  };
});

const { default: RolesPage } = await import('@/app/college/roles/page');
const { default: RoleDetailPage } = await import('@/app/college/roles/[id]/page');

/** Every API verb, so "no request at all" can be asserted in one place. */
const everyCall = () => [
  ...apiGet.mock.calls,
  ...apiGetPaginated.mock.calls,
  ...apiPost.mock.calls,
  ...apiPatch.mock.calls,
  ...apiDelete.mock.calls,
];

beforeEach(() => {
  permissions = [...COLLEGE_ADMIN];
  currentParams = {};
  replace.mockReset();
  apiGet.mockReset();
  apiGetPaginated.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDelete.mockReset();
});

describe('Roles page', () => {
  it('lists the college and student roles', async () => {
    renderWithQuery(<RolesPage />);

    expect(await screen.findByRole('link', { name: 'College Administrator' })).toBeInTheDocument();

    // Scoped to the table: "Faculty" is also a link in the closing note.
    const table = screen.getByRole('table');

    for (const name of ['Head of Department', 'Faculty', 'Trainer', 'Placement Officer', 'Student']) {
      expect(within(table).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  /** The platform role belongs to the platform tenant, not to a college. */
  it('does not list the platform administrator', async () => {
    renderWithQuery(<RolesPage />);

    await screen.findByRole('link', { name: 'College Administrator' });
    expect(
      screen.queryByRole('link', { name: 'Platform Administrator' }),
    ).not.toBeInTheDocument();
  });

  /**
   * There is no roles API — no service, controller or route serves `/roles`.
   * The page reads the shared catalogue, so it must make no request at all.
   */
  it('makes no API request whatsoever', async () => {
    renderWithQuery(<RolesPage />);

    await screen.findByRole('link', { name: 'College Administrator' });

    expect(everyCall()).toHaveLength(0);
  });

  it('shows the permission count the catalogue defines for a role', async () => {
    renderWithQuery(<RolesPage />);

    const link = await screen.findByRole('link', { name: 'Placement Officer' });
    const row = link.closest('tr')!;

    const expected = DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.PLACEMENT_OFFICER].length;
    expect(within(row).getByText(String(expected))).toBeInTheDocument();
  });

  /**
   * Roles cannot be created, edited or deleted — no endpoint exists — so no
   * control may suggest otherwise, even to a caller holding `role:create`.
   */
  it('renders no create, edit or delete control even for college_admin', async () => {
    renderWithQuery(<RolesPage />);

    await screen.findByRole('link', { name: 'College Administrator' });

    for (const label of [/new role/i, /create role/i, /^edit$/i, /^delete$/i, /add role/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }

    expect(screen.getByText(/these roles are fixed/i)).toBeInTheDocument();
  });

  /**
   * The API supports no search, filter or pagination for roles because it does
   * not exist, so none of those controls may appear.
   */
  it('renders no search, filter or pagination controls', async () => {
    renderWithQuery(<RolesPage />);

    await screen.findByRole('link', { name: 'College Administrator' });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/filter/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  /* --------------------------------- RBAC ---------------------------------- */

  it('redirects a caller without role:read', async () => {
    permissions = ['student:read', 'department:read'];

    renderWithQuery(<RolesPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: 'College Administrator' }),
    ).not.toBeInTheDocument();
  });

  it('makes no request when the guard turns a caller away', async () => {
    permissions = ['student:read'];

    renderWithQuery(<RolesPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(everyCall()).toHaveLength(0);
  });
});

describe('Role detail page', () => {
  beforeEach(() => {
    currentParams = { id: ROLE_KEYS.PLACEMENT_OFFICER };
  });

  it('shows the role, its reach and its permission count', async () => {
    renderWithQuery(<RoleDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Placement Officer' }),
    ).toBeInTheDocument();

    const expected = DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.PLACEMENT_OFFICER].length;
    expect(screen.getByText(`${expected} permissions`)).toBeInTheDocument();
  });

  /** Every listed permission must exist in the catalogue — none invented. */
  it('lists only permissions the catalogue defines', async () => {
    renderWithQuery(<RoleDetailPage />);

    await screen.findByRole('heading', { name: 'Placement Officer' });

    const granted = DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.PLACEMENT_OFFICER];
    const known = new Set(PERMISSION_DEFINITIONS.map((entry) => entry.key));

    for (const permission of granted) {
      expect(known.has(permission)).toBe(true);
      expect(screen.getByText(permission)).toBeInTheDocument();
    }
  });

  it('groups permissions by the module the catalogue assigns', async () => {
    renderWithQuery(<RoleDetailPage />);

    await screen.findByRole('heading', { name: 'Placement Officer' });

    // A placement officer holds company, job and placement permissions.
    for (const heading of ['Company', 'Job', 'Placement']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('makes no API request', async () => {
    renderWithQuery(<RoleDetailPage />);

    await screen.findByRole('heading', { name: 'Placement Officer' });
    expect(everyCall()).toHaveLength(0);
  });

  it('offers no edit control', async () => {
    renderWithQuery(<RoleDetailPage />);

    await screen.findByRole('heading', { name: 'Placement Officer' });

    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be edited from here/i)).toBeInTheDocument();
  });

  /**
   * `platform_admin` is the only holder of `*:*`, and it is excluded from this
   * page as a platform-tenant role — so every role shown has an explicit,
   * countable permission list and no wildcard branch is reachable.
   */
  it('shows an explicit permission count for every listed role', async () => {
    for (const key of [
      ROLE_KEYS.COLLEGE_ADMIN,
      ROLE_KEYS.HOD,
      ROLE_KEYS.FACULTY,
      ROLE_KEYS.STUDENT,
    ]) {
      const granted = DEFAULT_ROLE_PERMISSIONS[key];
      expect(granted).not.toContain(WILDCARD_PERMISSION);

      currentParams = { id: key };
      const { unmount } = renderWithQuery(<RoleDetailPage />);

      expect(await screen.findByText(`${granted.length} permissions`)).toBeInTheDocument();
      expect(screen.queryByText(/wildcard/i)).not.toBeInTheDocument();

      unmount();
    }
  });

  it('shows a not-found state for an unknown role key', async () => {
    currentParams = { id: 'not-a-role' };

    renderWithQuery(<RoleDetailPage />);

    expect(await screen.findByText(/no such role/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all roles/i })).toBeInTheDocument();
  });

  it('redirects a caller without role:read', async () => {
    permissions = ['student:read'];

    renderWithQuery(<RoleDetailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
