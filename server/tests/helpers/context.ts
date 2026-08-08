import { DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, type RoleKey } from '@peacefic/shared';
import mongoose from 'mongoose';

import { createEmptyContext, requestContext, type RequestContext } from '@/config/request-context';

export interface TestContextOverrides {
  userId?: string;
  collegeId?: string;
  roleKey?: RoleKey;
  permissions?: string[];
  departmentId?: string;
  studentId?: string;
  facultyId?: string;
  assignedBatchIds?: string[];
}

export function buildContext(overrides: TestContextOverrides = {}): RequestContext {
  const roleKey = overrides.roleKey ?? ROLE_KEYS.COLLEGE_ADMIN;
  const context = createEmptyContext('test-request');

  context.userId = overrides.userId ?? new mongoose.Types.ObjectId().toString();
  context.collegeId = overrides.collegeId ?? new mongoose.Types.ObjectId().toString();
  context.roleKey = roleKey;
  context.permissions = overrides.permissions ?? DEFAULT_ROLE_PERMISSIONS[roleKey];
  context.departmentId = overrides.departmentId ?? null;
  context.studentId = overrides.studentId ?? null;
  context.facultyId = overrides.facultyId ?? null;
  context.assignedBatchIds = overrides.assignedBatchIds ?? [];
  context.ip = '127.0.0.1';
  context.userAgent = 'jest';

  return context;
}

/** Runs a callback inside a request context, as the middleware chain would. */
export async function asUser<T>(
  overrides: TestContextOverrides,
  callback: () => Promise<T>,
): Promise<T> {
  return requestContext.run(buildContext(overrides), callback);
}

/** Runs a callback scoped to one tenant, with full college-admin permissions. */
export async function asTenant<T>(collegeId: string, callback: () => Promise<T>): Promise<T> {
  return asUser({ collegeId, roleKey: ROLE_KEYS.COLLEGE_ADMIN }, callback);
}
