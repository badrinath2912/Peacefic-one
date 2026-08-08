import { WILDCARD_PERMISSION } from '../constants/permissions';

/**
 * Resolves a permission check against a granted set.
 * Supports the global wildcard (`*:*`) and resource wildcards (`student:*`).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.length === 0) return false;
  if (granted.includes(WILDCARD_PERMISSION)) return true;
  if (granted.includes(required)) return true;

  const [resource] = required.split(':');
  if (!resource) return false;
  return granted.includes(`${resource}:*`);
}

export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}

export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((permission) => hasPermission(granted, permission));
}

/** Merges role permissions with additive per-user grants, de-duplicated. */
export function resolvePermissions(
  rolePermissions: readonly string[],
  extraPermissions: readonly string[] = [],
): string[] {
  return Array.from(new Set([...rolePermissions, ...extraPermissions]));
}
