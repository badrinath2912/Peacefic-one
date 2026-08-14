import {
  approveStudentRegistrationSchema,
  bulkIdsSchema,
  bulkUpdateStudentsSchema,
  createStudentSchema,
  idParamSchema,
  importStudentRowSchema,
  importStudentsQuerySchema,
  objectIdSchema,
  rejectStudentRegistrationSchema,
  studentListQuerySchema,
  studentRegistrationListQuerySchema,
  updateOwnStudentProfileSchema,
  updateStudentSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { exportService, studentRepository, studentService } from '@/container';
import { StudentController } from '@/controllers/student.controller';
import { authorize, authorizeAny } from '@/middleware/auth.middleware';
import { exportRateLimit, importRateLimit } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new StudentController(studentService, studentRepository, exportService);

const importBodySchema = z.object({
  rows: z.array(importStudentRowSchema).min(1).max(500),
});

const exportQuerySchema = studentListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

// Optional: absent means "export everything matching the filters".
const exportBodySchema = z.object({
  ids: z.array(objectIdSchema).max(5000).optional(),
});

export function studentRoutes(): Router {
  const router = Router();

  /* ------------------------------ student portal ---------------------------- */
  // Declared before `/:id` so "me" is never parsed as an identifier. The
  // student is derived from the token; no id is accepted from the client.

  /**
   * Reviewing students who signed up with the college join code.
   *
   * On `student:approve` — the catalogue defines it as "Approve pending student
   * registrations", so it was created for exactly this and no new permission is
   * introduced. It is held by `college_admin` and `hod`, never by a student, so
   * an applicant cannot reach their own review, let alone approve it.
   *
   * Declared before `/:id` so `registrations` is never parsed as a student id.
   * Tenant isolation comes from `StudentRegistrationRepository` being
   * `tenantScoped: true`; another college's registration is invisible rather
   * than merely forbidden.
   */
  router.get(
    '/registrations',
    authorize('student:approve'),
    validate({ query: studentRegistrationListQuerySchema }),
    asyncHandler(controller.listRegistrations),
  );

  router.get(
    '/registrations/:id',
    authorize('student:approve'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getRegistration),
  );

  router.post(
    '/registrations/:id/approve',
    authorize('student:approve'),
    validate({ params: idParamSchema, body: approveStudentRegistrationSchema }),
    asyncHandler(controller.approveRegistration),
  );

  router.post(
    '/registrations/:id/reject',
    authorize('student:approve'),
    validate({ params: idParamSchema, body: rejectStudentRegistrationSchema }),
    asyncHandler(controller.rejectRegistration),
  );

  router.get('/me', authorize('student:read_own'), asyncHandler(controller.getOwnProfile));

  router.patch(
    '/me',
    authorize('student:update_own'),
    validate({ body: updateOwnStudentProfileSchema }),
    asyncHandler(controller.updateOwnProfile),
  );

  /* ------------------------------ college portal ---------------------------- */

  router.get(
    '/bulk/template',
    authorize('student:import'),
    asyncHandler(controller.importTemplate),
  );

  router.post(
    '/bulk/import',
    authorize('student:import'),
    importRateLimit,
    validate({ body: importBodySchema, query: importStudentsQuerySchema }),
    asyncHandler(controller.importRows),
  );

  // POST rather than GET: a selection of up to 5,000 ids will not fit in a URL.
  router.post(
    '/bulk/export',
    authorize('student:export'),
    exportRateLimit,
    validate({ query: exportQuerySchema, body: exportBodySchema }),
    asyncHandler(controller.export),
  );

  router.patch(
    '/bulk',
    authorize('student:update'),
    validate({ body: bulkUpdateStudentsSchema }),
    asyncHandler(controller.bulkUpdate),
  );

  router.delete(
    '/bulk',
    authorize('student:delete'),
    validate({ body: bulkIdsSchema }),
    asyncHandler(controller.bulkDelete),
  );

  router.get(
    '/',
    authorizeAny('student:read', 'student:read_all'),
    validate({ query: studentListQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    authorize('student:create'),
    validate({ body: createStudentSchema }),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    authorizeAny('student:read', 'student:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getById),
  );

  router.get(
    '/:id/profile',
    authorizeAny('student:read', 'student:read_all'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.getProfile),
  );

  router.patch(
    '/:id',
    authorize('student:update'),
    validate({ params: idParamSchema, body: updateStudentSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    authorize('student:delete'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.remove),
  );

  router.post(
    '/:id/resend-invite',
    authorize('student:update'),
    validate({ params: idParamSchema }),
    asyncHandler(controller.resendInvite),
  );

  return router;
}
