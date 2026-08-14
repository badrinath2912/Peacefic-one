import type { ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import {
  StudentRegistrationModel,
  type StudentRegistrationDocument,
} from '@/models/student-registration.model';

/**
 * `tenantScoped: true`, so every read a reviewer makes is narrowed to their own
 * college by `BaseRepository` before this class is involved. That is the
 * isolation boundary for the approval queue; the service does not re-implement
 * it.
 *
 * Registration itself runs unauthenticated, with no tenant in context, so the
 * two writes that happen before approval go through `withoutTenantScope` at the
 * call site with the college resolved from the join code.
 */
export class StudentRegistrationRepository extends BaseRepository<StudentRegistrationDocument> {
  constructor() {
    super(StudentRegistrationModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'reviewedAt', 'rollNumber'],
      searchableFields: ['firstName', 'lastName', 'email', 'rollNumber'],
      filterableFields: ['approvalStatus', 'rollNumber'],
      populatableFields: ['userId', 'reviewedBy', 'studentId'],
    });
  }

  /**
   * A pending application for this roll number in this college.
   *
   * Used to refuse a duplicate before the account is created. Scoped to
   * `pending` so a rejected application does not permanently reserve the number.
   */
  async findPendingByRollNumber(
    collegeId: string,
    rollNumber: string,
    session?: ClientSession,
  ): Promise<StudentRegistrationDocument | null> {
    return this.model
      .findOne({
        collegeId,
        rollNumber: rollNumber.trim().toUpperCase(),
        approvalStatus: 'pending',
        deletedAt: null,
      })
      .session(session ?? null)
      .exec();
  }

  /** The application belonging to an account, newest first. */
  async findByUserId(userId: string): Promise<StudentRegistrationDocument | null> {
    return this.model
      .findOne({ userId, deletedAt: null })
      .sort({ createdAt: -1 })
      .exec();
  }
}
