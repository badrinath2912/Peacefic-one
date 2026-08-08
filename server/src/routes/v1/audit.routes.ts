import { auditExportQuerySchema, auditListQuerySchema } from '@peacefic/shared';
import { Router } from 'express';

import { activityLogRepository, auditService, exportService } from '@/container';
import { AuditController } from '@/controllers/audit.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new AuditController(auditService, activityLogRepository, exportService);

/**
 * The audit log, read-only.
 *
 * `audit:read` and `audit:export` are separate on purpose: seeing what happened
 * and walking out of the building with a copy of it are different acts, and
 * only `college_admin` holds either.
 */
export function auditRoutes(): Router {
  const router = Router();

  // Static segment before any `/:id` route, per the convention used elsewhere.
  router.post(
    '/bulk/export',
    authorize('audit:export'),
    exportRateLimit,
    validate({ query: auditExportQuerySchema }),
    asyncHandler(controller.export),
  );

  router.get(
    '/',
    authorize('audit:read'),
    validate({ query: auditListQuerySchema }),
    asyncHandler(controller.list),
  );

  return router;
}
