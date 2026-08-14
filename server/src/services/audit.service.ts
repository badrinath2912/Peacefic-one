import type { AuditCategory, AuditSeverity } from '@peacefic/shared';
import mongoose from 'mongoose';

import { logger } from '@/config/logger';
import { requestContext } from '@/config/request-context';
import type { ActivityLogDocument } from '@/models/activity-log.model';
import type { ActivityLogRepository } from '@/repositories/activity-log.repository';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';

export interface AuditEntry {
  action: string;
  category: AuditCategory;
  severity?: AuditSeverity;
  entity?: { type: string; id?: string | mongoose.Types.ObjectId | null; label?: string | null };
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
  outcome?: 'success' | 'failure';
  errorMessage?: string;
  /** Overrides for system paths where there is no signed-in actor. */
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  collegeId?: string | null;
}

/**
 * Fields whose values must never be written into an audit diff. An audit log
 * that records the old and new value of a password is a vulnerability, not a
 * control.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'previousPasswordHashes',
  'token',
  'refreshToken',
  'refreshTokenHash',
  'otp',
  'codeHash',
  'joinCode',
  'verificationCode',
  'secret',
  'apiKey',
]);

const REDACTED = '[redacted]';

export class AuditService {
  constructor(private readonly repository: ActivityLogRepository) {}

  async log(entry: AuditEntry): Promise<void> {
    const context = requestContext.tryGet();

    const record = {
      collegeId: this.toObjectId(entry.collegeId ?? context?.collegeId ?? null),
      userId: this.toObjectId(entry.userId ?? context?.userId ?? null),
      userEmail: entry.userEmail ?? null,
      userRole: entry.userRole ?? context?.roleKey ?? null,
      action: entry.action,
      category: entry.category,
      severity: entry.severity ?? 'info',
      entity: entry.entity
        ? {
            type: entry.entity.type,
            id: this.toObjectId(entry.entity.id ?? null),
            label: entry.entity.label ?? null,
          }
        : null,
      changes: entry.changes ? this.redactChanges(entry.changes) : null,
      metadata: entry.metadata ? this.redactMetadata(entry.metadata) : null,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
      outcome: entry.outcome ?? 'success',
      errorMessage: entry.errorMessage ?? null,
    };

    try {
      await this.repository.append(record);
    } catch (error) {
      // Audit failures must never break the operation being audited, but they
      // are themselves a signal worth surfacing loudly.
      logger.error('Failed to write audit log', {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (record.severity === 'critical') {
      logger.warn(`Critical audit event: ${entry.action}`, {
        userId: record.userId?.toString(),
        collegeId: record.collegeId?.toString(),
        entity: record.entity,
      });
    }
  }

  /** Builds a field-level diff, skipping unchanged and sensitive fields. */
  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields?: string[],
  ): Array<{ field: string; from: unknown; to: unknown }> {
    const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

    for (const key of keys) {
      const from = before[key];
      const to = after[key];
      if (to === undefined) continue;
      if (JSON.stringify(from) === JSON.stringify(to)) continue;

      changes.push({
        field: key,
        from: SENSITIVE_FIELDS.has(key) ? REDACTED : from,
        to: SENSITIVE_FIELDS.has(key) ? REDACTED : to,
      });
    }

    return changes;
  }

  private redactChanges(
    changes: Array<{ field: string; from: unknown; to: unknown }>,
  ): Array<{ field: string; from: unknown; to: unknown }> {
    return changes.map((change) =>
      SENSITIVE_FIELDS.has(change.field)
        ? { field: change.field, from: REDACTED, to: REDACTED }
        : change,
    );
  }

  /* ----------------------------------- read ---------------------------------- */

  /**
   * The audit log, page by page.
   *
   * Reading goes through the same tenant-scoped repository that writes it, so
   * the college filter is applied by `BaseRepository` rather than by this
   * method remembering to. Redaction already happened on the way in: values are
   * replaced before they are stored, so nothing sensitive exists here to leak.
   */
  async list(options: ListOptions): Promise<PaginatedResult<ActivityLogDocument>> {
    return this.repository.paginate({ ...options, include: options.include ?? 'userId' });
  }

  /** The same rows, unpaginated, for an export. Capped so one call cannot pull the lot. */
  async export(filter: Record<string, unknown>, search?: string): Promise<ActivityLogDocument[]> {
    const page = await this.repository.paginate({
      filter,
      search,
      limit: 100,
      page: 1,
      sort: '-createdAt',
    });

    return page.items;
  }

  private redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      out[key] = SENSITIVE_FIELDS.has(key) ? REDACTED : value;
    }
    return out;
  }

  private toObjectId(value: string | mongoose.Types.ObjectId | null): mongoose.Types.ObjectId | null {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
  }
}

/** Canonical action names, so audit queries are not guessing at strings. */
export const AUDIT_ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGOUT_ALL: 'auth.logout_all',
  AUTH_TOKEN_REFRESHED: 'auth.token_refreshed',
  AUTH_TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
  AUTH_ACCOUNT_LOCKED: 'auth.account_locked',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  AUTH_EMAIL_VERIFIED: 'auth.email_verified',
  AUTH_SESSION_REVOKED: 'auth.session_revoked',
  AUTH_INVITE_ACCEPTED: 'auth.invite_accepted',

  COLLEGE_REGISTERED: 'college.registered',
  COLLEGE_APPROVED: 'college.approved',
  COLLEGE_REJECTED: 'college.rejected',
  COLLEGE_SUSPENDED: 'college.suspended',
  COLLEGE_UPDATED: 'college.updated',
  COLLEGE_JOIN_CODE_REGENERATED: 'college.join_code_regenerated',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_SUSPENDED: 'user.suspended',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_PERMISSIONS_CHANGED: 'user.permissions_changed',
  USER_PASSWORD_RESET_BY_ADMIN: 'user.password_reset_by_admin',

  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',
  DEPARTMENT_DELETED: 'department.deleted',
  DEPARTMENT_HOD_ASSIGNED: 'department.hod_assigned',

  BATCH_CREATED: 'batch.created',
  BATCH_UPDATED: 'batch.updated',
  BATCH_DELETED: 'batch.deleted',
  BATCH_PROMOTED: 'batch.promoted',
  BATCH_CAPACITY_OVERRIDDEN: 'batch.capacity_overridden',

  STUDENT_REGISTERED: 'student.registered',
  STUDENT_REGISTRATION_APPROVED: 'student.registration_approved',
  STUDENT_REGISTRATION_REJECTED: 'student.registration_rejected',
  STUDENT_CREATED: 'student.created',
  STUDENT_UPDATED: 'student.updated',
  STUDENT_DELETED: 'student.deleted',
  STUDENT_IMPORTED: 'student.imported',
  STUDENT_EXPORTED: 'student.exported',

  FACULTY_CREATED: 'faculty.created',
  FACULTY_UPDATED: 'faculty.updated',
  FACULTY_DELETED: 'faculty.deleted',
  FACULTY_BATCHES_ASSIGNED: 'faculty.batches_assigned',

  ATTENDANCE_SESSION_CREATED: 'attendance.session_created',
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_CORRECTED: 'attendance.corrected',
  ATTENDANCE_LOCKED: 'attendance.locked',
  ATTENDANCE_UNLOCKED: 'attendance.unlocked',
} as const;
