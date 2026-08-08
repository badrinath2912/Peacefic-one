import mongoose, { type ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { CollegeModel, type CollegeDocument } from '@/models/college.model';


export type CollegeStatKey = 'totalStudents' | 'totalFaculty' | 'totalDepartments' | 'totalBatches';

export class CollegeRepository extends BaseRepository<CollegeDocument> {
  constructor() {
    super(CollegeModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'name', 'code', 'status', 'establishedYear'],
      searchableFields: ['name', 'code', 'email'],
      filterableFields: ['status', 'type', 'createdAt'],
      populatableFields: ['approvedBy'],
    });
  }

  async findByCode(code: string): Promise<CollegeDocument | null> {
    return this.model.findOne({ code: code.toUpperCase().trim(), deletedAt: null }).exec();
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { code: code.toUpperCase().trim(), deletedAt: null };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return (await this.model.exists(filter)) !== null;
  }

  /** Join codes are `select: false`; this is the only place they are read. */
  async findByJoinCode(joinCode: string): Promise<CollegeDocument | null> {
    return this.model
      .findOne({
        'settings.joinCode': joinCode.trim(),
        'settings.allowStudentSelfRegistration': true,
        status: 'active',
        deletedAt: null,
      })
      .select('+settings.joinCode')
      .exec();
  }

  async findPending(): Promise<CollegeDocument[]> {
    return this.model.find({ status: 'pending', deletedAt: null }).sort({ createdAt: 1 }).exec();
  }

  /**
   * Adjusts a denormalised counter. Called inside the same transaction as the
   * underlying change; a nightly job reconciles any drift.
   */
  async incrementStat(
    collegeId: mongoose.Types.ObjectId,
    key: CollegeStatKey,
    delta: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: collegeId }, { $inc: { [`stats.${key}`]: delta } }, { session })
      .exec();
  }

  async setStats(
    collegeId: mongoose.Types.ObjectId,
    stats: Partial<Record<CollegeStatKey, number>>,
  ): Promise<void> {
    const update: Record<string, number> = {};
    for (const [key, value] of Object.entries(stats)) update[`stats.${key}`] = value;
    await this.model.updateOne({ _id: collegeId }, { $set: update }).exec();
  }

  async getAttendanceThreshold(collegeId: mongoose.Types.ObjectId): Promise<number> {
    const college = await this.model
      .findById(collegeId)
      .select('settings.attendanceThresholdPercent')
      .lean()
      .exec();
    return college?.settings?.attendanceThresholdPercent ?? 75;
  }
}
