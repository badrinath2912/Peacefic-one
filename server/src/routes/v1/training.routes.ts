import {
  approveTrainingSchema,
  bulkIdsSchema,
  calendarQuerySchema,
  cancelTrainingSchema,
  cancelTrainingSessionSchema,
  completeSessionSchema,
  createTrainingRequestSchema,
  createTrainingSessionSchema,
  enrolTrainingStudentsSchema,
  idParamSchema,
  objectIdSchema,
  rejectTrainingSchema,
  trainingListQuerySchema,
  trainingSessionExportQuerySchema,
  trainingSessionListQuerySchema,
  updateTrainingRequestSchema,
  updateTrainingSessionSchema,
  withdrawEnrollmentSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  exportService,
  trainingRequestRepository,
  trainingService,
  trainingSessionRepository,
} from '@/container';
import { TrainingController } from '@/controllers/training.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new TrainingController(
  trainingService,
  trainingRequestRepository,
  trainingSessionRepository,
  exportService,
);

export function trainingRoutes(): Router {
  const router = Router();

  /* -------------------------- dashboard and calendar ------------------------- */
  // Static segments first so they are never parsed as identifiers.

  router.get('/analytics', authorize('training:read'), asyncHandler(controller.analytics));

  router.get(
    '/calendar',
    authorize('training:read'),
    validate({ query: calendarQuerySchema }),
    asyncHandler(controller.calendar),
  );

  /* -------------------------------- requests -------------------------------- */

  router.get(
    '/requests',
    authorize('training:read'),
    validate({ query: trainingListQuerySchema }),
    asyncHandler(controller.listRequests),
  );

  router.post(
    '/requests',
    authorize('training:create'),
    validate({ body: createTrainingRequestSchema }),
    asyncHandler(controller.createRequest),
  );

  router.get(
    '/requests/:id',
    authorize('training:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getRequest),
  );

  router.patch(
    '/requests/:id',
    authorize('training:update'),
    validate({ params: idParamSchema, body: updateTrainingRequestSchema }),
    asyncHandler(controller.updateRequest),
  );

  router.post(
    '/requests/:id/submit',
    authorize('training:update'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.submitRequest),
  );

  // Approval is a distinct permission from editing: the person who raises a
  // request must not be able to wave it through.
  router.post(
    '/requests/:id/approve',
    authorize('training:approve'),
    validate({ params: idParamSchema, body: approveTrainingSchema }),
    asyncHandler(controller.approveRequest),
  );

  router.post(
    '/requests/:id/reject',
    authorize('training:reject'),
    validate({ params: idParamSchema, body: rejectTrainingSchema }),
    asyncHandler(controller.rejectRequest),
  );

  router.post(
    '/requests/:id/cancel',
    authorize('training:update'),
    validate({ params: idParamSchema, body: cancelTrainingSchema }),
    asyncHandler(controller.cancelRequest),
  );

  /* -------------------------------- sessions -------------------------------- */

  router.post(
    '/sessions/bulk/export',
    authorize('training:read'),
    exportRateLimit,
    validate({
      query: trainingSessionExportQuerySchema,
      body: z.object({ ids: z.array(objectIdSchema).max(2000).optional() }),
    }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/sessions/bulk',
    authorize('training:update'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDeleteSessions),
  );

  router.get(
    '/sessions',
    authorize('training:read'),
    validate({ query: trainingSessionListQuerySchema }),
    asyncHandler(controller.listSessions),
  );

  router.post(
    '/sessions',
    authorize('training:assign_trainer'),
    validate({ body: createTrainingSessionSchema }),
    asyncHandler(controller.createSession),
  );

  router.get(
    '/sessions/:id',
    authorize('training:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getSession),
  );

  router.get(
    '/sessions/:id/profile',
    authorize('training:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getSessionProfile),
  );

  router.patch(
    '/sessions/:id',
    authorize('training:update'),
    validate({ params: idParamSchema, body: updateTrainingSessionSchema }),
    asyncHandler(controller.updateSession),
  );

  router.post(
    '/sessions/:id/cancel',
    authorize('training:update'),
    validate({ params: idParamSchema, body: cancelTrainingSessionSchema }),
    asyncHandler(controller.cancelSession),
  );

  router.post(
    '/sessions/:id/complete',
    authorize('training:update'),
    validate({ params: idParamSchema, body: completeSessionSchema }),
    asyncHandler(controller.completeSession),
  );

  router.delete(
    '/sessions/:id',
    authorize('training:update'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.deleteSession),
  );

  /* ------------------------------- enrolment -------------------------------- */

  router.post(
    '/sessions/:id/enrol',
    authorize('training:update'),
    validate({ params: idParamSchema, body: enrolTrainingStudentsSchema }),
    asyncHandler(controller.enrolStudents),
  );

  router.post(
    '/sessions/:id/withdraw',
    authorize('training:update'),
    validate({ params: idParamSchema, body: withdrawEnrollmentSchema }),
    asyncHandler(controller.withdrawStudents),
  );

  return router;
}
