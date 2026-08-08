import type { BulkOperationResult, CreateBatchInput, UpdateBatchInput } from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { BusinessRuleError, DuplicateResourceError, NotFoundError } from '@/errors';
import type { BatchDocument } from '@/models/batch.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import { toPlain } from '@/utils/mongo';


const MAX_SEMESTER = 12;

export class BatchService {
  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly studentRepository: StudentRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
  ) {}

  async list(options: ListOptions): Promise<PaginatedResult<BatchDocument>> {
    const allowed = await this.scopeGuard.accessibleBatchIds();
    const filter = allowed ? { _id: { $in: allowed } } : {};

    return this.batchRepository.paginate({
      ...options,
      filter: { ...filter, ...(options.filter ?? {}) },
    });
  }

  async getById(id: string): Promise<BatchDocument> {
    await this.scopeGuard.assertCanAccessBatch(id);
    return this.batchRepository.findByIdOrFail(id, { include: 'departmentId,classAdvisorId' });
  }

  async create(input: CreateBatchInput): Promise<BatchDocument> {
    await this.scopeGuard.assertCanAccessDepartment(input.departmentId);
    await this.departmentRepository.findByIdOrFail(input.departmentId);

    if (await this.batchRepository.codeExists(input.code)) {
      throw new DuplicateResourceError('That batch code is already in use.', [
        { field: 'code', message: 'Already in use' },
      ]);
    }

    if (input.classAdvisorId) {
      await this.assertAdvisorIsStaff(input.classAdvisorId);
    }

    const batch = await withTransaction(async (session) => {
      const created = await this.batchRepository.create(
        {
          departmentId: new mongoose.Types.ObjectId(input.departmentId),
          name: input.name,
          code: input.code,
          admissionYear: input.admissionYear,
          graduationYear: input.graduationYear,
          currentSemester: input.currentSemester,
          section: input.section ?? null,
          classAdvisorId: input.classAdvisorId
            ? new mongoose.Types.ObjectId(input.classAdvisorId)
            : null,
          capacity: input.capacity,
          status: input.status,
        },
        session,
      );

      await this.departmentRepository.incrementStat(
        created.departmentId,
        'totalBatches',
        1,
        session,
      );
      await this.collegeRepository.incrementStat(created.collegeId, 'totalBatches', 1, session);

      return created;
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.BATCH_CREATED,
      category: 'data',
      entity: { type: 'Batch', id: batch._id, label: batch.name },
    });

    return batch;
  }

  async update(id: string, input: UpdateBatchInput): Promise<BatchDocument> {
    await this.scopeGuard.assertCanAccessBatch(id);
    const existing = await this.batchRepository.findByIdOrFail(id);

    if (input.code && input.code !== existing.code) {
      if (await this.batchRepository.codeExists(input.code, id)) {
        throw new DuplicateResourceError('That batch code is already in use.', [
          { field: 'code', message: 'Already in use' },
        ]);
      }
    }

    if (input.capacity !== undefined && input.capacity < existing.stats.totalStudents) {
      throw new BusinessRuleError(
        `This batch already holds ${existing.stats.totalStudents} students, so capacity cannot be set to ${input.capacity}.`,
      );
    }

    const admissionYear = input.admissionYear ?? existing.admissionYear;
    const graduationYear = input.graduationYear ?? existing.graduationYear;
    if (graduationYear <= admissionYear) {
      throw new BusinessRuleError('Graduation year must be after the admission year.');
    }

    if (input.classAdvisorId) await this.assertAdvisorIsStaff(input.classAdvisorId);
    if (input.departmentId) await this.scopeGuard.assertCanAccessDepartment(input.departmentId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.admissionYear !== undefined) patch.admissionYear = input.admissionYear;
    if (input.graduationYear !== undefined) patch.graduationYear = input.graduationYear;
    if (input.currentSemester !== undefined) patch.currentSemester = input.currentSemester;
    if (input.section !== undefined) patch.section = input.section;
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.status !== undefined) patch.status = input.status;
    if (input.classAdvisorId !== undefined) {
      patch.classAdvisorId = input.classAdvisorId
        ? new mongoose.Types.ObjectId(input.classAdvisorId)
        : null;
    }
    if (input.departmentId !== undefined) {
      patch.departmentId = new mongoose.Types.ObjectId(input.departmentId);
    }

    const updated = await this.batchRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: AUDIT_ACTIONS.BATCH_UPDATED,
      category: 'data',
      entity: { type: 'Batch', id: updated._id, label: updated.name },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    await this.scopeGuard.assertCanAccessBatch(id);
    const batch = await this.batchRepository.findByIdOrFail(id);

    const students = await this.studentRepository.count({
      batchId: batch._id,
      status: { $in: ['active', 'on_leave'] },
    });

    if (students > 0) {
      throw new BusinessRuleError(
        `This batch still has ${students} enrolled student(s). Move them to another batch first.`,
      );
    }

    const deleted = await this.batchRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Batch');

    await this.facultyRepository.removeBatchFromAll(batch._id);
    await this.departmentRepository.incrementStat(batch.departmentId, 'totalBatches', -1);
    await this.collegeRepository.incrementStat(batch.collegeId, 'totalBatches', -1);

    await this.auditService.log({
      action: AUDIT_ACTIONS.BATCH_DELETED,
      category: 'data',
      severity: 'warning',
      entity: { type: 'Batch', id: batch._id, label: batch.name },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  async listStudents(id: string, options: ListOptions) {
    await this.scopeGuard.assertCanAccessBatch(id);
    return this.studentRepository.paginate({
      ...options,
      filter: { batchId: new mongoose.Types.ObjectId(id) },
      include: 'userId',
    });
  }

  /**
   * Irreversible through the UI, so it requires typed confirmation at the
   * controller. At the final semester the batch completes and its students
   * graduate.
   */
  async promote(id: string): Promise<BatchDocument> {
    await this.scopeGuard.assertCanAccessBatch(id);
    const batch = await this.batchRepository.findByIdOrFail(id);

    if (batch.status !== 'active') {
      throw new BusinessRuleError('Only an active batch can be promoted.');
    }

    const isFinal = batch.currentSemester >= MAX_SEMESTER;
    const nextSemester = batch.currentSemester + 1;

    const updated = await withTransaction(async (session) => {
      if (isFinal) {
        await this.studentRepository.updateMany(
          { batchId: batch._id, status: 'active' },
          { $set: { status: 'graduated' } },
          session,
        );
        return this.batchRepository.updateByIdOrFail(
          id,
          { $set: { status: 'completed' } },
          { session },
        );
      }

      await this.studentRepository.updateMany(
        { batchId: batch._id, status: { $in: ['active', 'on_leave'] } },
        { $set: { currentSemester: nextSemester } },
        session,
      );

      const result = await this.batchRepository.updateById(
        id,
        { $set: { currentSemester: nextSemester } },
        { session },
      );
      if (!result) throw new NotFoundError('Batch');
      return result;
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.BATCH_PROMOTED,
      category: 'admin',
      severity: 'warning',
      entity: { type: 'Batch', id: batch._id, label: batch.name },
      changes: [
        {
          field: isFinal ? 'status' : 'currentSemester',
          from: isFinal ? 'active' : batch.currentSemester,
          to: isFinal ? 'completed' : nextSemester,
        },
      ],
    });

    return updated;
  }

  /* --------------------------------- export --------------------------------- */

  async exportBatches(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<BatchDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowed = await this.scopeGuard.accessibleBatchIds();
    if (allowed) query._id = { $in: allowed };

    const batches = await this.batchRepository.findMany(query, {
      sort: '-admissionYear',
      limit: 2000,
    });

    await this.batchRepository.populateRelations(batches);

    await this.auditService.log({
      action: 'batch.exported',
      category: 'data',
      metadata: { rows: batches.length },
    });

    return batches;
  }

  /* ---------------------------------- bulk ---------------------------------- */

  /** Per-row outcomes: a batch with enrolled students must not block the rest. */
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

  async analytics(id: string) {
    await this.scopeGuard.assertCanAccessBatch(id);
    const batch = await this.batchRepository.findByIdOrFail(id);

    const [totalStudents, placedStudents, cgpaRows] = await Promise.all([
      this.studentRepository.count({ batchId: batch._id, status: 'active' }),
      this.studentRepository.count({ batchId: batch._id, 'placement.isPlaced': true }),
      this.studentRepository.aggregate<{ _id: null; avg: number }>([
        { $match: { batchId: batch._id, 'academics.currentCgpa': { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$academics.currentCgpa' } } },
      ]),
    ]);

    return {
      batch: {
        id: String(batch._id),
        name: batch.name,
        code: batch.code,
        currentSemester: batch.currentSemester,
      },
      totalStudents,
      capacity: batch.capacity,
      utilisation:
        batch.capacity > 0 ? Math.round((totalStudents / batch.capacity) * 1000) / 10 : 0,
      placedStudents,
      placementRate:
        totalStudents > 0 ? Math.round((placedStudents / totalStudents) * 1000) / 10 : 0,
      averageCgpa: cgpaRows[0]?.avg ? Math.round(cgpaRows[0].avg * 100) / 100 : null,
    };
  }

  private async assertAdvisorIsStaff(userId: string): Promise<void> {
    const faculty = await this.facultyRepository.findByUserId(userId);
    if (!faculty) {
      throw new BusinessRuleError('A class advisor must be an existing staff member.');
    }
  }
}
