import {
  attendanceReportQuerySchema,
  attendanceSessionListQuerySchema,
  createAttendanceSessionSchema,
  idParamSchema,
  markAttendanceSchema,
  objectIdSchema,
  studentAttendanceQuerySchema,
  unlockSessionSchema,
  updateAttendanceRecordSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { attendanceSessionRepository, attendanceService } from '@/container';
import { AttendanceController } from '@/controllers/attendance.controller';
import { authorize, authorizeAny } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new AttendanceController(attendanceService, attendanceSessionRepository);

const trendQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  batchId: objectIdSchema.optional(),
});

const ownAttendanceQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function attendanceRoutes(): Router {
  const router = Router();

  /* ------------------------------ student portal ---------------------------- */
  // Declared first so "me" is never parsed as an id. The student comes from
  // the token; this endpoint accepts no student id at all.

  router.get(
    '/me',
    authorize('attendance:read_own'),
    validate({ query: ownAttendanceQuerySchema }),
    asyncHandler(controller.ownAttendance),
  );

  /* --------------------------------- reports -------------------------------- */

  router.get(
    '/reports/defaulters',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({ query: attendanceReportQuerySchema }),
    asyncHandler(controller.defaulters),
  );

  router.get(
    '/reports/trend',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({ query: trendQuerySchema }),
    asyncHandler(controller.trend),
  );

  router.get(
    '/reports/batch/:batchId',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({
      params: z.object({ batchId: objectIdSchema }),
      query: attendanceReportQuerySchema,
    }),
    asyncHandler(controller.batchReport),
  );

  router.get(
    '/students/:studentId',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({
      params: z.object({ studentId: objectIdSchema }),
      query: studentAttendanceQuerySchema,
    }),
    asyncHandler(controller.studentAttendance),
  );

  /* -------------------------------- sessions -------------------------------- */

  router.get(
    '/sessions',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({ query: attendanceSessionListQuerySchema }),
    asyncHandler(controller.listSessions),
  );

  router.post(
    '/sessions',
    authorize('attendance:mark'),
    validate({ body: createAttendanceSessionSchema }),
    asyncHandler(controller.createSession),
  );

  router.get(
    '/sessions/:id',
    authorizeAny('attendance:read', 'attendance:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getSession),
  );

  router.get(
    '/sessions/:id/sheet',
    authorize('attendance:mark'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getSheet),
  );

  // One request marks the whole roster.
  router.post(
    '/sessions/:id/mark',
    authorize('attendance:mark'),
    validate({ params: idParamSchema, body: markAttendanceSchema }),
    asyncHandler(controller.mark),
  );

  router.patch(
    '/sessions/:id/records/:recordId',
    authorize('attendance:update'),
    validate({
      params: z.object({ id: objectIdSchema, recordId: objectIdSchema }),
      body: updateAttendanceRecordSchema,
    }),
    asyncHandler(controller.correctRecord),
  );

  router.post(
    '/sessions/:id/lock',
    authorize('attendance:lock'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.lock),
  );

  // Editing a locked session is an escape hatch and needs its own permission.
  router.post(
    '/sessions/:id/unlock',
    authorize('attendance:override_lock'),
    validate({ params: idParamSchema, body: unlockSessionSchema }),
    asyncHandler(controller.unlock),
  );

  return router;
}
