import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import { StudentModel, type StudentDocument } from '@/models/student.model';


export interface StudentFilters {
  departmentId?: string;
  batchId?: string;
  status?: string;
  currentSemester?: number;
  gender?: string;
  isPlaced?: boolean;
  isEligible?: boolean;
  minCgpa?: number;
  maxCgpa?: number;
  maxBacklogs?: number;
  skill?: string;
}

export class StudentRepository extends BaseRepository<StudentDocument> {
  constructor() {
    super(StudentModel, {
      tenantScoped: true,
      sortableFields: [
        'createdAt',
        'rollNumber',
        'admissionDate',
        'currentSemester',
        'academics.currentCgpa',
        'status',
      ],
      searchableFields: ['rollNumber', 'registerNumber'],
      filterableFields: [
        'departmentId',
        'batchId',
        'status',
        'currentSemester',
        'gender',
        'placement.isPlaced',
        'placement.isEligible',
        'academics.currentCgpa',
        'academics.activeBacklogs',
        'createdAt',
      ],
      populatableFields: ['userId', 'departmentId', 'batchId'],
      defaultSort: 'rollNumber',
    });
  }

  async findByUserId(userId: string | mongoose.Types.ObjectId): Promise<StudentDocument | null> {
    if (!mongoose.isValidObjectId(userId)) return null;
    return this.findOne({ userId: new mongoose.Types.ObjectId(String(userId)) });
  }

  async findByRollNumber(rollNumber: string): Promise<StudentDocument | null> {
    return this.findOne({ rollNumber: rollNumber.toUpperCase().trim() });
  }

  async rollNumberExists(rollNumber: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<StudentDocument> = {
      rollNumber: rollNumber.toUpperCase().trim(),
    };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async admissionNumberExists(admissionNumber: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<StudentDocument> = {
      admissionNumber: admissionNumber.toUpperCase().trim(),
    };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  /** Duplicate detection without ever comparing raw Aadhaar numbers. */
  async aadhaarHashExists(hash: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<StudentDocument> = { 'aadhaar.hash': hash };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async findByBatch(batchId: mongoose.Types.ObjectId): Promise<StudentDocument[]> {
    return this.findMany({ batchId, status: { $in: ['active', 'on_leave'] } }, { sort: 'rollNumber' });
  }

  async findIdsByBatch(batchId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
    const students = await this.model
      .find(this.scope({ batchId, status: { $in: ['active', 'on_leave'] } }))
      .select('_id')
      .lean()
      .exec();
    return students.map((s) => s._id);
  }

  /** Translates the UI's filter shape into a Mongo filter. */
  buildFilters(filters: StudentFilters): FilterQuery<StudentDocument> {
    const filter: FilterQuery<StudentDocument> = {};

    if (filters.departmentId) filter.departmentId = new mongoose.Types.ObjectId(filters.departmentId);
    if (filters.batchId) filter.batchId = new mongoose.Types.ObjectId(filters.batchId);
    if (filters.status) filter.status = filters.status;
    if (filters.currentSemester) filter.currentSemester = filters.currentSemester;
    if (filters.gender) filter.gender = filters.gender;
    if (filters.isPlaced !== undefined) filter['placement.isPlaced'] = filters.isPlaced;
    if (filters.isEligible !== undefined) filter['placement.isEligible'] = filters.isEligible;
    if (filters.skill) filter['skills.name'] = filters.skill;

    if (filters.minCgpa !== undefined || filters.maxCgpa !== undefined) {
      const cgpa: Record<string, number> = {};
      if (filters.minCgpa !== undefined) cgpa.$gte = filters.minCgpa;
      if (filters.maxCgpa !== undefined) cgpa.$lte = filters.maxCgpa;
      filter['academics.currentCgpa'] = cgpa;
    }

    if (filters.maxBacklogs !== undefined) {
      filter['academics.activeBacklogs'] = { $lte: filters.maxBacklogs };
    }

    return filter;
  }

  async updateAcademics(
    studentId: mongoose.Types.ObjectId,
    academics: Partial<StudentDocument['academics']>,
    session?: ClientSession,
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(academics)) update[`academics.${key}`] = value;
    await this.model.updateOne(this.scope({ _id: studentId }), { $set: update }, { session }).exec();
  }

  async updateEligibility(
    studentId: mongoose.Types.ObjectId,
    isEligible: boolean,
    note: string | null,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scope({ _id: studentId }),
        { $set: { 'placement.isEligible': isEligible, 'placement.eligibilityNote': note } },
        { session },
      )
      .exec();
  }

  async recordPlacement(
    studentId: mongoose.Types.ObjectId,
    packageAmount: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scope({ _id: studentId }),
        {
          $set: { 'placement.isPlaced': true },
          $inc: { 'placement.placementCount': 1 },
          $max: { 'placement.highestPackage': packageAmount },
        },
        { session },
      )
      .exec();
  }

  /**
   * Marks a student as no longer placed, after their last live offer went.
   *
   * `highestPackage` is deliberately left standing: it is the best offer the
   * student ever received, and a declined offer does not unmake that fact.
   * The caller decides there are no live offers left; this only writes.
   */
  async clearPlacement(
    studentId: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scope({ _id: studentId }),
        {
          $set: { 'placement.isPlaced': false },
          // Floored at zero so a correction cannot drive the count negative.
          $max: { 'placement.placementCount': 0 },
        },
        { session },
      )
      .exec();
  }

  /** Populates the relations an export needs, in one pass rather than per row. */
  async populateRelations(students: StudentDocument[]): Promise<void> {
    await StudentModel.populate(students, [
      { path: 'userId', select: 'firstName lastName email phone' },
      { path: 'departmentId', select: 'name code' },
      { path: 'batchId', select: 'name code' },
    ]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  }

  async countByDepartment(): Promise<Array<{ departmentId: string; count: number }>> {
    const rows = await this.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({ departmentId: String(r._id), count: r.count }));
  }

  async cgpaDistribution(): Promise<Array<{ bucket: string; count: number }>> {
    const rows = await this.aggregate<{ _id: number; count: number }>([
      { $match: { status: 'active', 'academics.currentCgpa': { $ne: null } } },
      {
        $bucket: {
          groupBy: '$academics.currentCgpa',
          boundaries: [0, 5, 6, 7, 8, 9, 10.01],
          default: 'unknown',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    const labels: Record<string, string> = {
      '0': '< 5.0',
      '5': '5.0 - 5.9',
      '6': '6.0 - 6.9',
      '7': '7.0 - 7.9',
      '8': '8.0 - 8.9',
      '9': '9.0 +',
    };

    return rows.map((r) => ({ bucket: labels[String(r._id)] ?? 'Unknown', count: r.count }));
  }
}
