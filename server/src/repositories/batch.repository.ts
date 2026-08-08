import mongoose, { type ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { BatchModel, type BatchDocument } from '@/models/batch.model';


export class BatchRepository extends BaseRepository<BatchDocument> {
  constructor() {
    super(BatchModel, {
      tenantScoped: true,
      sortableFields: [
        'createdAt',
        'name',
        'code',
        'admissionYear',
        'graduationYear',
        'currentSemester',
        'status',
      ],
      searchableFields: ['name', 'code'],
      filterableFields: [
        'departmentId',
        'status',
        'admissionYear',
        'graduationYear',
        'currentSemester',
        'classAdvisorId',
      ],
      populatableFields: ['departmentId', 'classAdvisorId'],
      defaultSort: '-admissionYear',
    });
  }

  async findByCode(code: string): Promise<BatchDocument | null> {
    return this.findOne({ code: code.toUpperCase().trim() });
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { code: code.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async findByDepartment(departmentId: mongoose.Types.ObjectId): Promise<BatchDocument[]> {
    return this.findMany({ departmentId, status: 'active' });
  }

  async findActive(): Promise<BatchDocument[]> {
    return this.findMany({ status: 'active' });
  }

  async incrementStudentCount(
    batchId: mongoose.Types.ObjectId,
    delta: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: batchId }, { $inc: { 'stats.totalStudents': delta } }, { session })
      .exec();
  }

  async hasCapacity(batchId: mongoose.Types.ObjectId, additional = 1): Promise<boolean> {
    const batch = await this.findById(batchId);
    if (!batch) return false;
    return batch.stats.totalStudents + additional <= batch.capacity;
  }

  async advanceSemester(
    batchId: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<BatchDocument | null> {
    return this.model
      .findOneAndUpdate(
        this.scope({ _id: batchId }),
        { $inc: { currentSemester: 1 } },
        { new: true, session },
      )
      .exec();
  }

  /** Populates the relations an export or detail view needs, in one pass. */
  async populateRelations(batches: BatchDocument[]): Promise<void> {
    await BatchModel.populate(batches, [
      { path: 'departmentId', select: 'name code' },
      { path: 'classAdvisorId', select: 'firstName lastName email' },
    ]);
  }

  async mapCodesToIds(codes: string[]): Promise<Map<string, BatchDocument>> {
    const normalized = Array.from(new Set(codes.map((c) => c.toUpperCase().trim())));
    const batches = await this.findMany({ code: { $in: normalized } });
    return new Map(batches.map((b) => [b.code, b]));
  }
}
