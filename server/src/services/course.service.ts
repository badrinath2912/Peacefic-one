import type {
  AssignInstructorsInput,
  BulkOperationResult,
  CreateCourseInput,
  UpdateCourseInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { ScopeGuard } from './scope-guard.service';

import { requestContext } from '@/config/request-context';
import { BusinessRuleError, DuplicateResourceError, NotFoundError, ValidationError } from '@/errors';
import type { CourseDocument } from '@/models/course.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CourseRepository } from '@/repositories/course.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import { populatedName, toPlain } from '@/utils/mongo';

export class CourseService {
  constructor(
    private readonly courseRepository: CourseRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
  ) {}

  /* ---------------------------------- read ---------------------------------- */

  async list(options: ListOptions): Promise<PaginatedResult<CourseDocument>> {
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };

    // A course is visible if it belongs to a department the caller can see, or
    // if it is unscoped (a college-wide elective).
    const allowedDepartments = await this.scopeGuard.accessibleDepartmentIds();
    if (allowedDepartments) {
      filter.$or = [
        { departmentIds: { $in: allowedDepartments } },
        { departmentIds: { $size: 0 } },
      ];
    }

    return this.courseRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'departmentIds,instructorIds',
    });
  }

  async getById(id: string): Promise<CourseDocument> {
    const course = await this.courseRepository.findByIdOrFail(id, {
      include: 'departmentIds,batchIds,instructorIds,prerequisites',
    });
    await this.assertVisible(course);
    return course;
  }

  /** Detail page: the course plus what the sidebar panels need. */
  async getProfile(id: string) {
    const course = await this.getById(id);

    const [dependents, instructors] = await Promise.all([
      this.courseRepository.findDependents(course._id),
      this.facultyRepository.findMany({ _id: { $in: course.instructorIds } }),
    ]);

    await this.facultyRepository.populateRelations(instructors);

    return {
      course,
      instructors: instructors.map((member) => ({
        id: String(member._id),
        employeeId: member.employeeId,
        designation: member.designation,
        name: populatedName(member.userId) ?? member.employeeId,
      })),
      // Named so the UI can explain why a delete will be refused.
      dependents: dependents.map((dependent) => ({
        id: String(dependent._id),
        title: dependent.title,
        code: dependent.code,
      })),
    };
  }

  /* --------------------------------- write ---------------------------------- */

  async create(input: CreateCourseInput): Promise<CourseDocument> {
    if (await this.courseRepository.codeExists(input.code)) {
      throw new DuplicateResourceError('That course code is already in use.', [
        { field: 'code', message: 'Already in use' },
      ]);
    }

    await this.assertRelationsExist(input);

    const course = await this.courseRepository.create({
      title: input.title,
      code: input.code,
      description: input.description,
      category: input.category,
      level: input.level,
      thumbnailUrl: input.thumbnailUrl ?? null,
      durationHours: input.durationHours,
      credits: input.credits ?? null,
      semester: input.semester ?? null,
      instructorIds: input.instructorIds.map((id) => new mongoose.Types.ObjectId(id)),
      departmentIds: input.departmentIds.map((id) => new mongoose.Types.ObjectId(id)),
      batchIds: input.batchIds.map((id) => new mongoose.Types.ObjectId(id)),
      prerequisites: input.prerequisites.map((id) => new mongoose.Types.ObjectId(id)),
      learningOutcomes: input.learningOutcomes,
      tags: input.tags,
      status: input.status,
      publishedAt: input.status === 'published' ? new Date() : null,
    } as Partial<CourseDocument>);

    await this.auditService.log({
      action: 'course.created',
      category: 'data',
      entity: { type: 'Course', id: course._id, label: course.code },
    });

    return course;
  }

  async update(id: string, input: UpdateCourseInput): Promise<CourseDocument> {
    const existing = await this.courseRepository.findByIdOrFail(id);
    await this.assertVisible(existing);

    if (input.code && input.code !== existing.code) {
      if (await this.courseRepository.codeExists(input.code, id)) {
        throw new DuplicateResourceError('That course code is already in use.', [
          { field: 'code', message: 'Already in use' },
        ]);
      }
    }

    if (input.prerequisites?.some((prerequisite) => prerequisite === id)) {
      throw new ValidationError('A course cannot be a prerequisite of itself.', [
        { field: 'prerequisites', message: 'Remove this course from its own prerequisites' },
      ]);
    }

    await this.assertRelationsExist(input);

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('title', input.title);
    assign('code', input.code);
    assign('description', input.description);
    assign('category', input.category);
    assign('level', input.level);
    assign('thumbnailUrl', input.thumbnailUrl);
    assign('durationHours', input.durationHours);
    assign('credits', input.credits);
    assign('semester', input.semester);
    assign('learningOutcomes', input.learningOutcomes);
    assign('tags', input.tags);
    assign('status', input.status);

    for (const key of ['instructorIds', 'departmentIds', 'batchIds', 'prerequisites'] as const) {
      const value = input[key];
      if (value !== undefined) {
        patch[key] = value.map((entry) => new mongoose.Types.ObjectId(entry));
      }
    }

    // Stamped once, the first time the course goes live, and never rewritten.
    // Keyed off `publishedAt` rather than the previous status: archiving and
    // republishing must not move the original publication date.
    if (input.status === 'published' && existing.publishedAt === null) {
      patch.publishedAt = new Date();
    }

    const updated = await this.courseRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'course.updated',
      category: 'data',
      entity: { type: 'Course', id: updated._id, label: updated.code },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async assignInstructors(id: string, input: AssignInstructorsInput): Promise<CourseDocument> {
    const course = await this.courseRepository.findByIdOrFail(id);
    await this.assertVisible(course);
    await this.assertFacultyExist(input.instructorIds);

    const updated = await this.courseRepository.updateByIdOrFail(id, {
      $set: {
        instructorIds: input.instructorIds.map((entry) => new mongoose.Types.ObjectId(entry)),
      },
    });

    await this.auditService.log({
      action: 'course.instructors_assigned',
      category: 'admin',
      entity: { type: 'Course', id: course._id, label: course.code },
      changes: [
        {
          field: 'instructorIds',
          from: course.instructorIds.map(String),
          to: input.instructorIds,
        },
      ],
    });

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    const course = await this.courseRepository.findByIdOrFail(id);
    await this.assertVisible(course);

    const dependents = await this.courseRepository.findDependents(course._id);

    if (dependents.length > 0) {
      // Names the blockers rather than refusing flatly.
      throw new BusinessRuleError(
        `${dependents.map((d) => d.code).join(', ')} list this course as a prerequisite. Remove it from them first.`,
      );
    }

    if (course.stats.enrolledCount > 0) {
      throw new BusinessRuleError(
        `This course has ${course.stats.enrolledCount} enrolled student(s). Archive it instead of deleting.`,
      );
    }

    const deleted = await this.courseRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Course');

    await this.auditService.log({
      action: 'course.deleted',
      category: 'data',
      severity: 'warning',
      entity: { type: 'Course', id: course._id, label: course.code },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* ------------------------------ bulk & export ------------------------------ */

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

  async exportCourses(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<CourseDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowedDepartments = await this.scopeGuard.accessibleDepartmentIds();
    if (allowedDepartments) {
      query.$or = [
        { departmentIds: { $in: allowedDepartments } },
        { departmentIds: { $size: 0 } },
      ];
    }

    const courses = await this.courseRepository.findMany(query, { sort: 'code', limit: 2000 });
    await this.courseRepository.populateRelations(courses);

    await this.auditService.log({
      action: 'course.exported',
      category: 'data',
      metadata: { rows: courses.length },
    });

    return courses;
  }

  /* -------------------------------- internals -------------------------------- */

  /** A course outside every department the caller can see is not theirs. */
  private async assertVisible(course: CourseDocument): Promise<void> {
    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (!allowed) return;
    if (course.departmentIds.length === 0) return;

    const allowedSet = new Set(allowed.map(String));
    const overlaps = course.departmentIds.some((id) => allowedSet.has(String(id)));

    // 404, not 403: a 403 would confirm the course exists.
    if (!overlaps) throw new NotFoundError('Course');
  }

  private async assertRelationsExist(
    input: Partial<CreateCourseInput> | UpdateCourseInput,
  ): Promise<void> {
    if (input.departmentIds?.length) {
      const departments = await this.departmentRepository.findMany({
        _id: { $in: input.departmentIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (departments.length !== input.departmentIds.length) {
        throw new ValidationError('One or more departments could not be found.', [
          { field: 'departmentIds', message: 'Unknown department' },
        ]);
      }
    }

    if (input.batchIds?.length) {
      const batches = await this.batchRepository.findMany({
        _id: { $in: input.batchIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (batches.length !== input.batchIds.length) {
        throw new ValidationError('One or more batches could not be found.', [
          { field: 'batchIds', message: 'Unknown batch' },
        ]);
      }
    }

    if (input.instructorIds?.length) {
      await this.assertFacultyExist(input.instructorIds);
    }

    if (input.prerequisites?.length) {
      const prerequisites = await this.courseRepository.findMany({
        _id: { $in: input.prerequisites.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (prerequisites.length !== input.prerequisites.length) {
        throw new ValidationError('One or more prerequisite courses could not be found.', [
          { field: 'prerequisites', message: 'Unknown course' },
        ]);
      }
    }
  }

  private async assertFacultyExist(instructorIds: string[]): Promise<void> {
    if (instructorIds.length === 0) return;

    const staff = await this.facultyRepository.findMany({
      _id: { $in: instructorIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: 'active',
    });

    if (staff.length !== instructorIds.length) {
      throw new ValidationError('One or more instructors could not be found or are inactive.', [
        { field: 'instructorIds', message: 'Unknown or inactive staff member' },
      ]);
    }
  }

  /** Dashboard/analytics summary for the course catalogue. */
  async analytics() {
    const collegeId = requestContext.get().collegeId;
    if (!collegeId) throw new BusinessRuleError('No college context is available.');

    const [total, published, draft, byCategory] = await Promise.all([
      this.courseRepository.count(),
      this.courseRepository.count({ status: 'published' }),
      this.courseRepository.count({ status: 'draft' }),
      this.courseRepository.countByCategory(),
    ]);

    return { total, published, draft, byCategory };
  }
}
