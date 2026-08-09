import type { Request, Response } from 'express';

import { requestContext } from '@/config/request-context';
import { AuthenticationError } from '@/errors';
import type { NotificationService } from '@/services/notification.service';
import { sendPaginated, sendSuccess } from '@/utils/response';

/**
 * A user's own notifications.
 *
 * Every method resolves the recipient from the token; no user id is accepted
 * from the client on any route. That is the whole ownership model here —
 * `NotificationRepository` is deliberately **not** tenant-scoped, because a
 * notification belongs to a person rather than to a college, and the repository
 * methods all filter on `userId` themselves.
 *
 * There is no endpoint for sending. `NotificationService.notify` takes an
 * explicit recipient list and performs no check that those users are in the
 * caller's college, so exposing it would hand any sender a cross-tenant write.
 * Resolving an audience safely is service work, not an HTTP layer.
 */
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** The signed-in user. `authenticate` runs first, so this is a guard, not a branch. */
  private currentUserId(): string {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();
    return userId;
  }

  /**
   * Only `page`, `limit`, `category` and `unread` are read, because those are
   * the only options `findForUser` honours — it pins the sort to `-createdAt`
   * and applies `archivedAt: null` itself. The route schema declares exactly
   * these four so nothing a caller sends is silently discarded.
   */
  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.notificationService.listForUser(this.currentUserId(), {
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      category: query.category as string | undefined,
      unread: query.unread as boolean | undefined,
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  unreadCount = async (_req: Request, res: Response): Promise<Response> => {
    const unread = await this.notificationService.unreadCount(this.currentUserId());
    return sendSuccess(res, { unread });
  };

  /**
   * Marking one as read.
   *
   * The service answers with the caller's remaining unread count rather than
   * the notification, and stays silent when the id is not theirs — the
   * repository's update filter carries the `userId`, so someone else's row is
   * simply not matched. That is deliberate: a 404 here would confirm whether a
   * given notification id exists, which is an oracle worth denying. Both cases
   * are therefore an unchanged count, not an error.
   */
  markRead = async (req: Request, res: Response): Promise<Response> => {
    const unread = await this.notificationService.markRead(
      this.currentUserId(),
      req.params.id as string,
    );
    return sendSuccess(res, { unread });
  };

  markAllRead = async (_req: Request, res: Response): Promise<Response> => {
    const userId = this.currentUserId();

    const updated = await this.notificationService.markAllRead(userId);
    // Read back rather than assuming zero: one may have arrived in between.
    const unread = await this.notificationService.unreadCount(userId);

    return sendSuccess(res, { updated, unread });
  };

  /**
   * Dismissing one. Archiving is the model's own idea of removal — `archivedAt`
   * is set and `findForUser` excludes it — so there is no hard delete to
   * expose. Silent for an id that is not the caller's, for the reason above.
   */
  archive = async (req: Request, res: Response): Promise<Response> => {
    const userId = this.currentUserId();

    await this.notificationService.archive(userId, req.params.id as string);
    // Archiving an unread notification changes the badge, so send the new count.
    const unread = await this.notificationService.unreadCount(userId);

    return sendSuccess(res, { unread });
  };
}
