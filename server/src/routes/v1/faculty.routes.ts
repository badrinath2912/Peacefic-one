import {
  assignBatchesSchema,
  bulkFacultyIdsSchema,
  createFacultySchema,
  facultyExportQuerySchema,
  facultyListQuerySchema,
  idParamSchema,
  importFacultyRowSchema,
  importStudentsQuerySchema,
  objectIdSchema,
  updateFacultySchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { exportService, facultyRepository, facultyService } from '@/container';
import { FacultyController } from '@/controllers/faculty.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit, importRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new FacultyController(facultyService, facultyRepository, exportService);

const importBodySchema = z.object({
  rows: z.array(importFacultyRowSchema).min(1).max(500),
});

const complianceQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function facultyRoutes(): Router {
  const router = Router();

  // Static segments before `/:id` so they are not parsed as identifiers.
  router.get('/bulk/template', authorize('faculty:import'), asyncHandler(controller.importTemplate));

  // POST because a selection of up to 500 ids will not fit in a URL.
  router.post(
    '/bulk/export',
    authorize('faculty:read'),
    exportRateLimit,
    validate({ query: facultyExportQuerySchema, body: z.object({ ids: z.array(objectIdSchema).max(5000).optional() }) }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/bulk',
    authorize('faculty:delete'),
    validate({ body: bulkFacultyIdsSchema }),
    asyncHandler(controller.bulkDelete),
  );

  router.post(
    '/bulk/import',
    authorize('faculty:import'),
    importRateLimit,
    validate({ body: importBodySchema, query: importStudentsQuerySchema }),
    asyncHandler(controller.importRows),
  );

  router.get(
    '/',
    authorize('faculty:read'),
    validate({ query: facultyListQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    authorize('faculty:create'),
    validate({ body: createFacultySchema }),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    authorize('faculty:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    authorize('faculty:update'),
    validate({ params: idParamSchema, body: updateFacultySchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    authorize('faculty:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.remove),
  );

  router.get(
    '/:id/profile',
    authorize('faculty:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getProfile),
  );

  router.patch(
    '/:id/batches',
    authorize('faculty:update'),
    validate({ params: idParamSchema, body: assignBatchesSchema }),
    asyncHandler(controller.assignBatches),
  );

  router.get(
    '/:id/workload',
    authorize('faculty:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.workload),
  );

  router.get(
    '/:id/attendance-compliance',
    authorize('faculty:read'),
    validate({ params: idParamSchema, query: complianceQuerySchema }),
    asyncHandler(controller.attendanceCompliance),
  );

  return router;
}
