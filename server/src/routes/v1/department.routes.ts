import {
  assignHodSchema,
  bulkIdsSchema,
  createDepartmentSchema,
  departmentListQuerySchema,
  idParamSchema,
  objectIdSchema,
  updateDepartmentSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { departmentRepository, departmentService, exportService } from '@/container';
import { DepartmentController } from '@/controllers/department.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new DepartmentController(
  departmentService,
  departmentRepository,
  exportService,
);

export function departmentRoutes(): Router {
  const router = Router();

  // Static segments before `/:id` so they are not parsed as identifiers.
  router.post(
    '/bulk/export',
    authorize('department:read'),
    exportRateLimit,
    validate({
      query: departmentListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
      body: z.object({ ids: z.array(objectIdSchema).max(1000).optional() }),
    }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/bulk',
    authorize('department:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDelete),
  );

  router.get(
    '/',
    authorize('department:read'),
    validate({ query: departmentListQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    authorize('department:create'),
    validate({ body: createDepartmentSchema }),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    authorize('department:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    authorize('department:update'),
    validate({ params: idParamSchema, body: updateDepartmentSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    authorize('department:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.remove),
  );

  router.patch(
    '/:id/hod',
    authorize('department:update', 'role:assign'),
    validate({ params: idParamSchema, body: assignHodSchema }),
    asyncHandler(controller.assignHod),
  );

  router.get(
    '/:id/analytics',
    authorize('analytics:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.analytics),
  );

  return router;
}
