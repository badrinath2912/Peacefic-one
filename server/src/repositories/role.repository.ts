import type mongoose from 'mongoose';

import { BaseRepository } from './base.repository';

import { RoleModel, type RoleDocument } from '@/models/role.model';


export class RoleRepository extends BaseRepository<RoleDocument> {
  constructor() {
    super(RoleModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'name', 'key'],
      searchableFields: ['name', 'key'],
      filterableFields: ['scope', 'isSystem', 'collegeId'],
      populatableFields: [],
      defaultSort: 'name',
    });
  }

  /** System roles have `collegeId: null`; college-defined roles set it. */
  async findByKey(key: string, collegeId?: mongoose.Types.ObjectId | null): Promise<RoleDocument | null> {
    return this.model.findOne({ key, collegeId: collegeId ?? null, deletedAt: null }).exec();
  }

  async findSystemRoles(): Promise<RoleDocument[]> {
    return this.model.find({ isSystem: true, deletedAt: null }).sort({ name: 1 }).exec();
  }

  async findForCollege(collegeId: mongoose.Types.ObjectId): Promise<RoleDocument[]> {
    return this.model
      .find({ $or: [{ collegeId }, { collegeId: null }], deletedAt: null })
      .sort({ isSystem: -1, name: 1 })
      .exec();
  }

  async keyExists(key: string, collegeId: mongoose.Types.ObjectId | null): Promise<boolean> {
    return (await this.model.exists({ key, collegeId, deletedAt: null })) !== null;
  }
}
