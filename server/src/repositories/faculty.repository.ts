import mongoose, { type ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { FacultyModel, type FacultyDocument } from '@/models/faculty.model';


export class FacultyRepository extends BaseRepository<FacultyDocument> {
  constructor() {
    super(FacultyModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'employeeId', 'designation', 'joiningDate', 'experienceYears', 'status'],
      searchableFields: ['employeeId', 'designation'],
      filterableFields: ['departmentId', 'status', 'type', 'employmentType', 'assignedBatchIds'],
      populatableFields: ['userId', 'departmentId', 'assignedBatchIds'],
      defaultSort: 'employeeId',
    });
  }

  async findByUserId(userId: string | mongoose.Types.ObjectId): Promise<FacultyDocument | null> {
    if (!mongoose.isValidObjectId(userId)) return null;
    return this.findOne({ userId: new mongoose.Types.ObjectId(String(userId)) });
  }

  async findByEmployeeId(employeeId: string): Promise<FacultyDocument | null> {
    return this.findOne({ employeeId: employeeId.toUpperCase().trim() });
  }

  async employeeIdExists(employeeId: string, excludeId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { employeeId: employeeId.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async findByBatch(batchId: mongoose.Types.ObjectId): Promise<FacultyDocument[]> {
    return this.findMany({ assignedBatchIds: batchId, status: 'active' });
  }

  async findByDepartment(departmentId: mongoose.Types.ObjectId): Promise<FacultyDocument[]> {
    return this.findMany({ departmentId, status: 'active' });
  }

  async assignBatches(
    facultyId: mongoose.Types.ObjectId,
    batchIds: mongoose.Types.ObjectId[],
    session?: ClientSession,
  ): Promise<FacultyDocument | null> {
    return this.updateById(facultyId, { $set: { assignedBatchIds: batchIds } }, { session });
  }

  async removeBatchFromAll(
    batchId: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    return this.updateMany(
      { assignedBatchIds: batchId },
      { $pull: { assignedBatchIds: batchId } },
      session,
    );
  }

  /** Populates the relations an export or profile needs, in one pass. */
  async populateRelations(staff: FacultyDocument[]): Promise<void> {
    await FacultyModel.populate(staff, [
      { path: 'userId', select: 'firstName lastName email phone status' },
      { path: 'departmentId', select: 'name code' },
    ]);
  }

  async countByType(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  }
}
