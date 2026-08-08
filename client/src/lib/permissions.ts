import { hasAnyPermission, hasPermission, ROLE_KEYS, type RoleKey } from '@peacefic/shared';

/**
 * Client-side permission checks decide what to *render*. They are never the
 * security boundary — the server re-checks every request, and a user who edits
 * their token in devtools gets a 403, not access.
 */
export function can(permissions: string[] | undefined, permission: string): boolean {
  return hasPermission(permissions ?? [], permission);
}

export function canAny(permissions: string[] | undefined, required: string[]): boolean {
  return hasAnyPermission(permissions ?? [], required);
}

export const COLLEGE_ROLES: RoleKey[] = [
  ROLE_KEYS.COLLEGE_ADMIN,
  ROLE_KEYS.HOD,
  ROLE_KEYS.FACULTY,
  ROLE_KEYS.TRAINER,
  ROLE_KEYS.PLACEMENT_OFFICER,
];

export function isStudent(roleKey: string | undefined): boolean {
  return roleKey === ROLE_KEYS.STUDENT;
}

export function isCollegeStaff(roleKey: string | undefined): boolean {
  return COLLEGE_ROLES.includes(roleKey as RoleKey);
}

/** Where a user lands after signing in, based on which portal they belong to. */
export function homeRouteFor(roleKey: string | undefined): string {
  if (isStudent(roleKey)) return '/student';
  if (roleKey === ROLE_KEYS.PLATFORM_ADMIN) return '/admin';
  return '/college';
}
