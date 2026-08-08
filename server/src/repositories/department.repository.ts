import mongoose, { type ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { DepartmentModel, type DepartmentDocument } from '@/models/department.model';


export type DepartmentStatKey = 'totalStudents' | 'totalFaculty' | 'totalBatches';

export class DepartmentRepository extends BaseRepository<DepartmentDocument> {
  constructor() {
    super(DepartmentModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'name', 'code', 'status'],
      searchableFields: ['name', 'code'],
      filterableFields: ['status', 'hodId', 'createdAt'],
      populatableFields: ['hodId'],
      defaultSort: 'name',
    });
  }

  async findByCode(code: string): Promise<DepartmentDocument | null> {
    return this.findOne({ code: code.toUpperCase().trim() });
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { code: code.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async findActive(): Promise<DepartmentDocument[]> {
    return this.findMany({ status: 'active' }, { sort: 'name' });
  }

  async findByHod(hodId: mongoose.Types.ObjectId): Promise<DepartmentDocument[]> {
    return this.findMany({ hodId });
  }

  async incrementStat(
    departmentId: mongoose.Types.ObjectId,
    key: DepartmentStatKey,
    delta: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: departmentId }, { $inc: { [`stats.${key}`]: delta } }, { session })
      .exec();
  }

  /** Populates the relations an export or detail view needs, in one pass. */
  async populateRelations(departments: DepartmentDocument[]): Promise<void> {
    await DepartmentModel.populate(departments, [
      { path: 'hodId', select: 'firstName lastName email' },
    ]);
  }

  /** Maps department codes to ids in one round trip, used by bulk imports. */
  async mapCodesToIds(codes: string[]): Promise<Map<string, mongoose.Types.ObjectId>> {
    const normalized = Array.from(new Set(codes.map((c) => c.toUpperCase().trim())));
    const departments = await this.findMany({ code: { $in: normalized } });
    return new Map(departments.map((d) => [d.code, d._id]));
  }
}
