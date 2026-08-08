import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import {
  TrainingEnrollmentModel,
  type TrainingEnrollmentDocument,
} from '@/models/training-enrollment.model';
import {
  TrainingRequestModel,
  type TrainingRequestDocument,
} from '@/models/training-request.model';
import {
  TrainingSessionModel,
  type TrainingSessionDocument,
} from '@/models/training-session.model';


export class TrainingRequestRepository extends BaseRepository<TrainingRequestDocument> {
  constructor() {
    super(TrainingRequestModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'reference', 'title', 'priority', 'status', 'preferredStartDate'],
      searchableFields: ['reference', 'title'],
      filterableFields: [
        'status',
        'approvalStatus',
        'trainingType',
        'priority',
        'departmentIds',
        'requestedBy',
        'createdAt',
      ],
      populatableFields: ['departmentIds', 'batchIds', 'requestedBy', 'reviewedBy', 'sessionIds'],
      defaultSort: '-createdAt',
    });
  }

  /**
   * Sequence per college per month. Read-then-write is acceptable here because
   * requests are created by hand at human pace, not in bulk.
   */
  async nextReference(): Promise<number> {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    return this.count({ createdAt: { $gte: start } });
  }

  async findPendingApproval(): Promise<TrainingRequestDocument[]> {
    return this.findMany(
      { status: 'submitted', approvalStatus: 'pending' },
      { sort: '-createdAt' },
    );
  }

  async populateRelations(requests: TrainingRequestDocument[]): Promise<void> {
    await TrainingRequestModel.populate(requests, [
      { path: 'departmentIds', select: 'name code' },
      { path: 'batchIds', select: 'name code' },
      { path: 'requestedBy', select: 'firstName lastName email' },
      { path: 'reviewedBy', select: 'firstName lastName email' },
    ]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }
}

export class TrainingSessionRepository extends BaseRepository<TrainingSessionDocument> {
  constructor() {
    super(TrainingSessionModel, {
      tenantScoped: true,
      sortableFields: ['startDate', 'endDate', 'createdAt', 'title', 'capacity', 'status'],
      searchableFields: ['title'],
      filterableFields: [
        'status',
        'trainingType',
        'mode',
        'departmentIds',
        'batchIds',
        'trainerIds',
        'requestId',
        'startDate',
      ],
      populatableFields: ['departmentIds', 'batchIds', 'trainerIds', 'requestId'],
      defaultSort: '-startDate',
    });
  }

  /** Sessions overlapping a window — the calendar's only query. */
  async findInRange(
    from: Date,
    to: Date,
    filter: FilterQuery<TrainingSessionDocument> = {},
  ): Promise<TrainingSessionDocument[]> {
    return this.findMany(
      {
        ...filter,
        // Overlap, not containment: a session spanning the window must appear.
        startDate: { $lte: to },
        endDate: { $gte: from },
        status: { $ne: 'cancelled' },
      },
      { sort: 'startDate', limit: 500 },
    );
  }

  /** Sessions a trainer is already committed to in a window. */
  async findTrainerConflicts(
    trainerIds: mongoose.Types.ObjectId[],
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<TrainingSessionDocument[]> {
    const filter: FilterQuery<TrainingSessionDocument> = {
      trainerIds: { $in: trainerIds },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
      status: { $in: ['scheduled', 'in_progress'] },
    };

    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };

    return this.findMany(filter);
  }

  async adjustStats(
    sessionId: mongoose.Types.ObjectId,
    deltas: Partial<Record<'enrolledCount' | 'completedCount' | 'withdrawnCount', number>>,
    session?: ClientSession,
  ): Promise<void> {
    const increments: Record<string, number> = {};
    for (const [key, value] of Object.entries(deltas)) increments[`stats.${key}`] = value;

    await this.model
      .updateOne(this.scope({ _id: sessionId }), { $inc: increments }, { session })
      .exec();
  }

  async populateRelations(sessions: TrainingSessionDocument[]): Promise<void> {
    await TrainingSessionModel.populate(sessions, [
      { path: 'departmentIds', select: 'name code' },
      { path: 'batchIds', select: 'name code' },
      {
        path: 'trainerIds',
        select: 'employeeId designation userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
    ]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }
}

export class TrainingEnrollmentRepository extends BaseRepository<TrainingEnrollmentDocument> {
  constructor() {
    super(TrainingEnrollmentModel, {
      tenantScoped: true,
      sortableFields: ['enrolledAt', 'status'],
      searchableFields: [],
      filterableFields: ['sessionId', 'studentId', 'batchId', 'status'],
      populatableFields: ['studentId', 'sessionId'],
      defaultSort: '-enrolledAt',
    });
  }

  async findBySession(sessionId: mongoose.Types.ObjectId): Promise<TrainingEnrollmentDocument[]> {
    return this.findMany({ sessionId, status: { $ne: 'withdrawn' } });
  }

  async findStudentIds(sessionId: mongoose.Types.ObjectId): Promise<string[]> {
    const rows = await this.model
      .find(this.scope({ sessionId, status: { $ne: 'withdrawn' } }))
      .select('studentId')
      .lean()
      .exec();

    return rows.map((row) => String(row.studentId));
  }

  /**
   * Enrols many students in one write. Upsert rather than insert so
   * re-enrolling a withdrawn student reactivates their row instead of
   * colliding with the unique index.
   */
  async enrolMany(
    sessionId: mongoose.Types.ObjectId,
    entries: Array<{ studentId: mongoose.Types.ObjectId; batchId: mongoose.Types.ObjectId }>,
    enrolledBy: mongoose.Types.ObjectId | null,
    session?: ClientSession,
  ): Promise<number> {
    if (entries.length === 0) return 0;

    const collegeId = this.tenantId();
    const now = new Date();

    const operations = entries.map((entry) => ({
      updateOne: {
        filter: {
          collegeId,
          sessionId,
          studentId: entry.studentId,
          deletedAt: null,
        },
        update: {
          $set: {
            batchId: entry.batchId,
            status: 'enrolled',
            withdrawnAt: null,
            withdrawalReason: null,
          },
          $setOnInsert: {
            collegeId,
            sessionId,
            studentId: entry.studentId,
            enrolledAt: now,
            enrolledBy,
          },
        },
        upsert: true,
      },
    }));

    const result = await this.bulkWrite(operations, session);
    return result.upsertedCount + result.modifiedCount;
  }

  async withdrawMany(
    sessionId: mongoose.Types.ObjectId,
    studentIds: mongoose.Types.ObjectId[],
    reason: string | null,
    session?: ClientSession,
  ): Promise<number> {
    return this.updateMany(
      { sessionId, studentId: { $in: studentIds }, status: { $ne: 'withdrawn' } },
      {
        $set: { status: 'withdrawn', withdrawnAt: new Date(), withdrawalReason: reason },
      },
      session,
    );
  }

  async markCompleted(
    sessionId: mongoose.Types.ObjectId,
    studentIds: mongoose.Types.ObjectId[],
    session?: ClientSession,
  ): Promise<number> {
    if (studentIds.length === 0) return 0;

    return this.updateMany(
      { sessionId, studentId: { $in: studentIds }, status: { $ne: 'withdrawn' } },
      { $set: { status: 'completed', completedAt: new Date() } },
      session,
    );
  }

  async countBySessionStatus(
    sessionId: mongoose.Types.ObjectId,
  ): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: { sessionId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async populateRelations(enrollments: TrainingEnrollmentDocument[]): Promise<void> {
    await TrainingEnrollmentModel.populate(enrollments, [
      {
        path: 'studentId',
        select: 'rollNumber userId batchId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
    ]);
  }
}
