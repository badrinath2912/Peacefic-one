import {
  bulkIdsSchema,
  correctMarksSchema,
  createExaminationPaperSchema,
  createExaminationSchema,
  createGradeScaleSchema,
  enterMarksSchema,
  examinationExportQuerySchema,
  examinationListQuerySchema,
  generateTranscriptSchema,
  gradeScaleListQuerySchema,
  idParamSchema,
  markExamAttendanceSchema,
  marksListQuerySchema,
  objectIdSchema,
  publishResultsSchema,
  recalculateResultsSchema,
  registerStudentsSchema,
  registrationListQuerySchema,
  transitionExaminationSchema,
  unpublishResultsSchema,
  updateExaminationSchema,
  updateGradeScaleSchema,
  updateRegistrationSchema,
  verifyMarksSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  examRegistrationRepository,
  examRepository,
  examinationService,
  exportService,
  gradeScaleRepository,
  marksEntryRepository,
  resultService,
} from '@/container';
import { ExaminationController } from '@/controllers/examination.controller';
import { authorize } from '@/middleware/auth.middleware';
import { exportRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new ExaminationController(
  examinationService,
  resultService,
  examRepository,
  gradeScaleRepository,
  examRegistrationRepository,
  marksEntryRepository,
  exportService,
);

const studentParamSchema = z.object({ studentId: objectIdSchema });
const registrationParamSchema = z.object({ registrationId: objectIdSchema });

export function examinationRoutes(): Router {
  const router = Router();

  /* ------------------------------- grade scales ------------------------------ */
  // Static segments are declared before `/:id` so they are never parsed as ids.

  router.get(
    '/grade-scales',
    authorize('gradescale:read'),
    validate({ query: gradeScaleListQuerySchema }),
    asyncHandler(controller.listGradeScales),
  );

  router.post(
    '/grade-scales',
    authorize('gradescale:manage'),
    validate({ body: createGradeScaleSchema }),
    asyncHandler(controller.createGradeScale),
  );

  router.get(
    '/grade-scales/:id',
    authorize('gradescale:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getGradeScale),
  );

  router.patch(
    '/grade-scales/:id',
    authorize('gradescale:manage'),
    validate({ params: idParamSchema, body: updateGradeScaleSchema }),
    asyncHandler(controller.updateGradeScale),
  );

  router.delete(
    '/grade-scales/:id',
    authorize('gradescale:manage'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.deleteGradeScale),
  );

  /* ------------------------------- self-service ------------------------------ */
  /**
   * Declared before every `/:id` route so `me` is never parsed as an exam id,
   * and carrying no student parameter at all — the service derives identity
   * from the token, so a student cannot ask for anyone else's results.
   */

  router.get('/me/results', authorize('result:read_own'), asyncHandler(controller.ownResults));

  router.get(
    '/me/transcript',
    authorize('transcript:read_own'),
    asyncHandler(controller.ownTranscript),
  );

  /* ------------------------------- transcripts ------------------------------- */

  router.post(
    '/transcripts',
    authorize('transcript:generate'),
    validate({ body: generateTranscriptSchema }),
    asyncHandler(controller.generateTranscript),
  );

  router.get(
    '/transcripts/:studentId',
    authorize('transcript:read'),
    validate({ params: studentParamSchema }),
    asyncHandler(controller.getTranscript),
  );

  router.get(
    '/transcripts/:studentId/versions',
    authorize('transcript:read'),
    validate({ params: studentParamSchema }),
    asyncHandler(controller.listTranscriptVersions),
  );

  /* -------------------------------- results ---------------------------------- */

  router.get(
    '/results/students/:studentId',
    authorize('result:read'),
    validate({ params: studentParamSchema }),
    asyncHandler(controller.studentResults),
  );

  /* --------------------------------- exams ----------------------------------- */

  router.get('/analytics', authorize('exam:read'), asyncHandler(controller.analytics));

  router.post(
    '/bulk/export',
    authorize('exam:read'),
    exportRateLimit,
    validate({
      query: examinationExportQuerySchema,
      body: z.object({ ids: z.array(objectIdSchema).max(2000).optional() }),
    }),
    asyncHandler(controller.export),
  );

  router.delete(
    '/bulk',
    authorize('exam:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDeleteExams),
  );

  router.get(
    '/',
    authorize('exam:read'),
    validate({ query: examinationListQuerySchema }),
    asyncHandler(controller.listExams),
  );

  router.post(
    '/',
    authorize('exam:create'),
    validate({ body: createExaminationSchema }),
    asyncHandler(controller.createExam),
  );

  router.get(
    '/:id',
    authorize('exam:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getExam),
  );

  router.get(
    '/:id/profile',
    authorize('exam:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getExamProfile),
  );

  router.patch(
    '/:id',
    authorize('exam:update'),
    validate({ params: idParamSchema, body: updateExaminationSchema }),
    asyncHandler(controller.updateExam),
  );

  router.delete(
    '/:id',
    authorize('exam:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.deleteExam),
  );

  // Moving an exam along its lifecycle is a publishing act, not an edit.
  router.post(
    '/:id/transition',
    authorize('exam:publish'),
    validate({ params: idParamSchema, body: transitionExaminationSchema }),
    asyncHandler(controller.transitionExam),
  );

  /* ---------------------------------- papers --------------------------------- */

  router.get(
    '/:id/papers',
    authorize('exam:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.listPapers),
  );

  router.post(
    '/:id/papers',
    authorize('exam:update'),
    validate({ params: idParamSchema, body: createExaminationPaperSchema }),
    asyncHandler(controller.createPaper),
  );

  /* ------------------------------- registration ------------------------------ */

  router.get(
    '/:id/registrations',
    authorize('exam:read'),
    validate({ params: idParamSchema, query: registrationListQuerySchema }),
    asyncHandler(controller.listRegistrations),
  );

  router.post(
    '/:id/registrations',
    authorize('exam:update'),
    validate({ params: idParamSchema, body: registerStudentsSchema }),
    asyncHandler(controller.registerStudents),
  );

  router.patch(
    '/registrations/:registrationId',
    authorize('exam:update'),
    validate({ params: registrationParamSchema, body: updateRegistrationSchema }),
    asyncHandler(controller.updateRegistration),
  );

  router.get(
    '/:id/hall-tickets',
    authorize('exam:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.hallTickets),
  );

  /* -------------------------------- attendance ------------------------------- */

  router.get(
    '/:id/attendance',
    authorize('attendance:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.listAttendance),
  );

  router.post(
    '/:id/attendance',
    authorize('attendance:mark'),
    validate({ params: idParamSchema, body: markExamAttendanceSchema }),
    asyncHandler(controller.markAttendance),
  );

  /* ---------------------------------- marks ---------------------------------- */

  router.get(
    '/:id/marks',
    authorize('marks:read'),
    validate({ params: idParamSchema, query: marksListQuerySchema }),
    asyncHandler(controller.listMarks),
  );

  router.post(
    '/:id/marks',
    authorize('marks:enter'),
    validate({ params: idParamSchema, body: enterMarksSchema }),
    asyncHandler(controller.enterMarks),
  );

  // Verification is separated from entry so one person cannot both set and
  // sign off a grade.
  router.post(
    '/:id/marks/verify',
    authorize('marks:verify'),
    validate({ params: idParamSchema, body: verifyMarksSchema }),
    asyncHandler(controller.verifyMarks),
  );

  router.post(
    '/:id/marks/correct',
    authorize('marks:correct'),
    validate({ params: idParamSchema, body: correctMarksSchema }),
    asyncHandler(controller.correctMark),
  );

  /* ---------------------------- result publication --------------------------- */

  router.post(
    '/:id/results/publish',
    authorize('result:publish'),
    validate({ params: idParamSchema, body: publishResultsSchema }),
    asyncHandler(controller.publishResults),
  );

  router.post(
    '/:id/results/unpublish',
    authorize('result:withhold'),
    validate({ params: idParamSchema, body: unpublishResultsSchema }),
    asyncHandler(controller.unpublishResults),
  );

  router.post(
    '/:id/results/recalculate',
    authorize('result:recalculate'),
    validate({ params: idParamSchema, body: recalculateResultsSchema }),
    asyncHandler(controller.recalculateResults),
  );

  router.get(
    '/:id/results/history',
    authorize('result:read'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.publicationHistory),
  );

  return router;
}
