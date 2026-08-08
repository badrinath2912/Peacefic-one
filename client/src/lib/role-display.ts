import {
  COLLEGE_PORTAL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  STUDENT_PORTAL_ROLES,
  WILDCARD_PERMISSION,
  type PermissionDefinition,
  type RoleKey,
} from '@peacefic/shared';

/**
 * The role catalogue, read from the shared constants.
 *
 * There is no roles API: no service, controller or route serves `/roles`. What
 * exists is `ROLE_DEFINITIONS` and `DEFAULT_ROLE_PERMISSIONS` in
 * `@peacefic/shared`, which is the same source `seedRoles()` writes into the
 * database with `isSystem: true`. So these figures are authoritative rather
 * than illustrative — but they describe the seeded defaults, not any per-college
 * override a future roles API might allow.
 */

export interface RoleSummary {
  key: RoleKey;
  name: string;
  description: string;
  scope: string;
  portal: 'platform' | 'college' | 'student';
  /** `true` for the wildcard holder, whose count is every permission. */
  hasWildcard: boolean;
  permissionCount: number;
  dangerousCount: number;
}

export const SCOPE_LABELS: Record<string, string> = {
  platform: 'Every college',
  college: 'One college',
  department: 'One department',
  self: 'Their own records',
};

export const PORTAL_LABELS: Record<string, string> = {
  platform: 'Platform',
  college: 'College portal',
  student: 'Student portal',
};

const byKey = new Map(PERMISSION_DEFINITIONS.map((entry) => [entry.key, entry]));

/** Every permission a role holds, resolved to its definition. */
export function permissionsFor(key: RoleKey): PermissionDefinition[] {
  const granted = DEFAULT_ROLE_PERMISSIONS[key] ?? [];

  if (granted.includes(WILDCARD_PERMISSION)) return [...PERMISSION_DEFINITIONS];

  return granted
    .map((permission) => byKey.get(permission))
    .filter((entry): entry is PermissionDefinition => Boolean(entry));
}

/** Grouped by module, in the order the catalogue declares them. */
export function permissionsByModule(
  permissions: PermissionDefinition[],
): Array<{ module: string; permissions: PermissionDefinition[] }> {
  const groups = new Map<string, PermissionDefinition[]>();

  for (const permission of permissions) {
    const existing = groups.get(permission.module);
    if (existing) existing.push(permission);
    else groups.set(permission.module, [permission]);
  }

  return [...groups.entries()].map(([module, entries]) => ({
    module,
    permissions: entries,
  }));
}

function summarise(key: RoleKey): RoleSummary {
  const definition = ROLE_DEFINITIONS[key];
  const granted = DEFAULT_ROLE_PERMISSIONS[key] ?? [];
  const hasWildcard = granted.includes(WILDCARD_PERMISSION);
  const resolved = permissionsFor(key);

  return {
    key,
    name: definition.name,
    description: definition.description,
    scope: definition.scope,
    portal: definition.portal,
    hasWildcard,
    permissionCount: resolved.length,
    dangerousCount: resolved.filter((entry) => entry.isDangerous).length,
  };
}

/**
 * The roles a college administrator can meaningfully be shown: their own
 * portal's roles and the student role. `platform_admin` is deliberately absent
 * — it belongs to the platform tenant, not to any college.
 */
export const COLLEGE_ROLE_SUMMARIES: RoleSummary[] = [
  ...COLLEGE_PORTAL_ROLES,
  ...STUDENT_PORTAL_ROLES,
].map(summarise);

export function roleSummary(key: string): RoleSummary | undefined {
  return COLLEGE_ROLE_SUMMARIES.find((entry) => entry.key === key);
}
