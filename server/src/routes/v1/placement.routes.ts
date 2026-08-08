import {
  advanceApplicationSchema,
  APPLICATION_STATUS,
  applicationListQuerySchema,
  applyToJobSchema,
  blacklistCompanySchema,
  bulkApplicationActionSchema,
  bulkIdsSchema,
  bulkScheduleInterviewSchema,
  companyExportQuerySchema,
  companyListQuerySchema,
  createCompanySchema,
  createJobPostingSchema,
  createPlacementSchema,
  idParamSchema,
  INTERVIEW_STATUS,
  interviewListQuerySchema,
  jobListQuerySchema,
  JOB_STATUS,
  objectIdSchema,
  placementListQuerySchema,
  recordInterviewResultSchema,
  rejectApplicationSchema,
  requestRescheduleSchema,
  rescheduleInterviewSchema,
  scheduleInterviewSchema,
  updatePlacementSchema,
  updateCompanySchema,
  updateJobPostingSchema,
  verifyCompanySchema,
  withdrawApplicationSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  companyRepository,
  jobApplicationRepository,
  jobApplicationService,
  placementRepository,
  placementService,
  companyService,
  exportService,
  interviewRepository,
  interviewService,
  jobPostingRepository,
  jobPostingService,
} from '@/container';
import { InterviewController } from '@/controllers/interview.controller';
import {
  CompanyController,
  JobApplicationController,
  JobPostingController,
  PlacementController,
} from '@/controllers/placement.controller';
import { authorize, authorizeAny } from '@/middleware/auth.middleware';
import { exportRateLimit, uploadRateLimit } from '@/middleware/rate-limit.middleware';
import { uploadSingle } from '@/middleware/upload.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const companyController = new CompanyController(companyService, companyRepository, exportService);
const applicationController = new JobApplicationController(
  jobApplicationService,
  jobApplicationRepository,
  exportService,
);

const placementController = new PlacementController(
  placementService,
  placementRepository,
  exportService,
);

const jobController = new JobPostingController(
  jobPostingService,
  jobPostingRepository,
  exportService,
);

const transitionSchema = z.object({
  to: z.enum(JOB_STATUS),
  reason: z.string().trim().max(500).optional(),
});

/** The office may move an application anywhere the state machine allows. */
const advanceStatusSchema = z.object({
  to: z.enum(APPLICATION_STATUS),
  reason: z.string().trim().max(1000).optional(),
  roundOrder: z.number().int().min(1).max(20).optional(),
});

const declineOfferSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(1000),
});

const revokeOfferSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(1000),
});

const markJoinedSchema = z.object({
  joiningDate: z.coerce.date().optional(),
});

const verifyPlacementSchema = z.object({
  isVerified: z.boolean(),
});

const selectApplicationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

const reinstateSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(1000),
});

const studentParamSchema = z.object({
  id: objectIdSchema,
  studentId: objectIdSchema,
});

export function companyRoutes(): Router {
  const router = Router();

  // Static segments before `/:id` so they are never parsed as identifiers.
  router.get('/analytics', authorize('company:read'), asyncHandler(companyController.analytics));

  router.post(
    '/bulk/export',
    authorize('company:read'),
    exportRateLimit,
    validate({
      query: companyExportQuerySchema,
      body: z.object({ ids: z.array(objectIdSchema).max(5000).optional() }),
    }),
    asyncHandler(companyController.export),
  );

  router.delete(
    '/bulk',
    authorize('company:update'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(companyController.bulkDelete),
  );

  router.get(
    '/',
    authorize('company:read'),
    validate({ query: companyListQuerySchema }),
    asyncHandler(companyController.list),
  );

  router.post(
    '/',
    authorize('company:create'),
    validate({ body: createCompanySchema }),
    asyncHandler(companyController.create),
  );

  router.get(
    '/:id',
    authorize('company:read'),
    validate({ params: idParamSchema }),
    asyncHandler(companyController.get),
  );

  router.get(
    '/:id/profile',
    authorize('company:read'),
    validate({ params: idParamSchema }),
    asyncHandler(companyController.getProfile),
  );

  router.patch(
    '/:id',
    authorize('company:update'),
    validate({ params: idParamSchema, body: updateCompanySchema }),
    asyncHandler(companyController.update),
  );

  router.delete(
    '/:id',
    authorize('company:update'),
    validate({ params: idParamSchema }),
    asyncHandler(companyController.remove),
  );

  /**
   * Verification is its own permission: it is a statement that someone checked
   * the company is real, which students rely on before sharing their details.
   */
  router.post(
    '/:id/verify',
    authorize('company:verify'),
    validate({ params: idParamSchema, body: verifyCompanySchema }),
    asyncHandler(companyController.verify),
  );

  router.post(
    '/:id/blacklist',
    authorize('company:blacklist'),
    validate({ params: idParamSchema, body: blacklistCompanySchema }),
    asyncHandler(companyController.blacklist),
  );

  router.post(
    '/:id/reinstate',
    authorize('company:blacklist'),
    validate({ params: idParamSchema, body: reinstateSchema }),
    asyncHandler(companyController.reinstate),
  );

  // multer runs before validation: a multipart body cannot be parsed until it
  // has been consumed.
  router.post(
    '/:id/logo',
    authorize('company:update'),
    uploadRateLimit,
    uploadSingle,
    asyncHandler(companyController.uploadLogo),
  );

  return router;
}

export function jobRoutes(): Router {
  const router = Router();

  /* ------------------------------- self-service ------------------------------ */
  /**
   * Declared first so `me` is never parsed as a job id, and carrying no student
   * parameter — the service reads identity from the token.
   */

  router.get('/me/openings', authorize('job:read'), asyncHandler(jobController.myOpenings));

  router.get(
    '/me/eligibility/:id',
    authorize('job:read'),
    validate({ params: idParamSchema }),
    asyncHandler(jobController.myEligibility),
  );

  /**
   * Applying is a student action on a job, so it sits here rather than under
   * /applications. The service decides eligibility from the token's student.
   */
  router.post(
    '/:id/apply',
    authorize('application:create'),
    validate({ params: idParamSchema, body: applyToJobSchema }),
    asyncHandler(applicationController.apply),
  );

  /* --------------------------------- office ---------------------------------- */

  router.get('/analytics', authorize('job:read'), asyncHandler(jobController.analytics));

  router.post(
    '/bulk/export',
    authorize('job:read'),
    exportRateLimit,
    validate({
      query: jobListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
      body: z.object({ ids: z.array(objectIdSchema).max(5000).optional() }),
    }),
    asyncHandler(jobController.export),
  );

  router.delete(
    '/bulk',
    authorize('job:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(jobController.bulkDelete),
  );

  router.post('/close-expired', authorize('job:close'), asyncHandler(jobController.closeExpired));

  router.get(
    '/',
    authorize('job:read'),
    validate({ query: jobListQuerySchema }),
    asyncHandler(jobController.list),
  );

  router.post(
    '/',
    authorize('job:create'),
    validate({ body: createJobPostingSchema }),
    asyncHandler(jobController.create),
  );

  router.get(
    '/:id',
    authorize('job:read'),
    validate({ params: idParamSchema }),
    asyncHandler(jobController.get),
  );

  router.get(
    '/:id/profile',
    authorize('job:read'),
    validate({ params: idParamSchema }),
    asyncHandler(jobController.getProfile),
  );

  router.patch(
    '/:id',
    authorize('job:update'),
    validate({ params: idParamSchema, body: updateJobPostingSchema }),
    asyncHandler(jobController.update),
  );

  router.delete(
    '/:id',
    authorize('job:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(jobController.remove),
  );

  // Publishing announces the drive to every eligible student, so it is gated
  // separately from an ordinary edit.
  router.post(
    '/:id/transition',
    authorize('job:publish'),
    validate({ params: idParamSchema, body: transitionSchema }),
    asyncHandler(jobController.transition),
  );

  /**
   * Names other students along with their CGPA and backlog count, so it needs
   * the office permission — `job:read` is held by students themselves.
   */
  router.get(
    '/:id/eligible-students',
    authorize('application:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(jobController.eligibleStudents),
  );

  // Names another student, so it needs the all-students permission rather than
  // the self-service one.
  router.get(
    '/:id/eligibility/:studentId',
    authorize('application:read_all'),
    validate({ params: studentParamSchema }),
    asyncHandler(jobController.checkStudent),
  );

  return router;
}

export function applicationRoutes(): Router {
  const router = Router();

  /* ------------------------------- self-service ------------------------------ */
  /**
   * Declared before every `/:id` route so `me` is never parsed as an id, and
   * carrying no student parameter — the service derives identity from the
   * token, so a student cannot reach anyone else's applications.
   */

  router.get('/me', authorize('application:read'), asyncHandler(applicationController.mine));

  router.get(
    '/me/:id',
    authorize('application:read'),
    validate({ params: idParamSchema }),
    asyncHandler(applicationController.mineOne),
  );

  router.post(
    '/me/:id/withdraw',
    authorize('application:withdraw'),
    validate({ params: idParamSchema, body: withdrawApplicationSchema }),
    asyncHandler(applicationController.withdraw),
  );

  router.post(
    '/me/:id/decline-offer',
    authorize('application:withdraw'),
    validate({ params: idParamSchema, body: withdrawApplicationSchema }),
    asyncHandler(applicationController.declineOffer),
  );

  /* ---------------------------------- office --------------------------------- */

  router.get(
    '/analytics',
    authorize('application:read_all'),
    validate({ query: applicationListQuerySchema.partial() }),
    asyncHandler(applicationController.analytics),
  );

  router.post(
    '/bulk/export',
    authorize('application:read_all'),
    exportRateLimit,
    validate({
      query: applicationListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
    }),
    asyncHandler(applicationController.export),
  );

  router.post(
    '/bulk/shortlist',
    authorize('application:shortlist'),
    validate({ body: bulkApplicationActionSchema }),
    asyncHandler(applicationController.bulkShortlist),
  );

  router.post(
    '/bulk/reject',
    authorize('application:reject'),
    validate({ body: bulkApplicationActionSchema }),
    asyncHandler(applicationController.bulkReject),
  );

  router.get(
    '/',
    authorize('application:read_all'),
    validate({ query: applicationListQuerySchema }),
    asyncHandler(applicationController.list),
  );

  /**
   * `application:read` is enough here: the service falls back to the
   * own-application path for a caller without the office permission, so a
   * student reading someone else's id gets a 404 rather than a record.
   */
  router.get(
    '/:id',
    authorizeAny('application:read', 'application:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(applicationController.get),
  );

  router.post(
    '/:id/shortlist',
    authorize('application:shortlist'),
    validate({ params: idParamSchema, body: advanceApplicationSchema }),
    asyncHandler(applicationController.shortlist),
  );

  router.post(
    '/:id/advance',
    authorize('application:shortlist'),
    validate({ params: idParamSchema, body: advanceStatusSchema }),
    asyncHandler(applicationController.advance),
  );

  router.post(
    '/:id/reject',
    authorize('application:reject'),
    validate({ params: idParamSchema, body: rejectApplicationSchema }),
    asyncHandler(applicationController.reject),
  );

  // Selecting is what creates an offer, so it is gated on the placement
  // permission rather than the shortlisting one.
  router.post(
    '/:id/select',
    authorize('placement:create'),
    validate({ params: idParamSchema, body: selectApplicationSchema }),
    asyncHandler(applicationController.select),
  );

  return router;
}

export function placementRoutes(): Router {
  const router = Router();

  /* ------------------------------- self-service ------------------------------ */
  /**
   * Declared before every `/:id` route so `me` is never parsed as an id, and
   * carrying no student parameter — the service derives identity from the
   * token, so a student cannot reach anyone else's offer.
   */

  router.get('/me', authorize('placement:read'), asyncHandler(placementController.mine));

  router.get(
    '/me/:id',
    authorize('placement:read'),
    validate({ params: idParamSchema }),
    asyncHandler(placementController.mineOne),
  );

  /**
   * Answering an offer is gated on `placement:respond`, which only students
   * hold — the office cannot answer on a student's behalf even with
   * `placement:update`.
   */
  router.post(
    '/me/:id/accept',
    authorize('placement:respond'),
    validate({ params: idParamSchema }),
    asyncHandler(placementController.accept),
  );

  router.post(
    '/me/:id/decline',
    authorize('placement:respond'),
    validate({ params: idParamSchema, body: declineOfferSchema }),
    asyncHandler(placementController.decline),
  );

  /* ---------------------------------- office --------------------------------- */

  router.get(
    '/analytics',
    authorize('placement:report'),
    validate({ query: placementListQuerySchema.partial() }),
    asyncHandler(placementController.analytics),
  );

  router.post(
    '/bulk/export',
    authorize('placement:read_all'),
    exportRateLimit,
    validate({
      query: placementListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
    }),
    asyncHandler(placementController.export),
  );

  router.get(
    '/',
    authorize('placement:read_all'),
    validate({ query: placementListQuerySchema }),
    asyncHandler(placementController.list),
  );

  router.post(
    '/',
    authorize('placement:create'),
    validate({ body: createPlacementSchema }),
    asyncHandler(placementController.create),
  );

  /**
   * `placement:read` is enough here: the service falls back to the own-offer
   * path for a caller without the office permission, so a student passing
   * someone else's id gets a 404 rather than a record.
   */
  router.get(
    '/:id',
    authorizeAny('placement:read', 'placement:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(placementController.get),
  );

  router.patch(
    '/:id',
    authorize('placement:update'),
    validate({ params: idParamSchema, body: updatePlacementSchema }),
    asyncHandler(placementController.update),
  );

  router.post(
    '/:id/revoke',
    authorize('placement:update'),
    validate({ params: idParamSchema, body: revokeOfferSchema }),
    asyncHandler(placementController.revoke),
  );

  router.post(
    '/:id/joined',
    authorize('placement:update'),
    validate({ params: idParamSchema, body: markJoinedSchema }),
    asyncHandler(placementController.markJoined),
  );

  router.post(
    '/:id/not-joined',
    authorize('placement:update'),
    validate({ params: idParamSchema, body: revokeOfferSchema }),
    asyncHandler(placementController.markNotJoined),
  );

  router.post(
    '/:id/verify',
    authorize('placement:verify'),
    validate({ params: idParamSchema, body: verifyPlacementSchema }),
    asyncHandler(placementController.verify),
  );

  return router;
}

/* --------------------------------- interviews -------------------------------- */

const interviewController = new InterviewController(interviewService, interviewRepository);

const interviewTransitionSchema = z.object({
  to: z.enum(INTERVIEW_STATUS),
  reason: z.string().trim().max(500).optional(),
});

const cancelInterviewSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(1000),
});

export function interviewRoutes(): Router {
  const router = Router();

  /* ------------------------------- self-service ------------------------------ */
  /**
   * Declared before every `/:id` route so `me` is never parsed as an id, and
   * carrying no student parameter — the service reads identity from the token,
   * so a student cannot reach anyone else's interview.
   */

  router.get('/me', authorize('interview:read'), asyncHandler(interviewController.mine));

  router.get(
    '/me/:id',
    authorize('interview:read'),
    validate({ params: idParamSchema }),
    asyncHandler(interviewController.mineOne),
  );

  /**
   * Answering an interview is gated on `interview:respond`, which only students
   * hold. Reading an interview is not a licence to change one, so
   * `interview:read` is deliberately not accepted here.
   */
  router.post(
    '/me/:id/confirm',
    authorize('interview:respond'),
    validate({ params: idParamSchema }),
    asyncHandler(interviewController.confirm),
  );

  router.post(
    '/me/:id/request-reschedule',
    authorize('interview:respond'),
    validate({ params: idParamSchema, body: requestRescheduleSchema }),
    asyncHandler(interviewController.requestReschedule),
  );

  /* ---------------------------------- office --------------------------------- */

  router.get(
    '/analytics',
    authorize('interview:read_all'),
    validate({ query: interviewListQuerySchema.partial() }),
    asyncHandler(interviewController.analytics),
  );

  router.post(
    '/bulk/schedule',
    authorize('interview:schedule'),
    validate({ body: bulkScheduleInterviewSchema }),
    asyncHandler(interviewController.bulkSchedule),
  );

  router.get(
    '/',
    authorize('interview:read_all'),
    validate({ query: interviewListQuerySchema }),
    asyncHandler(interviewController.list),
  );

  router.post(
    '/',
    authorize('interview:schedule'),
    validate({ body: scheduleInterviewSchema }),
    asyncHandler(interviewController.schedule),
  );

  /**
   * `interview:read` is enough here: the service falls back to the own-interview
   * path for a caller without the office permission, so a student passing
   * someone else's id gets a 404 rather than a record.
   */
  router.get(
    '/:id',
    authorizeAny('interview:read', 'interview:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(interviewController.get),
  );

  router.post(
    '/:id/reschedule',
    authorize('interview:update'),
    validate({ params: idParamSchema, body: rescheduleInterviewSchema }),
    asyncHandler(interviewController.reschedule),
  );

  router.post(
    '/:id/cancel',
    authorize('interview:update'),
    validate({ params: idParamSchema, body: cancelInterviewSchema }),
    asyncHandler(interviewController.cancel),
  );

  router.post(
    '/:id/transition',
    authorize('interview:update'),
    validate({ params: idParamSchema, body: interviewTransitionSchema }),
    asyncHandler(interviewController.transition),
  );

  // Recording a result never moves the application: that needs
  // `application:shortlist` or `application:reject` through the application API.
  router.post(
    '/:id/result',
    authorize('interview:record_result'),
    validate({ params: idParamSchema, body: recordInterviewResultSchema }),
    asyncHandler(interviewController.recordResult),
  );

  return router;
}
