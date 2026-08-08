import type mongoose from 'mongoose';

import { BaseRepository } from './base.repository';

import { ActivityLogModel, type ActivityLogDocument } from '@/models/activity-log.model';


export class ActivityLogRepository extends BaseRepository<ActivityLogDocument> {
  constructor() {
    super(ActivityLogModel, {
      tenantScoped: true,
      sortableFields: ['createdAt'],
      searchableFields: ['action', 'userEmail'],
      filterableFields: [
        'userId',
        'action',
        'category',
        'severity',
        'outcome',
        'entity.type',
        'entity.id',
        'createdAt',
      ],
      populatableFields: ['userId'],
      defaultSort: '-createdAt',
      maxLimit: 100,
    });
  }

  /**
   * Append-only: the model blocks updates and deletes, so this repository
   * deliberately exposes no mutation beyond `create`.
   */
  async append(entry: Partial<ActivityLogDocument>): Promise<void> {
    await this.model.create([entry], { ordered: true });
  }

  async findForEntity(
    entityType: string,
    entityId: mongoose.Types.ObjectId,
    limit = 50,
  ): Promise<ActivityLogDocument[]> {
    return this.findMany(
      { 'entity.type': entityType, 'entity.id': entityId },
      { sort: '-createdAt', limit },
    );
  }

  async findRecent(limit = 10): Promise<ActivityLogDocument[]> {
    return this.findMany({}, { sort: '-createdAt', limit });
  }

  async countBySeverity(since: Date): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  }
}
