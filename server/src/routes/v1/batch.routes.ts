import {
  batchListQuerySchema,
  bulkIdsSchema,
  createBatchSchema,
  idParamSchema,
  objectIdSchema,
  paginationQuerySchema,
  promoteBatchSchema,
  updateBatchSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { batchRepository, batchService, exportService } from '@/container';
import { BatchController } from '@/controllers/batch.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new BatchController(batchService, batchRepository, exportService);

export function batchRoutes(): Router {
  const router = Router();

  // Static segments before `/:id` so they are not parsed as identifiers.
  router.post(
    '/bulk/export',
    authorize('batch:read'),
    exportRateLimit,
    validate({
      query: batchListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
      body: z.object({ ids: z.array(objectIdSchema).max(2000).optional() }),
    }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/bulk',
    authorize('batch:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDelete),
  );

  router.get(
    '/',
    authorize('batch:read'),
    validate({ query: batchListQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    authorize('batch:create'),
    validate({ body: createBatchSchema }),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    authorize('batch:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    authorize('batch:update'),
    validate({ params: idParamSchema, body: updateBatchSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    authorize('batch:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.remove),
  );

  router.get(
    '/:id/students',
    authorize('student:read'),
    validate({ params: idParamSchema, query: paginationQuerySchema }),
    asyncHandler(controller.listStudents),
  );

  // Irreversible: the body must carry an explicit confirmation.
  router.post(
    '/:id/promote',
    authorize('batch:promote'),
    validate({ params: idParamSchema, body: promoteBatchSchema }),
    asyncHandler(controller.promote),
  );

  router.get(
    '/:id/analytics',
    authorize('analytics:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.analytics),
  );

  return router;
}
