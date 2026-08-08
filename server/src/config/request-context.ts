import { AsyncLocalStorage } from 'node:async_hooks';

import { InternalError } from '@/errors';

export interface RequestContext {
  requestId: string;
  userId: string | null;
  collegeId: string | null;
  roleKey: string | null;
  permissions: string[];
  sessionId: string | null;
  departmentId: string | null;
  studentId: string | null;
  facultyId: string | null;
  assignedBatchIds: string[];
  ip: string | null;
  userAgent: string | null;
  /** Set only by an explicit, reviewed `withoutTenantScope()` call. */
  bypassTenantScope: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createEmptyContext(requestId: string): RequestContext {
  return {
    requestId,
    userId: null,
    collegeId: null,
    roleKey: null,
    permissions: [],
    sessionId: null,
    departmentId: null,
    studentId: null,
    facultyId: null,
    assignedBatchIds: [],
    ip: null,
    userAgent: null,
    bypassTenantScope: false,
  };
}

export const requestContext = {
  run<T>(context: RequestContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  /** Throws when called outside a request. Use `tryGet` for optional access. */
  get(): RequestContext {
    const context = storage.getStore();
    if (!context) {
      throw new InternalError('Request context is not available in this execution path.');
    }
    return context;
  },

  tryGet(): RequestContext | undefined {
    return storage.getStore();
  },

  set<K extends keyof RequestContext>(key: K, value: RequestContext[K]): void {
    const context = storage.getStore();
    if (context) context[key] = value;
  },

  patch(values: Partial<RequestContext>): void {
    const context = storage.getStore();
    if (context) Object.assign(context, values);
  },

  requestId(): string {
    return storage.getStore()?.requestId ?? 'no-request-context';
  },

  userId(): string | null {
    return storage.getStore()?.userId ?? null;
  },

  collegeId(): string | null {
    return storage.getStore()?.collegeId ?? null;
  },
};

/**
 * Runs a callback with tenant scoping disabled. Every call site is reviewed —
 * `reason` is recorded so the escape hatch stays greppable and accountable.
 */
export function withoutTenantScope<T>(reason: string, callback: () => T): T {
  const current = storage.getStore();
  const base = current ?? createEmptyContext(`system:${reason}`);
  const context: RequestContext = { ...base, bypassTenantScope: true };
  return storage.run(context, callback);
}

/** Runs background work (jobs, cron) under a synthetic context. */
export function runInSystemContext<T>(label: string, callback: () => T): T {
  const context = createEmptyContext(`system:${label}`);
  context.bypassTenantScope = true;
  return storage.run(context, callback);
}
