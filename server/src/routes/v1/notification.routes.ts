import { idParamSchema, notificationListQuerySchema } from '@peacefic/shared';
import { Router } from 'express';

import { notificationService } from '@/container';
import { NotificationController } from '@/controllers/notification.controller';
import { authorize } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new NotificationController(notificationService);

/**
 * Narrowed to what `NotificationRepository.findForUser` actually applies.
 *
 * The shared schema also carries `priority`, plus `sort`, `search`, `fields`
 * and `include` from `paginationQuerySchema` — none of which that method reads.
 * Declaring them would accept a filter and then quietly ignore it, so they are
 * picked out here rather than promised.
 */
const listQuerySchema = notificationListQuerySchema.pick({
  page: true,
  limit: true,
  category: true,
  unread: true,
});

/**
 * A user's own notification inbox.
 *
 * Every route is self-service and gated on `notification:read`, which all six
 * roles hold. There is no `notification:read_all`, and none is invented here:
 * the recipient comes from the token on every route, so there is no id a caller
 * could supply to reach someone else's inbox.
 *
 * Marking read and archiving are gated on the same permission because the
 * catalogue defines no separate one, and both act only on the caller's own
 * rows — reading your inbox and clearing it are not different authorities.
 */
export function notificationRoutes(): Router {
  const router = Router();

  // Static segments before `/:id`, per the convention used elsewhere.
  router.get('/unread-count', authorize('notification:read'), asyncHandler(controller.unreadCount));

  router.patch('/read-all', authorize('notification:read'), asyncHandler(controller.markAllRead));

  router.get(
    '/',
    authorize('notification:read'),
    validate({ query: listQuerySchema }),
    asyncHandler(controller.list),
  );

  router.patch(
    '/:id/read',
    authorize('notification:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.markRead),
  );

  router.delete(
    '/:id',
    authorize('notification:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.archive),
  );

  return router;
}
