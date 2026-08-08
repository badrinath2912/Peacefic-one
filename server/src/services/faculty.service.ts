import {
  PERMISSION_DEFINITIONS,
  ROLE_KEYS,
  hasPermission,
  type AssignBatchesInput,
  type BulkOperationResult,
  type CreateFacultyInput,
  type ImportFacultyRow,
  type UpdateFacultyInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';
import type { AuthService } from './auth.service';
import type { EmailService } from './email.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { config } from '@/config/env';
import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  DuplicateResourceError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { FacultyDocument } from '@/models/faculty.model';
import type { UserDocument } from '@/models/user.model';
import type { ActivityLogRepository } from '@/repositories/activity-log.repository';
import type { AttendanceSessionRepository } from '@/repositories/attendance.repository';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { RoleRepository } from '@/repositories/role.repository';
import type { UserRepository } from '@/repositories/user.repository';
import { generateRefreshToken, hashPassword } from '@/utils/crypto';
import { parseImportDate } from '@/utils/date';
import { toPlain } from '@/utils/mongo';

const ASSIGNABLE_ROLES = [
  ROLE_KEYS.HOD,
  ROLE_KEYS.FACULTY,
  ROLE_KEYS.TRAINER,
  ROLE_KEYS.PLACEMENT_OFFICER,
] as const;

/**
 * Only these block a role assignment. The rule is "you cannot escalate
 * privilege", not "you cannot delegate a duty you personally never perform" —
 * a registrar legitimately creates lecturers who host live classes without
 * ever hosting one themselves.
 */
const DANGEROUS_PERMISSIONS = new Set(
  PERMISSION_DEFINITIONS.filter((permission) => permission.isDangerous).map((p) => p.key),
);

export class FacultyService {
  constructor(
    private readonly facultyRepository: FacultyRepository,
    private readonly userRepository: UserRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly roleRepository: RoleRepository,
    private readonly attendanceSessionRepository: AttendanceSessionRepository,
    private readonly activityLogRepository: ActivityLogRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  /* ---------------------------------- read --------------------------------- */

  async list(options: ListOptions): Promise<PaginatedResult<FacultyDocument>> {
    const allowedDepartments = await this.scopeGuard.accessibleDepartmentIds();
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };

    if (allowedDepartments) filter.departmentId = { $in: allowedDepartments };

    return this.facultyRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'userId,departmentId',
    });
  }

  async getById(id: string): Promise<FacultyDocument> {
    const faculty = await this.facultyRepository.findByIdOrFail(id, {
      include: 'userId,departmentId,assignedBatchIds',
    });
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);
    return faculty;
  }

  /* --------------------------------- create -------------------------------- */

  async create(input: CreateFacultyInput): Promise<FacultyDocument> {
    await this.scopeGuard.assertCanAccessDepartment(input.departmentId);
    const department = await this.departmentRepository.findByIdOrFail(input.departmentId);

    const [employeeTaken, emailTaken] = await Promise.all([
      this.facultyRepository.employeeIdExists(input.employeeId),
      this.userRepository.emailExists(input.email),
    ]);

    if (employeeTaken) {
      throw new DuplicateResourceError('That employee ID is already in use.', [
        { field: 'employeeId', message: 'Already in use' },
      ]);
    }
    if (emailTaken) {
      throw new DuplicateResourceError('An account with that email already exists.', [
        { field: 'email', message: 'Already in use' },
      ]);
    }

    const role = await this.assertAssignableRole(input.roleKey);
    await this.assertBatchesInDepartment(input.assignedBatchIds, department._id);

    const collegeId = requestContext.get().collegeId;
    if (!collegeId) throw new BusinessRuleError('No college context is available.');

    const faculty = await withTransaction(async (session) => {
      const user = await this.userRepository.create(
        {
          email: input.email,
          // Random placeholder: the invite sets the real password, so the
          // account is never usable before it is accepted.
          passwordHash: await hashPassword(generateRefreshToken()),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          collegeId: new mongoose.Types.ObjectId(collegeId),
          roleId: role._id,
          status: 'pending_verification',
        } as Partial<UserDocument>,
        session,
      );

      const created = await this.facultyRepository.create(
        {
          userId: user._id,
          departmentId: department._id,
          employeeId: input.employeeId,
          designation: input.designation,
          photoUrl: input.photoUrl ?? null,
          alternatePhone: input.alternatePhone ?? null,
          address: input.address ?? null,
          emergencyContact: input.emergencyContact ?? null,
          employmentType: input.employmentType,
          type: input.type,
          joiningDate: input.joiningDate,
          qualifications: input.qualifications,
          experienceYears: input.experienceYears,
          specializations: input.specializations,
          assignedBatchIds: input.assignedBatchIds.map(
            (batchId) => new mongoose.Types.ObjectId(batchId),
          ),
          status: input.status,
        } as Partial<FacultyDocument>,
        session,
      );

      await this.departmentRepository.incrementStat(department._id, 'totalFaculty', 1, session);
      await this.collegeRepository.incrementStat(
        new mongoose.Types.ObjectId(collegeId),
        'totalFaculty',
        1,
        session,
      );

      return created;
    });

    if (input.sendInvite) {
      const token = await this.authService.createInviteToken(faculty.userId);
      const college = await this.collegeRepository.findById(faculty.collegeId);

      await this.emailService.enqueue('student-invite', input.email, {
        firstName: input.firstName,
        collegeName: college?.name ?? 'your institution',
        inviteUrl: `${config.clientUrl}/invite/${encodeURIComponent(token)}`,
      });
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.FACULTY_CREATED,
      category: 'data',
      entity: { type: 'Faculty', id: faculty._id, label: faculty.employeeId },
    });

    return faculty;
  }

  /* --------------------------------- update -------------------------------- */

  async update(id: string, input: UpdateFacultyInput): Promise<FacultyDocument> {
    const existing = await this.facultyRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessDepartment(existing.departmentId);

    if (input.employeeId && input.employeeId !== existing.employeeId) {
      if (await this.facultyRepository.employeeIdExists(input.employeeId, id)) {
        throw new DuplicateResourceError('That employee ID is already in use.', [
          { field: 'employeeId', message: 'Already in use' },
        ]);
      }
    }

    const targetDepartment = input.departmentId
      ? new mongoose.Types.ObjectId(input.departmentId)
      : existing.departmentId;

    if (input.departmentId) await this.scopeGuard.assertCanAccessDepartment(input.departmentId);
    if (input.assignedBatchIds) {
      await this.assertBatchesInDepartment(input.assignedBatchIds, targetDepartment);
    }

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('employeeId', input.employeeId);
    assign('designation', input.designation);
    assign('photoUrl', input.photoUrl);
    assign('alternatePhone', input.alternatePhone);
    assign('address', input.address);
    assign('emergencyContact', input.emergencyContact);
    assign('employmentType', input.employmentType);
    assign('type', input.type);
    assign('joiningDate', input.joiningDate);
    assign('qualifications', input.qualifications);
    assign('experienceYears', input.experienceYears);
    assign('specializations', input.specializations);
    assign('status', input.status);

    if (input.departmentId) patch.departmentId = targetDepartment;
    if (input.assignedBatchIds) {
      patch.assignedBatchIds = input.assignedBatchIds.map(
        (batchId) => new mongoose.Types.ObjectId(batchId),
      );
    }

    // Resignation removes access but keeps every historical record they created.
    const isResigning =
      input.status !== undefined &&
      input.status !== existing.status &&
      (input.status === 'resigned' || input.status === 'retired');

    if (isResigning) {
      await this.assertNoUnmarkedSessions(existing);
      patch.assignedBatchIds = [];
    }

    const updated = await withTransaction(async (session) => {
      const result = await this.facultyRepository.updateById(id, { $set: patch }, { session });
      if (!result) throw new NotFoundError('Faculty');

      if (input.departmentId && String(targetDepartment) !== String(existing.departmentId)) {
        await this.departmentRepository.incrementStat(
          existing.departmentId,
          'totalFaculty',
          -1,
          session,
        );
        await this.departmentRepository.incrementStat(targetDepartment, 'totalFaculty', 1, session);
      }

      return result;
    });

    if (isResigning) {
      await this.userRepository.updateById(existing.userId, { $set: { status: 'suspended' } });
      await this.userRepository.bumpPermissionsVersion(existing.userId);
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.FACULTY_UPDATED,
      category: 'data',
      entity: { type: 'Faculty', id: updated._id, label: updated.employeeId },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async assignBatches(id: string, input: AssignBatchesInput): Promise<FacultyDocument> {
    const faculty = await this.facultyRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);
    await this.assertBatchesInDepartment(input.assignedBatchIds, faculty.departmentId);

    const removed = faculty.assignedBatchIds.filter(
      (batchId) => !input.assignedBatchIds.includes(String(batchId)),
    );

    // Removing a batch that still has unmarked past sessions would leave those
    // sessions as nobody's responsibility.
    for (const batchId of removed) {
      const pending = await this.attendanceSessionRepository.count({
        batchId,
        markedByFacultyId: faculty._id,
        status: 'pending_marking',
        date: { $lte: new Date() },
      });

      if (pending > 0) {
        throw new BusinessRuleError(
          `This member still has ${pending} unmarked session(s) for a batch you are removing. Mark or reassign them first.`,
        );
      }
    }

    const updated = await this.facultyRepository.assignBatches(
      faculty._id,
      input.assignedBatchIds.map((batchId) => new mongoose.Types.ObjectId(batchId)),
    );
    if (!updated) throw new NotFoundError('Faculty');

    await this.auditService.log({
      action: AUDIT_ACTIONS.FACULTY_BATCHES_ASSIGNED,
      category: 'admin',
      entity: { type: 'Faculty', id: faculty._id, label: faculty.employeeId },
      changes: [
        {
          field: 'assignedBatchIds',
          from: faculty.assignedBatchIds.map(String),
          to: input.assignedBatchIds,
        },
      ],
    });

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    const faculty = await this.facultyRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);
    await this.assertNoUnmarkedSessions(faculty);

    const hodOf = await this.departmentRepository.findByHod(faculty.userId);
    if (hodOf.length > 0) {
      throw new BusinessRuleError(
        `This member is Head of ${hodOf.map((d) => d.name).join(', ')}. Reassign the department first.`,
      );
    }

    const deleted = await withTransaction(async (session) => {
      const result = await this.facultyRepository.softDelete(id, session);
      if (!result) throw new NotFoundError('Faculty');

      await this.userRepository.updateById(
        faculty.userId,
        { $set: { status: 'archived', deletedAt: new Date() } },
        { session },
      );

      await this.departmentRepository.incrementStat(
        faculty.departmentId,
        'totalFaculty',
        -1,
        session,
      );
      await this.collegeRepository.incrementStat(faculty.collegeId, 'totalFaculty', -1, session);

      return result;
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.FACULTY_DELETED,
      category: 'data',
      severity: 'warning',
      entity: { type: 'Faculty', id: faculty._id, label: faculty.employeeId },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* --------------------------------- profile -------------------------------- */

  /**
   * The detail page in one request, mirroring `StudentService.getProfile` so
   * both profile pages have the same shape and the same scope guarantees.
   */
  async getProfile(id: string) {
    const faculty = await this.facultyRepository.findByIdOrFail(id, {
      include: 'userId,departmentId,assignedBatchIds',
    });
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);

    const [user, batches, compliance, activity, headsOf] = await Promise.all([
      this.userRepository.findById(faculty.userId),
      this.batchRepository.findMany({ _id: { $in: faculty.assignedBatchIds } }),
      this.attendanceCompliance(id),
      this.activityLogRepository.findForEntity('Faculty', faculty._id, 20),
      this.departmentRepository.findByHod(faculty.userId),
    ]);

    return {
      faculty,
      account: user
        ? {
            id: String(user._id),
            email: user.email,
            phone: user.phone,
            status: user.status,
            emailVerified: user.emailVerifiedAt !== null,
            lastLoginAt: user.lastLoginAt,
          }
        : null,
      workload: {
        batchCount: batches.length,
        studentCount: batches.reduce((total, batch) => total + batch.stats.totalStudents, 0),
        batches: batches.map((batch) => ({
          id: String(batch._id),
          name: batch.name,
          code: batch.code,
          students: batch.stats.totalStudents,
        })),
      },
      compliance,
      // Surfaced because it blocks deletion — better shown than discovered.
      headsOf: headsOf.map((department) => ({
        id: String(department._id),
        name: department.name,
        code: department.code,
      })),
      activity: activity.map((entry) => ({
        id: String(entry._id),
        action: entry.action,
        category: entry.category,
        severity: entry.severity,
        actor: entry.userEmail,
        outcome: entry.outcome,
        changes: entry.changes,
        at: entry.createdAt,
      })),
    };
  }

  /* --------------------------------- export --------------------------------- */

  async exportFaculty(
    filter: Record<string, unknown>,
    options: { ids?: string[]; limit?: number } = {},
  ): Promise<FacultyDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowedDepartments = await this.scopeGuard.accessibleDepartmentIds();
    if (allowedDepartments) query.departmentId = { $in: allowedDepartments };

    const staff = await this.facultyRepository.findMany(query, {
      sort: 'employeeId',
      limit: options.limit ?? 5000,
    });

    await this.facultyRepository.populateRelations(staff);

    await this.auditService.log({
      action: 'faculty.exported',
      category: 'data',
      severity: 'warning',
      metadata: { rows: staff.length, selection: options.ids ? 'selected' : 'filtered' },
    });

    return staff;
  }

  /* ---------------------------------- bulk ---------------------------------- */

  /**
   * Per-row outcomes rather than all-or-nothing: one member who still heads a
   * department must not block the other nineteen.
   */
  async bulkDelete(ids: string[]): Promise<BulkOperationResult> {
    const results: Array<{
      index: number;
      success: boolean;
      id?: string;
      code?: string;
      message?: string;
    }> = [];

    let successCount = 0;

    for (const [index, id] of ids.entries()) {
      try {
        await this.remove(id);
        successCount += 1;
        results.push({ index, success: true, id });
      } catch (error) {
        results.push({
          index,
          success: false,
          id,
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Delete failed',
        });
      }
    }

    return {
      totalSubmitted: ids.length,
      successCount,
      failureCount: ids.length - successCount,
      results,
    };
  }

  /* -------------------------------- reporting ------------------------------ */

  async workload(id: string) {
    const faculty = await this.facultyRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);

    const batches = await this.batchRepository.findMany({
      _id: { $in: faculty.assignedBatchIds },
    });

    return {
      faculty: {
        id: String(faculty._id),
        employeeId: faculty.employeeId,
        designation: faculty.designation,
        type: faculty.type,
      },
      batchCount: batches.length,
      studentCount: batches.reduce((total, batch) => total + batch.stats.totalStudents, 0),
      batches: batches.map((batch) => ({
        id: String(batch._id),
        name: batch.name,
        code: batch.code,
        students: batch.stats.totalStudents,
      })),
    };
  }

  /** Sessions assigned versus sessions actually marked — a compliance view. */
  async attendanceCompliance(id: string, from?: Date, to?: Date) {
    const faculty = await this.facultyRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessDepartment(faculty.departmentId);

    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;

    const base: Record<string, unknown> = { markedByFacultyId: faculty._id };
    if (from || to) base.date = range;

    const [total, marked, pending] = await Promise.all([
      this.attendanceSessionRepository.count(base),
      this.attendanceSessionRepository.count({
        ...base,
        status: { $in: ['marked', 'locked'] },
      }),
      this.attendanceSessionRepository.count({ ...base, status: 'pending_marking' }),
    ]);

    return {
      facultyId: String(faculty._id),
      totalSessions: total,
      markedSessions: marked,
      pendingSessions: pending,
      complianceRate: total > 0 ? Math.round((marked / total) * 1000) / 10 : 100,
    };
  }

  /* ---------------------------------- bulk --------------------------------- */

  async importRows(rows: ImportFacultyRow[], dryRun: boolean): Promise<BulkOperationResult & { dryRun: boolean }> {
    if (rows.length > 500) {
      throw new BusinessRuleError('Import at most 500 rows at a time.');
    }

    const departmentMap = await this.departmentRepository.mapCodesToIds(
      rows.map((row) => row.departmentCode),
    );

    const results: Array<{
      index: number;
      success: boolean;
      identifier?: string;
      id?: string;
      code?: string;
      message?: string;
    }> = [];

    const seenEmployeeIds = new Set<string>();
    const seenEmails = new Set<string>();
    let successCount = 0;

    for (const [index, row] of rows.entries()) {
      const identifier = row.employeeId;

      try {
        const departmentId = departmentMap.get(row.departmentCode.toUpperCase().trim());
        if (!departmentId) {
          throw new ValidationError(`Unknown department code "${row.departmentCode}"`);
        }

        const employeeId = row.employeeId.toUpperCase().trim();
        const email = row.email.toLowerCase().trim();

        if (seenEmployeeIds.has(employeeId)) {
          throw new ValidationError('Duplicate employee ID within the file');
        }
        if (seenEmails.has(email)) {
          throw new ValidationError('Duplicate email within the file');
        }
        if (await this.facultyRepository.employeeIdExists(employeeId)) {
          throw new DuplicateResourceError(`Employee ID ${employeeId} already exists`);
        }
        if (await this.userRepository.emailExists(email)) {
          throw new DuplicateResourceError(`Email ${email} already exists`);
        }

        const joiningDate = parseImportDate(row.joiningDate);
        if (!joiningDate) {
          throw new ValidationError(`Could not read joining date "${row.joiningDate}"`);
        }

        seenEmployeeIds.add(employeeId);
        seenEmails.add(email);

        if (!dryRun) {
          const created = await this.create({
            firstName: row.firstName,
            lastName: row.lastName,
            email,
            phone: row.phone ?? null,
            departmentId: String(departmentId),
            employeeId,
            designation: row.designation,
            employmentType: this.normaliseEmploymentType(row.employmentType),
            type: row.type?.toLowerCase().trim() === 'trainer' ? 'trainer' : 'faculty',
            roleKey: row.type?.toLowerCase().trim() === 'trainer' ? 'trainer' : 'faculty',
            joiningDate,
            qualifications: [],
            experienceYears: row.experienceYears ?? 0,
            specializations: [],
            assignedBatchIds: [],
            status: 'active',
            sendInvite: true,
          } as CreateFacultyInput);

          results.push({ index, success: true, identifier, id: String(created._id) });
        } else {
          results.push({ index, success: true, identifier });
        }

        successCount += 1;
      } catch (error) {
        results.push({
          index,
          success: false,
          identifier,
          code: (error as { code?: string }).code ?? 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Row failed validation',
        });
      }
    }

    return {
      dryRun,
      totalSubmitted: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      results,
    };
  }

  /* -------------------------------- helpers -------------------------------- */

  private async assertAssignableRole(roleKey: string) {
    if (!ASSIGNABLE_ROLES.includes(roleKey as (typeof ASSIGNABLE_ROLES)[number])) {
      throw new ValidationError('That role cannot be assigned to a staff member.', [
        { field: 'roleKey', message: 'Unsupported role' },
      ]);
    }

    const role = await this.roleRepository.findByKey(roleKey, null);
    if (!role) throw new BusinessRuleError('Roles are not seeded. Run the seed script first.');

    // Nobody may hand out a dangerous permission they do not themselves hold.
    const granted = requestContext.get().permissions;
    const escalating = role.permissions.filter(
      (permission) =>
        DANGEROUS_PERMISSIONS.has(permission) && !hasPermission(granted, permission),
    );

    if (escalating.length > 0) {
      throw new ValidationError(
        'You cannot assign a role that holds permissions you do not have.',
        [{ field: 'roleKey', message: `Missing: ${escalating.slice(0, 5).join(', ')}` }],
      );
    }

    return role;
  }

  private async assertBatchesInDepartment(
    batchIds: string[],
    departmentId: mongoose.Types.ObjectId,
  ): Promise<void> {
    if (batchIds.length === 0) return;

    const batches = await this.batchRepository.findMany({
      _id: { $in: batchIds.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    if (batches.length !== batchIds.length) {
      throw new ValidationError('One or more of those batches could not be found.');
    }

    const foreign = batches.filter(
      (batch) => String(batch.departmentId) !== String(departmentId),
    );

    if (foreign.length > 0) {
      throw new ValidationError(
        `These batches belong to another department: ${foreign.map((b) => b.code).join(', ')}`,
      );
    }
  }

  private async assertNoUnmarkedSessions(faculty: FacultyDocument): Promise<void> {
    const pending = await this.attendanceSessionRepository.count({
      markedByFacultyId: faculty._id,
      status: 'pending_marking',
      date: { $lte: new Date() },
    });

    if (pending > 0) {
      throw new BusinessRuleError(
        `This member has ${pending} unmarked attendance session(s). Mark or reassign them first.`,
      );
    }
  }

  private normaliseEmploymentType(value: string | null | undefined): CreateFacultyInput['employmentType'] {
    const normalised = value?.toLowerCase().trim();
    if (normalised === 'contract') return 'contract';
    if (normalised === 'visiting') return 'visiting';
    if (normalised === 'guest') return 'guest';
    return 'permanent';
  }
}
