import {
  ROLE_KEYS,
  type BulkOperationResult,
  type CreateStudentInput,
  type ImportStudentRow,
  type StudentListQuery,
  type UpdateOwnStudentProfileInput,
  type UpdateStudentInput,
  type ApproveStudentRegistrationInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';

import type { StudentRegistrationDocument } from '@/models/student-registration.model';
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
import type { StudentDocument } from '@/models/student.model';
import type { UserDocument } from '@/models/user.model';
import type { ActivityLogRepository } from '@/repositories/activity-log.repository';
import type { AttendanceSummaryRepository } from '@/repositories/attendance.repository';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { RoleRepository } from '@/repositories/role.repository';
import type { StudentRegistrationRepository } from '@/repositories/student-registration.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type { UserRepository } from '@/repositories/user.repository';
import { digestAadhaar, generateRefreshToken, hashPassword } from '@/utils/crypto';
import { parseImportDate } from '@/utils/date';
import { toPlain } from '@/utils/mongo';

export interface ImportRowResult {
  index: number;
  success: boolean;
  identifier?: string;
  id?: string;
  code?: string;
  message?: string;
}

export interface ImportReport extends BulkOperationResult {
  dryRun: boolean;
}

/** Fields a student may never change about themselves. */
const INSTITUTIONAL_FIELDS = [
  'rollNumber',
  'registerNumber',
  'departmentId',
  'batchId',
  'currentSemester',
  'academics',
  'placement',
  'status',
] as const;

export class StudentService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly userRepository: UserRepository,
    private readonly batchRepository: BatchRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly roleRepository: RoleRepository,
    private readonly attendanceSummaryRepository: AttendanceSummaryRepository,
    private readonly activityLogRepository: ActivityLogRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly studentRegistrationRepository: StudentRegistrationRepository,
  ) {}

  /* ---------------------------------- read --------------------------------- */

  async list(
    query: StudentListQuery,
    options: ListOptions,
  ): Promise<PaginatedResult<StudentDocument>> {
    // Scope narrows the result set rather than rejecting the request.
    const allowedBatches = await this.scopeGuard.accessibleBatchIds();

    const filter = this.studentRepository.buildFilters({
      departmentId: query.departmentId,
      batchId: query.batchId,
      status: query.status,
      currentSemester: query.currentSemester,
      gender: query.gender,
      isPlaced: query.isPlaced,
      isEligible: query.isEligible,
      minCgpa: query.minCgpa,
      maxCgpa: query.maxCgpa,
      maxBacklogs: query.maxBacklogs,
      skill: query.skill,
    });

    if (allowedBatches) {
      filter.batchId = filter.batchId
        ? { $in: allowedBatches.filter((id) => String(id) === String(filter.batchId)) }
        : { $in: allowedBatches };
    }

    return this.studentRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'userId,departmentId,batchId',
    });
  }

  async getById(id: string): Promise<StudentDocument> {
    await this.scopeGuard.assertCanAccessStudent(id);
    return this.studentRepository.findByIdOrFail(id, {
      include: 'userId,departmentId,batchId',
    });
  }

  /** Student-portal read. The id comes from the token, never the client. */
  async getOwnProfile(): Promise<StudentDocument> {
    const student = await this.scopeGuard.requireOwnStudent();
    return this.studentRepository.findByIdOrFail(student._id, {
      include: 'userId,departmentId,batchId',
    });
  }

  /* --------------------------------- create -------------------------------- */

  /**
   * @param existingUserId  An account that already exists for this person, used
   * when approving a self-registration: the applicant created their own login
   * and chose their own password at registration, so a second User must not be
   * created and their credential must not be replaced. Everything else — scope
   * guard, batch/department agreement, duplicate checks, capacity, counters —
   * runs identically, so there is only ever one student-creation path.
   */
  async create(input: CreateStudentInput, existingUserId?: string): Promise<StudentDocument> {
    await this.scopeGuard.assertCanAccessBatch(input.batchId);

    const [batch, department] = await Promise.all([
      this.batchRepository.findByIdOrFail(input.batchId),
      this.departmentRepository.findByIdOrFail(input.departmentId),
    ]);

    if (String(batch.departmentId) !== String(department._id)) {
      throw new BusinessRuleError('That batch does not belong to the selected department.');
    }

    const aadhaar = input.aadhaarNumber ? digestAadhaar(input.aadhaarNumber) : null;

    const [rollTaken, admissionTaken, emailTaken, aadhaarTaken] = await Promise.all([
      this.studentRepository.rollNumberExists(input.rollNumber),
      this.studentRepository.admissionNumberExists(input.admissionNumber),
      existingUserId ? Promise.resolve(false) : this.userRepository.emailExists(input.email),
      aadhaar ? this.studentRepository.aadhaarHashExists(aadhaar.hash) : Promise.resolve(false),
    ]);

    if (rollTaken) {
      throw new DuplicateResourceError('That roll number is already in use.', [
        { field: 'rollNumber', message: 'Already in use' },
      ]);
    }
    if (admissionTaken) {
      throw new DuplicateResourceError('That admission number is already in use.', [
        { field: 'admissionNumber', message: 'Already in use' },
      ]);
    }
    if (emailTaken) {
      throw new DuplicateResourceError('An account with that email already exists.', [
        { field: 'email', message: 'Already in use' },
      ]);
    }
    if (aadhaarTaken) {
      // Named without echoing the number back.
      throw new DuplicateResourceError('A student with that Aadhaar number already exists.', [
        { field: 'aadhaarNumber', message: 'Already registered' },
      ]);
    }

    await this.assertCapacity(batch._id, 1);

    const role = await this.roleRepository.findByKey(ROLE_KEYS.STUDENT, null);
    if (!role) throw new BusinessRuleError('Roles are not seeded. Run the seed script first.');

    const collegeId = requestContext.get().collegeId;
    if (!collegeId) throw new BusinessRuleError('No college context is available.');

    // A student that exists in `users` but not `students` (or vice versa) is an
    // inconsistency that is painful to detect later, so both writes and both
    // counters move together.
    const student = await withTransaction(async (session) => {
      const user = existingUserId
        ? // Only the status moves. Role, college, email and password hash are
          // left exactly as registration set them.
          await this.userRepository.updateByIdOrFail(
            existingUserId,
            { $set: { status: 'active' } },
            { session },
          )
        : await this.userRepository.create(
        {
          email: input.email,
          // Placeholder: the invite flow sets the real password. It is random
          // rather than empty so the account is never usable without the invite.
          passwordHash: await hashPassword(generateRefreshToken()),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          collegeId: new mongoose.Types.ObjectId(collegeId),
          roleId: role._id,
          status: 'pending_verification',
          mustChangePassword: false,
        } as Partial<UserDocument>,
        session,
      );

      const created = await this.studentRepository.create(
        {
          userId: user._id,
          departmentId: department._id,
          batchId: batch._id,
          rollNumber: input.rollNumber,
          registerNumber: input.registerNumber ?? null,
          admissionNumber: input.admissionNumber,
          photoUrl: input.photoUrl ?? null,
          alternatePhone: input.alternatePhone ?? null,
          programme: input.programme ?? null,
          section: input.section ?? null,
          aadhaar,
          admissionDate: input.admissionDate,
          currentSemester: input.currentSemester,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          bloodGroup: input.bloodGroup ?? null,
          category: input.category ?? null,
          address: input.address ?? null,
          guardian: input.guardian ?? null,
          academics: {
            tenthPercent: input.academics?.tenthPercent ?? null,
            twelfthPercent: input.academics?.twelfthPercent ?? null,
            diplomaPercent: input.academics?.diplomaPercent ?? null,
            currentCgpa: input.academics?.currentCgpa ?? null,
            semesterGpas: [],
            activeBacklogs: input.academics?.activeBacklogs ?? 0,
            totalBacklogs: input.academics?.totalBacklogs ?? 0,
            yearGap: input.academics?.yearGap ?? 0,
          },
          skills: (input.skills ?? []).map((s) => ({ ...s, verified: false, verifiedVia: null })),
          portfolioLinks: input.portfolioLinks ?? {
            github: null,
            linkedin: null,
            portfolio: null,
            other: [],
          },
          status: input.status,
        } as Partial<StudentDocument>,
        session,
      );

      await this.batchRepository.incrementStudentCount(batch._id, 1, session);
      await this.departmentRepository.incrementStat(department._id, 'totalStudents', 1, session);
      await this.collegeRepository.incrementStat(
        new mongoose.Types.ObjectId(collegeId),
        'totalStudents',
        1,
        session,
      );

      return created;
    });

    if (input.sendInvite) await this.sendInvite(student, input.email, input.firstName);

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      category: 'data',
      entity: { type: 'Student', id: student._id, label: student.rollNumber },
    });

    return student;
  }

  /* --------------------------------- update -------------------------------- */

  async update(id: string, input: UpdateStudentInput): Promise<StudentDocument> {
    await this.scopeGuard.assertCanAccessStudent(id);
    const existing = await this.studentRepository.findByIdOrFail(id);

    if (input.rollNumber && input.rollNumber !== existing.rollNumber) {
      if (await this.studentRepository.rollNumberExists(input.rollNumber, id)) {
        throw new DuplicateResourceError('That roll number is already in use.', [
          { field: 'rollNumber', message: 'Already in use' },
        ]);
      }
    }

    const movingBatch = input.batchId && String(input.batchId) !== String(existing.batchId);
    if (movingBatch) {
      await this.scopeGuard.assertCanAccessBatch(input.batchId as string);
      await this.assertCapacity(new mongoose.Types.ObjectId(input.batchId as string), 1);
    }

    const patch = this.buildPatch(input);

    const updated = await withTransaction(async (session) => {
      const result = await this.studentRepository.updateById(id, { $set: patch }, { session });
      if (!result) throw new NotFoundError('Student');

      if (movingBatch) {
        await this.batchRepository.incrementStudentCount(existing.batchId, -1, session);
        await this.batchRepository.incrementStudentCount(
          new mongoose.Types.ObjectId(input.batchId as string),
          1,
          session,
        );
      }

      if (input.departmentId && String(input.departmentId) !== String(existing.departmentId)) {
        await this.departmentRepository.incrementStat(
          existing.departmentId,
          'totalStudents',
          -1,
          session,
        );
        await this.departmentRepository.incrementStat(
          new mongoose.Types.ObjectId(input.departmentId),
          'totalStudents',
          1,
          session,
        );
      }

      return result;
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      category: 'data',
      entity: { type: 'Student', id: updated._id, label: updated.rollNumber },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  /**
   * Student-portal write. Institutional fields are rejected at the API rather
   * than merely disabled in the UI.
   */
  async updateOwnProfile(input: UpdateOwnStudentProfileInput): Promise<StudentDocument> {
    const student = await this.scopeGuard.requireOwnStudent();

    const submitted = input as Record<string, unknown>;
    const forbidden = INSTITUTIONAL_FIELDS.filter((field) => field in submitted);
    if (forbidden.length > 0) {
      throw new ValidationError(
        'Those details are maintained by your institution and cannot be changed here.',
        forbidden.map((field) => ({ field, message: 'Not editable' })),
      );
    }

    const patch: Record<string, unknown> = {};
    if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth;
    if (input.gender !== undefined) patch.gender = input.gender;
    if (input.bloodGroup !== undefined) patch.bloodGroup = input.bloodGroup;
    if (input.address !== undefined) patch.address = input.address;
    if (input.guardian !== undefined) patch.guardian = input.guardian;
    if (input.portfolioLinks !== undefined) patch.portfolioLinks = input.portfolioLinks;
    if (input.skills !== undefined) {
      // A student cannot self-verify a skill.
      patch.skills = input.skills.map((skill) => ({
        ...skill,
        verified: false,
        verifiedVia: null,
      }));
    }

    const updated = await this.studentRepository.updateByIdOrFail(student._id, { $set: patch });

    if (input.phone !== undefined) {
      await this.userRepository.updateById(student.userId, { $set: { phone: input.phone } });
    }

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    await this.scopeGuard.assertCanAccessStudent(id);
    const student = await this.studentRepository.findByIdOrFail(id);

    const deleted = await withTransaction(async (session) => {
      const result = await this.studentRepository.softDelete(id, session);
      if (!result) throw new NotFoundError('Student');

      // The login identity goes too, otherwise the account still authenticates.
      await this.userRepository.updateById(
        student.userId,
        { $set: { status: 'archived', deletedAt: new Date() } },
        { session },
      );

      await this.batchRepository.incrementStudentCount(student.batchId, -1, session);
      await this.departmentRepository.incrementStat(
        student.departmentId,
        'totalStudents',
        -1,
        session,
      );
      await this.collegeRepository.incrementStat(student.collegeId, 'totalStudents', -1, session);

      return result;
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_DELETED,
      category: 'data',
      severity: 'warning',
      entity: { type: 'Student', id: student._id, label: student.rollNumber },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* --------------------------------- detail -------------------------------- */

  /**
   * Everything the profile page shows, assembled server-side. Six separate
   * round trips from the browser would make the page feel broken on a slow
   * connection and each would re-run the same scope checks.
   */
  async getProfile(id: string) {
    await this.scopeGuard.assertCanAccessStudent(id);

    const student = await this.studentRepository.findByIdOrFail(id, {
      include: 'userId,departmentId,batchId',
    });

    const [user, attendance, activity] = await Promise.all([
      this.userRepository.findById(student.userId),
      this.attendanceSummaryRepository.findForStudent(student._id, 'overall', 'overall'),
      this.activityLogRepository.findForEntity('Student', student._id, 20),
    ]);

    const threshold = await this.collegeRepository.getAttendanceThreshold(student.collegeId);
    const attended = attendance
      ? attendance.presentCount + attendance.lateCount + attendance.onDutyCount
      : 0;

    return {
      student,
      account: user
        ? {
            id: String(user._id),
            email: user.email,
            status: user.status,
            emailVerified: user.emailVerifiedAt !== null,
            lastLoginAt: user.lastLoginAt,
            mustChangePassword: user.mustChangePassword,
          }
        : null,
      attendance: {
        threshold,
        percentage: attendance?.percentage ?? 0,
        totalSessions: attendance?.totalSessions ?? 0,
        attendedSessions: attended,
        absentCount: attendance?.absentCount ?? 0,
        isBelowThreshold: attendance?.isBelowThreshold ?? false,
      },
      placement: {
        isEligible: student.placement.isEligible,
        eligibilityNote: student.placement.eligibilityNote,
        isPlaced: student.placement.isPlaced,
        placementCount: student.placement.placementCount,
        highestPackage: student.placement.highestPackage,
      },
      documents: [
        student.resumeUrl
          ? {
              type: 'resume',
              label: 'Résumé',
              url: student.resumeUrl,
              updatedAt: student.resumeUpdatedAt,
            }
          : null,
        student.photoUrl
          ? { type: 'photo', label: 'Photograph', url: student.photoUrl, updatedAt: null }
          : null,
      ].filter((document): document is NonNullable<typeof document> => document !== null),
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

  /* --------------------------------- export -------------------------------- */

  /**
   * Exports either an explicit selection or everything matching the current
   * filters — the two things a user means by "export". Capped so one click
   * cannot stream the whole database into memory.
   */
  async exportStudents(
    query: StudentListQuery,
    options: { ids?: string[]; limit?: number } = {},
  ): Promise<StudentDocument[]> {
    const maxRows = options.limit ?? 5000;

    const filter = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : this.studentRepository.buildFilters(query);

    const allowedBatches = await this.scopeGuard.accessibleBatchIds();
    if (allowedBatches) {
      (filter as Record<string, unknown>).batchId = { $in: allowedBatches };
    }

    const students = await this.studentRepository.findMany(filter, {
      sort: 'rollNumber',
      limit: maxRows,
    });

    await this.studentRepository.populateRelations(students);

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_EXPORTED,
      category: 'data',
      severity: 'warning',
      metadata: { rows: students.length, selection: options.ids ? 'selected' : 'filtered' },
    });

    return students;
  }

  /* ---------------------------------- bulk --------------------------------- */

  async bulkUpdate(
    ids: string[],
    patch: Record<string, unknown>,
  ): Promise<BulkOperationResult> {
    const results: ImportRowResult[] = [];
    let successCount = 0;

    for (const [index, id] of ids.entries()) {
      try {
        await this.update(id, patch as UpdateStudentInput);
        successCount += 1;
        results.push({ index, success: true, id });
      } catch (error) {
        results.push({
          index,
          success: false,
          id,
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Update failed',
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

  async bulkDelete(ids: string[]): Promise<BulkOperationResult> {
    const results: ImportRowResult[] = [];
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

  /**
   * Validates every row and reports per-row outcomes. With `dryRun` nothing is
   * written — an import that half-succeeds and leaves the admin guessing which
   * rows landed is the failure mode this exists to prevent.
   */
  async importRows(rows: ImportStudentRow[], dryRun: boolean): Promise<ImportReport> {
    if (rows.length > 500) {
      throw new BusinessRuleError('Import at most 500 rows at a time.');
    }

    const [departmentMap, batchMap] = await Promise.all([
      this.departmentRepository.mapCodesToIds(rows.map((r) => r.departmentCode)),
      this.batchRepository.mapCodesToIds(rows.map((r) => r.batchCode)),
    ]);

    const results: ImportRowResult[] = [];
    const seenRolls = new Set<string>();
    const seenEmails = new Set<string>();
    let successCount = 0;

    for (const [index, row] of rows.entries()) {
      const identifier = row.rollNumber;

      try {
        const departmentId = departmentMap.get(row.departmentCode.toUpperCase().trim());
        if (!departmentId) {
          throw new ValidationError(`Unknown department code "${row.departmentCode}"`);
        }

        const batch = batchMap.get(row.batchCode.toUpperCase().trim());
        if (!batch) {
          throw new ValidationError(`Unknown batch code "${row.batchCode}"`);
        }
        if (String(batch.departmentId) !== String(departmentId)) {
          throw new ValidationError(
            `Batch "${row.batchCode}" does not belong to department "${row.departmentCode}"`,
          );
        }

        const roll = row.rollNumber.toUpperCase().trim();
        const email = row.email.toLowerCase().trim();

        // Duplicates inside the file itself, not only against the database.
        if (seenRolls.has(roll)) throw new ValidationError('Duplicate roll number within the file');
        if (seenEmails.has(email)) throw new ValidationError('Duplicate email within the file');

        if (await this.studentRepository.rollNumberExists(roll)) {
          throw new DuplicateResourceError(`Roll number ${roll} already exists`);
        }
        if (await this.userRepository.emailExists(email)) {
          throw new DuplicateResourceError(`Email ${email} already exists`);
        }

        const admissionDate = parseImportDate(row.admissionDate);
        if (!admissionDate) {
          throw new ValidationError(`Could not read admission date "${row.admissionDate}"`);
        }

        seenRolls.add(roll);
        seenEmails.add(email);

        if (!dryRun) {
          const created = await this.create({
            firstName: row.firstName,
            lastName: row.lastName,
            email,
            phone: row.phone ?? null,
            departmentId: String(departmentId),
            batchId: String(batch._id),
            rollNumber: roll,
            registerNumber: row.registerNumber ?? null,
            admissionNumber: (row.admissionNumber ?? roll).toUpperCase().trim(),
            admissionDate,
            currentSemester: row.currentSemester ?? batch.currentSemester,
            dateOfBirth: row.dateOfBirth ? parseImportDate(row.dateOfBirth) : null,
            gender: this.normaliseGender(row.gender),
            academics: {
              tenthPercent: row.tenthPercent ?? null,
              twelfthPercent: row.twelfthPercent ?? null,
              currentCgpa: row.currentCgpa ?? null,
              activeBacklogs: 0,
              totalBacklogs: 0,
              yearGap: 0,
            },
            guardian:
              row.guardianName && row.guardianPhone
                ? {
                    name: row.guardianName,
                    relation: 'Guardian',
                    phone: row.guardianPhone,
                    email: null,
                  }
                : null,
            status: 'active',
            sendInvite: true,
          } as CreateStudentInput);

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

    if (!dryRun) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.STUDENT_IMPORTED,
        category: 'data',
        severity: 'warning',
        metadata: { total: rows.length, imported: successCount },
      });
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

  async resendInvite(id: string): Promise<void> {
    await this.scopeGuard.assertCanAccessStudent(id);
    const student = await this.studentRepository.findByIdOrFail(id);
    const user = await this.userRepository.findById(student.userId);
    if (!user) throw new NotFoundError('Account');

    if (user.status === 'active') {
      throw new BusinessRuleError('That student has already activated their account.');
    }

    await this.sendInvite(student, user.email, user.firstName);
  }

  private async sendInvite(
    student: StudentDocument,
    email: string,
    firstName: string,
  ): Promise<void> {
    const token = await this.authService.createInviteToken(student.userId);
    const college = await this.collegeRepository.findById(student.collegeId);

    await this.emailService.enqueue('student-invite', email, {
      firstName,
      collegeName: college?.name ?? 'your institution',
      inviteUrl: `${config.clientUrl}/invite/${encodeURIComponent(token)}`,
    });
  }

  private async assertCapacity(batchId: mongoose.Types.ObjectId, additional: number): Promise<void> {
    if (await this.batchRepository.hasCapacity(batchId, additional)) return;

    // Exceeding capacity is possible but requires an explicit override, and it
    // is audited when it happens.
    const permissions = requestContext.get().permissions;
    const canOverride = permissions.includes('batch:update') || permissions.includes('*:*');

    if (!canOverride) {
      throw new BusinessRuleError('That batch is already at capacity.');
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.BATCH_CAPACITY_OVERRIDDEN,
      category: 'admin',
      severity: 'warning',
      entity: { type: 'Batch', id: batchId },
    });
  }

  private buildPatch(input: UpdateStudentInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('rollNumber', input.rollNumber);
    assign('registerNumber', input.registerNumber);
    assign('admissionNumber', input.admissionNumber);
    assign('photoUrl', input.photoUrl);
    assign('alternatePhone', input.alternatePhone);
    assign('programme', input.programme);
    assign('section', input.section);
    assign('admissionDate', input.admissionDate);
    assign('currentSemester', input.currentSemester);
    assign('dateOfBirth', input.dateOfBirth);
    assign('gender', input.gender);
    assign('bloodGroup', input.bloodGroup);
    assign('category', input.category);
    assign('address', input.address);
    assign('guardian', input.guardian);
    assign('portfolioLinks', input.portfolioLinks);
    assign('status', input.status);

    if (input.departmentId) patch.departmentId = new mongoose.Types.ObjectId(input.departmentId);
    if (input.batchId) patch.batchId = new mongoose.Types.ObjectId(input.batchId);

    if (input.skills) {
      patch.skills = input.skills.map((s) => ({ ...s, verified: false, verifiedVia: null }));
    }

    if (input.academics) {
      for (const [key, value] of Object.entries(input.academics)) {
        if (value !== undefined) patch[`academics.${key}`] = value;
      }
    }

    return patch;
  }

  private normaliseGender(value: string | null | undefined): CreateStudentInput['gender'] {
    if (!value) return null;
    const normalised = value.toLowerCase().trim();
    if (normalised === 'm' || normalised === 'male') return 'male';
    if (normalised === 'f' || normalised === 'female') return 'female';
    if (normalised === 'other') return 'other';
    return 'prefer_not_to_say';
  }

  /* -------------------------- self-registration review ---------------------- */
  /**
   * Reviewing students who registered themselves with the college join code.
   *
   * Isolation is structural: `StudentRegistrationRepository` is
   * `tenantScoped: true`, so `paginate` and `findByIdOrFail` are narrowed to the
   * reviewer's own college by `BaseRepository` before this service sees them. A
   * registration from another institution is not "forbidden" here — it is
   * invisible, and a direct id lookup answers 404.
   */
  async listRegistrations(options: ListOptions): Promise<PaginatedResult<StudentRegistrationDocument>> {
    return this.studentRegistrationRepository.paginate({
      ...options,
      sort: options.sort ?? 'createdAt',
    });
  }

  async getRegistration(id: string): Promise<StudentRegistrationDocument> {
    return this.studentRegistrationRepository.findByIdOrFail(id);
  }

  /**
   * Approving a registration is what finally creates the `Student`.
   *
   * The reviewer supplies the four fields an applicant cannot know — department,
   * batch, admission number and admission date — and `create()` below is reused
   * verbatim, so a self-registered student goes through exactly the same
   * validation, batch capacity checks and scope guard as one added by hand.
   * There is no second student-creation path.
   *
   * `sendInvite: false`: this applicant already chose a password at
   * registration. Inviting them would overwrite a credential they are waiting to
   * use.
   */
  async approveRegistration(
    id: string,
    input: ApproveStudentRegistrationInput,
  ): Promise<StudentDocument> {
    const registration = await this.studentRegistrationRepository.findByIdOrFail(id);

    // Refusing anything already decided makes double approval a no-op rather
    // than a second Student for the same person.
    if (registration.approvalStatus !== 'pending') {
      throw new BusinessRuleError(
        `This registration has already been ${registration.approvalStatus}.`,
      );
    }

    const user = await this.userRepository.findByIdOrFail(String(registration.userId));

    // Email verification is a separate gate and this is not a way around it.
    if (!user.emailVerifiedAt) {
      throw new BusinessRuleError(
        'This applicant has not verified their email address yet.',
      );
    }

    const student = await this.create({
      firstName: registration.firstName,
      lastName: registration.lastName,
      email: registration.email,
      phone: registration.phone,
      rollNumber: input.rollNumber ?? registration.rollNumber,
      departmentId: input.departmentId,
      batchId: input.batchId,
      admissionNumber: input.admissionNumber,
      admissionDate: input.admissionDate,
      currentSemester: input.currentSemester ?? 1,
      section: input.section ?? null,
      status: 'active',
      sendInvite: false,
    } as CreateStudentInput, String(registration.userId));

    await this.studentRegistrationRepository.updateByIdOrFail(id, {
      $set: {
        approvalStatus: 'approved',
        reviewedBy: requestContext.get().userId,
        reviewedAt: new Date(),
        studentId: student._id,
        rejectionReason: null,
      },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_REGISTRATION_APPROVED,
      category: 'admin',
      severity: 'warning',
      entity: { type: 'StudentRegistration', id: registration._id, label: registration.rollNumber },
      // Field names, not values: nothing about the applicant's credentials.
      metadata: { assigned: ['departmentId', 'batchId', 'admissionNumber', 'admissionDate'] },
    });

    return student;
  }

  /**
   * Rejection is terminal for this application and creates no `Student`.
   *
   * The account is archived rather than deleted, so the email stays claimed and
   * the decision remains auditable. `assertAccountUsable` already refuses
   * `archived` with "This account is no longer active", so a rejected applicant
   * cannot sign in and cannot drift back to active on their own.
   */
  async rejectRegistration(id: string, reason: string): Promise<StudentRegistrationDocument> {
    const registration = await this.studentRegistrationRepository.findByIdOrFail(id);

    if (registration.approvalStatus !== 'pending') {
      throw new BusinessRuleError(
        `This registration has already been ${registration.approvalStatus}.`,
      );
    }

    const updated = await this.studentRegistrationRepository.updateByIdOrFail(id, {
      $set: {
        approvalStatus: 'rejected',
        rejectionReason: reason,
        reviewedBy: requestContext.get().userId,
        reviewedAt: new Date(),
      },
    });

    await this.userRepository.updateById(String(registration.userId), {
      $set: { status: 'archived' },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_REGISTRATION_REJECTED,
      category: 'admin',
      severity: 'warning',
      entity: { type: 'StudentRegistration', id: registration._id, label: registration.rollNumber },
      metadata: { reason },
    });

    return updated;
  }
}
