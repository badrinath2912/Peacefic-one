import {
  approveCollegeSchema,
  collegeListQuerySchema,
  idParamSchema,
  rejectCollegeSchema,
  updateCollegeSchema,
  updateCollegeSettingsSchema,
} from '@peacefic/shared';
import { Router } from 'express';

import { auditService, collegeRepository } from '@/container';
import { CollegeController } from '@/controllers/college.controller';
import { authorize } from '@/middleware/auth.middleware';
import { validate } from '@/middleware/validate.middleware';
import { CollegeService } from '@/services/college.service';
import { asyncHandler } from '@/utils/async-handler';

const controller = new CollegeController(
  new CollegeService(collegeRepository, auditService),
  collegeRepository,
);

/**
 * The caller's own institution.
 *
 * `college:*` rather than the generic `settings:*` pair: the catalogue defines
 * `college:settings` as "Manage college settings", which is precisely this, and
 * using the generic permission instead would leave the purpose-built one dead.
 *
 * The three are deliberately different in reach. `college:read` is held by
 * every role, because a student should be able to see their institution's name
 * and the attendance threshold that governs them. `college:update` and
 * `college:settings` are held by `college_admin` alone.
 *
 * `college:approve` and `college:suspend` are **not** used here: they act on
 * *other* institutions and belong to a future platform-admin surface.
 */
export function collegeRoutes(): Router {
  const router = Router();

  router.get('/me', authorize('college:read'), asyncHandler(controller.getOwn));

  router.patch(
    '/me',
    authorize('college:update'),
    validate({ body: updateCollegeSchema }),
    asyncHandler(controller.updateOwn),
  );

  // Separate from the profile: correcting an address and changing the grading
  // scale are different acts, and the catalogue gives them different keys.
  router.patch(
    '/me/settings',
    authorize('college:settings'),
    validate({ body: updateCollegeSettingsSchema }),
    asyncHandler(controller.updateSettings),
  );

  /**
   * The join code students type to self-register.
   *
   * Gated on `college:settings` — the catalogue defines it as "Manage college
   * settings", which is exactly what issuing a registration credential is, and
   * only a college administrator holds it. No new permission is introduced.
   *
   * Declared before the platform routes below so `me` is never parsed as an id,
   * and taking no college id at all: the service resolves it from the token.
   */
  router.get('/me/join-code', authorize('college:settings'), asyncHandler(controller.getJoinCode));

  router.post(
    '/me/join-code/regenerate',
    authorize('college:settings'),
    asyncHandler(controller.regenerateJoinCode),
  );

  /* ----------------------------- platform review ---------------------------- */
  /**
   * Declared after `/me` so the static segment is never parsed as an id.
   *
   * `college:approve` is flagged dangerous in the catalogue and granted to no
   * role but `platform_admin`'s wildcard — `college_admin` holds `college:read`,
   * `college:update` and `college:settings` only. That single permission is the
   * whole boundary, because `CollegeRepository` is `tenantScoped: false` and
   * narrows nothing by itself.
   *
   * These exist because registration was otherwise a dead end: a college is
   * created `pending`, and login refuses a pending college.
   */
  router.get(
    '/',
    authorize('college:approve'),
    validate({ query: collegeListQuerySchema }),
    asyncHandler(controller.listForReview),
  );

  router.post(
    '/:id/approve',
    authorize('college:approve'),
    validate({ params: idParamSchema, body: approveCollegeSchema }),
    asyncHandler(controller.approve),
  );

  router.post(
    '/:id/reject',
    authorize('college:approve'),
    validate({ params: idParamSchema, body: rejectCollegeSchema }),
    asyncHandler(controller.reject),
  );

  return router;
}
