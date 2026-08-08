import { ROLE_KEYS, hasPermission } from '@peacefic/shared';
import mongoose from 'mongoose';

import { requestContext } from '@/config/request-context';
import { AuthorizationError, NotFoundError } from '@/errors';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { StudentRepository } from '@/repositories/student.repository';

/**
 * A permission answers *what*; scope answers *which rows*.
 *
 * `attendance:mark` does not mean a faculty member may mark any batch in the
 * college — only the batches they teach. Centralising that here means the rule
 * is written and tested once rather than re-derived at forty call sites.
 */
export class ScopeGuard {
  constructor(
    private readonly facultyRepository: FacultyRepository,
    private readonly studentRepository: StudentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly departmentRepository: DepartmentRepository,
  ) {}

  private context() {
    return requestContext.get();
  }

  private isCollegeWide(): boolean {
    const { roleKey, permissions } = this.context();
    return (
      roleKey === ROLE_KEYS.PLATFORM_ADMIN ||
      roleKey === ROLE_KEYS.COLLEGE_ADMIN ||
      hasPermission(permissions, '*:*')
    );
  }

  /** The caller's faculty record, cached onto the request context. */
  private async currentFaculty() {
    const context = this.context();
    if (!context.userId) return null;
    return this.facultyRepository.findByUserId(context.userId);
  }

  private async currentStudent() {
    const context = this.context();
    if (!context.userId) return null;
    return this.studentRepository.findByUserId(context.userId);
  }

  /* ------------------------------- batches -------------------------------- */

  async canAccessBatch(batchId: string | mongoose.Types.ObjectId): Promise<boolean> {
    if (this.isCollegeWide()) return true;

    const { roleKey } = this.context();
    const id = String(batchId);

    if (roleKey === ROLE_KEYS.PLACEMENT_OFFICER) return true;

    if (roleKey === ROLE_KEYS.HOD) {
      const batch = await this.batchRepository.findById(id);
      if (!batch) return false;
      return this.canAccessDepartment(batch.departmentId);
    }

    if (roleKey === ROLE_KEYS.FACULTY || roleKey === ROLE_KEYS.TRAINER) {
      const faculty = await this.currentFaculty();
      if (!faculty) return false;
      return faculty.assignedBatchIds.some((assigned) => String(assigned) === id);
    }

    if (roleKey === ROLE_KEYS.STUDENT) {
      const student = await this.currentStudent();
      return student ? String(student.batchId) === id : false;
    }

    return false;
  }

  async assertCanAccessBatch(batchId: string | mongoose.Types.ObjectId): Promise<void> {
    if (!(await this.canAccessBatch(batchId))) {
      throw new AuthorizationError('You do not have access to this batch.');
    }
  }

  /** The batches a caller may see, used to filter lists rather than reject them. */
  async accessibleBatchIds(): Promise<mongoose.Types.ObjectId[] | null> {
    if (this.isCollegeWide()) return null;

    const { roleKey } = this.context();

    if (roleKey === ROLE_KEYS.PLACEMENT_OFFICER) return null;

    if (roleKey === ROLE_KEYS.HOD) {
      const departmentIds = await this.accessibleDepartmentIds();
      if (!departmentIds) return null;
      const batches = await this.batchRepository.findMany({
        departmentId: { $in: departmentIds },
      });
      return batches.map((b) => b._id);
    }

    if (roleKey === ROLE_KEYS.FACULTY || roleKey === ROLE_KEYS.TRAINER) {
      const faculty = await this.currentFaculty();
      return faculty?.assignedBatchIds ?? [];
    }

    if (roleKey === ROLE_KEYS.STUDENT) {
      const student = await this.currentStudent();
      return student ? [student.batchId] : [];
    }

    return [];
  }

  /* ----------------------------- departments ------------------------------ */

  async canAccessDepartment(departmentId: string | mongoose.Types.ObjectId): Promise<boolean> {
    if (this.isCollegeWide()) return true;

    const { roleKey, userId } = this.context();
    const id = String(departmentId);

    if (roleKey === ROLE_KEYS.PLACEMENT_OFFICER) return true;

    if (roleKey === ROLE_KEYS.HOD) {
      if (!userId) return false;
      const departments = await this.departmentRepository.findByHod(
        new mongoose.Types.ObjectId(userId),
      );
      return departments.some((d) => String(d._id) === id);
    }

    if (roleKey === ROLE_KEYS.FACULTY || roleKey === ROLE_KEYS.TRAINER) {
      const faculty = await this.currentFaculty();
      return faculty ? String(faculty.departmentId) === id : false;
    }

    if (roleKey === ROLE_KEYS.STUDENT) {
      const student = await this.currentStudent();
      return student ? String(student.departmentId) === id : false;
    }

    return false;
  }

  async assertCanAccessDepartment(departmentId: string | mongoose.Types.ObjectId): Promise<void> {
    if (!(await this.canAccessDepartment(departmentId))) {
      throw new AuthorizationError('You do not have access to this department.');
    }
  }

  async accessibleDepartmentIds(): Promise<mongoose.Types.ObjectId[] | null> {
    if (this.isCollegeWide()) return null;

    const { roleKey, userId } = this.context();

    if (roleKey === ROLE_KEYS.PLACEMENT_OFFICER) return null;

    if (roleKey === ROLE_KEYS.HOD && userId) {
      const departments = await this.departmentRepository.findByHod(
        new mongoose.Types.ObjectId(userId),
      );
      return departments.map((d) => d._id);
    }

    if (roleKey === ROLE_KEYS.FACULTY || roleKey === ROLE_KEYS.TRAINER) {
      const faculty = await this.currentFaculty();
      return faculty ? [faculty.departmentId] : [];
    }

    if (roleKey === ROLE_KEYS.STUDENT) {
      const student = await this.currentStudent();
      return student ? [student.departmentId] : [];
    }

    return [];
  }

  /* ------------------------------- students ------------------------------- */

  async canAccessStudent(studentId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const { roleKey } = this.context();

    if (roleKey === ROLE_KEYS.STUDENT) {
      const student = await this.currentStudent();
      return student ? String(student._id) === String(studentId) : false;
    }

    if (this.isCollegeWide() || roleKey === ROLE_KEYS.PLACEMENT_OFFICER) return true;

    const student = await this.studentRepository.findById(studentId);
    if (!student) return false;

    if (roleKey === ROLE_KEYS.HOD) {
      return this.canAccessDepartment(student.departmentId);
    }

    return this.canAccessBatch(student.batchId);
  }

  /**
   * Scope failures return 404 rather than 403 where existence itself is
   * sensitive — a 403 confirms the record exists.
   */
  async assertCanAccessStudent(studentId: string | mongoose.Types.ObjectId): Promise<void> {
    if (!(await this.canAccessStudent(studentId))) {
      throw new NotFoundError('Student');
    }
  }

  /** The student record of the caller. Student-facing endpoints derive the id
   *  from the token; they never accept one from the client. */
  async requireOwnStudent() {
    const student = await this.currentStudent();
    if (!student) {
      throw new AuthorizationError('No student profile is linked to this account.');
    }
    return student;
  }

  async requireOwnFaculty() {
    const faculty = await this.currentFaculty();
    if (!faculty) {
      throw new AuthorizationError('No staff profile is linked to this account.');
    }
    return faculty;
  }

  /* ------------------------------ ownership ------------------------------- */

  assertOwnsResource(ownerUserId: string | mongoose.Types.ObjectId): void {
    const { userId } = this.context();
    if (this.isCollegeWide()) return;
    if (String(ownerUserId) !== String(userId)) {
      throw new NotFoundError('Resource');
    }
  }

  isSelf(userId: string | mongoose.Types.ObjectId): boolean {
    return String(userId) === String(this.context().userId);
  }
}
