import {
  assignInstructorsSchema,
  bulkIdsSchema,
  courseExportQuerySchema,
  courseListQuerySchema,
  createCourseSchema,
  idParamSchema,
  objectIdSchema,
  updateCourseSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { courseRepository, courseService, exportService } from '@/container';
import { CourseController } from '@/controllers/course.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new CourseController(courseService, courseRepository, exportService);

export function courseRoutes(): Router {
  const router = Router();

  // Static segments before `/:id` so they are not parsed as identifiers.
  router.get('/analytics', authorize('course:read'), asyncHandler(controller.analytics));

  router.post(
    '/bulk/export',
    authorize('course:read'),
    exportRateLimit,
    validate({
      query: courseExportQuerySchema,
      body: z.object({ ids: z.array(objectIdSchema).max(2000).optional() }),
    }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/bulk',
    authorize('course:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDelete),
  );

  router.get(
    '/',
    authorize('course:read'),
    validate({ query: courseListQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    authorize('course:create'),
    validate({ body: createCourseSchema }),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    authorize('course:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getById),
  );

  router.get(
    '/:id/profile',
    authorize('course:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getProfile),
  );

  router.patch(
    '/:id',
    authorize('course:update'),
    validate({ params: idParamSchema, body: updateCourseSchema }),
    asyncHandler(controller.update),
  );

  router.patch(
    '/:id/instructors',
    authorize('course:update'),
    validate({ params: idParamSchema, body: assignInstructorsSchema }),
    asyncHandler(controller.assignInstructors),
  );

  router.delete(
    '/:id',
    authorize('course:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.remove),
  );

  return router;
}
