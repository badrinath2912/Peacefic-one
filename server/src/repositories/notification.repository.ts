import type mongoose from 'mongoose';
import { type ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { NotificationModel, type NotificationDocument } from '@/models/notification.model';


export class NotificationRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(NotificationModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'priority'],
      searchableFields: ['title'],
      filterableFields: ['userId', 'category', 'type', 'priority', 'readAt'],
      populatableFields: [],
      defaultSort: '-createdAt',
    });
  }

  async findForUser(
    userId: mongoose.Types.ObjectId,
    options: { page?: number; limit?: number; category?: string; unread?: boolean } = {},
  ) {
    const filter: Record<string, unknown> = { userId, archivedAt: null };
    if (options.category) filter.category = options.category;
    if (options.unread) filter.readAt = null;

    return this.paginate({
      page: options.page,
      limit: options.limit,
      filter,
      sort: '-createdAt',
    });
  }

  async unreadCount(userId: mongoose.Types.ObjectId): Promise<number> {
    return this.model.countDocuments({ userId, readAt: null, archivedAt: null, deletedAt: null }).exec();
  }

  async markRead(
    notificationId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
  ): Promise<NotificationDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: notificationId, userId, readAt: null },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async markAllRead(userId: mongoose.Types.ObjectId): Promise<number> {
    const result = await this.model
      .updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } })
      .exec();
    return result.modifiedCount;
  }

  async archive(
    notificationId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: notificationId, userId }, { $set: { archivedAt: new Date() } })
      .exec();
  }

  /**
   * Fan-out write: one document per recipient. Batched by the caller so a
   * 5,000-recipient announcement never runs inside a request.
   */
  async createBatch(
    notifications: Array<Partial<NotificationDocument>>,
    session?: ClientSession,
  ): Promise<number> {
    if (notifications.length === 0) return 0;
    const created = await this.model.insertMany(notifications, { session, ordered: false });
    return created.length;
  }
}
