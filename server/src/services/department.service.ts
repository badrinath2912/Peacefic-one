import type {
  AssignHodInput,
  BulkOperationResult,
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from '@peacefic/shared';
import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';
import type { ScopeGuard } from './scope-guard.service';

import { BusinessRuleError, DuplicateResourceError, NotFoundError } from '@/errors';
import type { DepartmentDocument } from '@/models/department.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { RoleRepository } from '@/repositories/role.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type { UserRepository } from '@/repositories/user.repository';
import { toPlain } from '@/utils/mongo';


export class DepartmentService {
  constructor(
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly studentRepository: StudentRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
  ) {}

  async list(options: ListOptions): Promise<PaginatedResult<DepartmentDocument>> {
    // Scope narrows the list rather than rejecting it: an HOD listing
    // departments gets their own, not a 403.
    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    const filter = allowed ? { _id: { $in: allowed } } : {};

    return this.departmentRepository.paginate({
      ...options,
      filter: { ...filter, ...(options.filter ?? {}) },
    });
  }

  async getById(id: string): Promise<DepartmentDocument> {
    await this.scopeGuard.assertCanAccessDepartment(id);
    return this.departmentRepository.findByIdOrFail(id, { include: 'hodId' });
  }

  async create(input: CreateDepartmentInput): Promise<DepartmentDocument> {
    if (await this.departmentRepository.codeExists(input.code)) {
      throw new DuplicateResourceError('That department code is already in use.', [
        { field: 'code', message: 'Already in use' },
      ]);
    }

    if (input.hodId) await this.assertUserBelongsToCollege(input.hodId);

    const department = await this.departmentRepository.create({
      name: input.name,
      code: input.code,
      hodId: input.hodId ? new mongoose.Types.ObjectId(input.hodId) : null,
      description: input.description ?? null,
      establishedYear: input.establishedYear ?? null,
      status: input.status,
    });

    const collegeId = department.collegeId;
    await this.collegeRepository.incrementStat(collegeId, 'totalDepartments', 1);

    if (input.hodId) await this.grantHodRole(input.hodId, department);

    await this.auditService.log({
      action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
      category: 'data',
      entity: { type: 'Department', id: department._id, label: department.name },
    });

    return department;
  }

  async update(id: string, input: UpdateDepartmentInput): Promise<DepartmentDocument> {
    await this.scopeGuard.assertCanAccessDepartment(id);
    const existing = await this.departmentRepository.findByIdOrFail(id);

    if (input.code && input.code !== existing.code) {
      if (await this.departmentRepository.codeExists(input.code, id)) {
        throw new DuplicateResourceError('That department code is already in use.', [
          { field: 'code', message: 'Already in use' },
        ]);
      }
    }

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.description !== undefined) patch.description = input.description;
    if (input.establishedYear !== undefined) patch.establishedYear = input.establishedYear;
    if (input.status !== undefined) patch.status = input.status;

    const updated = await this.departmentRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
      category: 'data',
      entity: { type: 'Department', id: updated._id, label: updated.name },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async assignHod(id: string, input: AssignHodInput): Promise<DepartmentDocument> {
    await this.scopeGuard.assertCanAccessDepartment(id);
    const department = await this.departmentRepository.findByIdOrFail(id);

    if (input.hodId) await this.assertUserBelongsToCollege(input.hodId);

    const previousHodId = department.hodId ? String(department.hodId) : null;

    const updated = await this.departmentRepository.updateByIdOrFail(id, {
      $set: { hodId: input.hodId ? new mongoose.Types.ObjectId(input.hodId) : null },
    });

    // Assigning an HOD grants the role scoped to that department; unassigning
    // revokes it. Both are critical audit events.
    if (previousHodId && previousHodId !== input.hodId) {
      await this.revokeHodRole(previousHodId);
    }
    if (input.hodId) {
      await this.grantHodRole(input.hodId, updated);
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.DEPARTMENT_HOD_ASSIGNED,
      category: 'admin',
      severity: 'critical',
      entity: { type: 'Department', id: updated._id, label: updated.name },
      changes: [{ field: 'hodId', from: previousHodId, to: input.hodId }],
    });

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    await this.scopeGuard.assertCanAccessDepartment(id);
    const department = await this.departmentRepository.findByIdOrFail(id);

    const [students, batches, faculty] = await Promise.all([
      this.studentRepository.count({ departmentId: department._id, status: 'active' }),
      this.batchRepository.count({ departmentId: department._id, status: 'active' }),
      this.facultyRepository.count({ departmentId: department._id, status: 'active' }),
    ]);

    if (students > 0 || batches > 0 || faculty > 0) {
      // Name the blocking counts rather than saying "cannot delete".
      const blockers = [
        students > 0 ? `${students} student(s)` : null,
        batches > 0 ? `${batches} batch(es)` : null,
        faculty > 0 ? `${faculty} staff member(s)` : null,
      ].filter(Boolean);

      throw new BusinessRuleError(
        `This department still has ${blockers.join(', ')}. Move or archive them first.`,
      );
    }

    const deleted = await this.departmentRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Department');

    await this.collegeRepository.incrementStat(department.collegeId, 'totalDepartments', -1);

    await this.auditService.log({
      action: AUDIT_ACTIONS.DEPARTMENT_DELETED,
      category: 'data',
      severity: 'warning',
      entity: { type: 'Department', id: department._id, label: department.name },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* --------------------------------- export --------------------------------- */

  async exportDepartments(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<DepartmentDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (allowed) query._id = { $in: allowed };

    const departments = await this.departmentRepository.findMany(query, {
      sort: 'name',
      limit: 1000,
    });

    await this.departmentRepository.populateRelations(departments);

    await this.auditService.log({
      action: 'department.exported',
      category: 'data',
      metadata: { rows: departments.length },
    });

    return departments;
  }

  /* ---------------------------------- bulk ---------------------------------- */

  /**
   * Per-row outcomes: a department that still holds students must not stop the
   * empty ones being removed.
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

  /** Department detail panel: counts plus how it compares to the college. */
  async analytics(id: string) {
    await this.scopeGuard.assertCanAccessDepartment(id);
    const department = await this.departmentRepository.findByIdOrFail(id);
    const departmentId = department._id;

    const [totalStudents, totalBatches, totalFaculty, placedStudents, cgpaRows] =
      await Promise.all([
        this.studentRepository.count({ departmentId, status: 'active' }),
        this.batchRepository.count({ departmentId, status: 'active' }),
        this.facultyRepository.count({ departmentId, status: 'active' }),
        this.studentRepository.count({ departmentId, 'placement.isPlaced': true }),
        this.studentRepository.aggregate<{ _id: null; avg: number }>([
          { $match: { departmentId, status: 'active', 'academics.currentCgpa': { $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$academics.currentCgpa' } } },
        ]),
      ]);

    return {
      department: { id: String(departmentId), name: department.name, code: department.code },
      totalStudents,
      totalBatches,
      totalFaculty,
      placedStudents,
      // Percentage counts students, not offers.
      placementRate:
        totalStudents > 0 ? Math.round((placedStudents / totalStudents) * 1000) / 10 : 0,
      averageCgpa: cgpaRows[0]?.avg ? Math.round(cgpaRows[0].avg * 100) / 100 : null,
    };
  }

  private async assertUserBelongsToCollege(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const context = await import('@/config/request-context');
    const collegeId = context.requestContext.collegeId();

    if (!user.collegeId || String(user.collegeId) !== collegeId) {
      throw new NotFoundError('User');
    }
  }

  private async grantHodRole(userId: string, department: DepartmentDocument): Promise<void> {
    const role = await this.roleRepository.findByKey(ROLE_KEYS.HOD, null);
    if (!role) return;

    await this.userRepository.updateById(userId, { $set: { roleId: role._id } });
    // Live access tokens embed permissions; bumping this forces a refresh.
    await this.userRepository.bumpPermissionsVersion(new mongoose.Types.ObjectId(userId));

    await this.auditService.log({
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      category: 'admin',
      severity: 'critical',
      entity: { type: 'User', id: userId, label: department.name },
      changes: [{ field: 'roleKey', from: null, to: ROLE_KEYS.HOD }],
    });
  }

  private async revokeHodRole(userId: string): Promise<void> {
    const stillHod = await this.departmentRepository.findByHod(
      new mongoose.Types.ObjectId(userId),
    );
    if (stillHod.length > 0) return;

    const role = await this.roleRepository.findByKey(ROLE_KEYS.FACULTY, null);
    if (!role) return;

    await this.userRepository.updateById(userId, { $set: { roleId: role._id } });
    await this.userRepository.bumpPermissionsVersion(new mongoose.Types.ObjectId(userId));

    await this.auditService.log({
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      category: 'admin',
      severity: 'critical',
      entity: { type: 'User', id: userId },
      changes: [{ field: 'roleKey', from: ROLE_KEYS.HOD, to: ROLE_KEYS.FACULTY }],
    });
  }
}
