import type { NotificationCategory, NotificationPriority } from '@peacefic/shared';
import mongoose from 'mongoose';

import type { EmailService, EmailTemplate } from './email.service';

import { logger } from '@/config/logger';
import { requestContext } from '@/config/request-context';
import type { NotificationDocument } from '@/models/notification.model';
import type { NotificationRepository } from '@/repositories/notification.repository';
import type { UserRepository } from '@/repositories/user.repository';

export interface NotifyInput {
  userIds: Array<string | mongoose.Types.ObjectId>;
  type: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  entity?: { type: string; id: string | mongoose.Types.ObjectId } | null;
  email?: { template: EmailTemplate; data: Record<string, unknown> };
  expiresAt?: Date | null;
}

/** Written in chunks so a large audience never builds one enormous insert. */
const FANOUT_CHUNK_SIZE = 500;

export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Fan-out write: one document per recipient. That is deliberate — the
   * commonest query is "my unread notifications, newest first", and a shared
   * document plus per-user read state would make that a join.
   */
  async notify(input: NotifyInput): Promise<number> {
    const context = requestContext.tryGet();
    const collegeId = context?.collegeId ? new mongoose.Types.ObjectId(context.collegeId) : null;
    const actorId = context?.userId ? new mongoose.Types.ObjectId(context.userId) : null;

    const recipientIds = Array.from(new Set(input.userIds.map(String))).filter((id) =>
      mongoose.isValidObjectId(id),
    );

    if (recipientIds.length === 0) return 0;

    const wantsEmail = Boolean(input.email);
    let written = 0;

    for (let offset = 0; offset < recipientIds.length; offset += FANOUT_CHUNK_SIZE) {
      const chunk = recipientIds.slice(offset, offset + FANOUT_CHUNK_SIZE);

      const documents = chunk.map((userId) => ({
        collegeId,
        userId: new mongoose.Types.ObjectId(userId),
        type: input.type,
        category: input.category,
        priority: input.priority ?? 'normal',
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
        actionLabel: input.actionLabel ?? null,
        entity: input.entity
          ? { type: input.entity.type, id: new mongoose.Types.ObjectId(String(input.entity.id)) }
          : null,
        channels: { inApp: true, email: wantsEmail, push: false },
        deliveryStatus: {
          inApp: 'delivered' as const,
          email: wantsEmail ? ('pending' as const) : ('skipped' as const),
          push: 'skipped' as const,
        },
        expiresAt: input.expiresAt ?? null,
        createdByUserId: actorId,
      }));

      written += await this.notificationRepository.createBatch(
        documents as Array<Partial<NotificationDocument>>,
      );
    }

    if (input.email) await this.dispatchEmails(recipientIds, input.email);

    return written;
  }

  /** Honours each recipient's own email preference. */
  private async dispatchEmails(
    recipientIds: string[],
    email: { template: EmailTemplate; data: Record<string, unknown> },
  ): Promise<void> {
    const users = await this.userRepository.findMany({
      _id: { $in: recipientIds.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    for (const user of users) {
      await this.emailService.enqueue(
        email.template,
        user.email,
        { firstName: user.firstName, ...email.data },
        { respectPreferences: true, optedIn: user.preferences.emailNotifications },
      );
    }
  }

  async listForUser(
    userId: string,
    options: { page?: number; limit?: number; category?: string; unread?: boolean } = {},
  ) {
    return this.notificationRepository.findForUser(new mongoose.Types.ObjectId(userId), options);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepository.unreadCount(new mongoose.Types.ObjectId(userId));
  }

  async markRead(userId: string, notificationId: string): Promise<number> {
    if (!mongoose.isValidObjectId(notificationId)) return this.unreadCount(userId);

    await this.notificationRepository.markRead(
      new mongoose.Types.ObjectId(notificationId),
      new mongoose.Types.ObjectId(userId),
    );
    return this.unreadCount(userId);
  }

  async markAllRead(userId: string): Promise<number> {
    return this.notificationRepository.markAllRead(new mongoose.Types.ObjectId(userId));
  }

  async archive(userId: string, notificationId: string): Promise<void> {
    if (!mongoose.isValidObjectId(notificationId)) return;
    await this.notificationRepository.archive(
      new mongoose.Types.ObjectId(notificationId),
      new mongoose.Types.ObjectId(userId),
    );
  }

  /** Notification failures must never break the operation that triggered them. */
  async notifySafely(input: NotifyInput): Promise<void> {
    try {
      await this.notify(input);
    } catch (error) {
      logger.error('Failed to dispatch notifications', {
        type: input.type,
        recipients: input.userIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
