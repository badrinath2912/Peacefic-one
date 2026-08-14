import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerCollegeSchema,
  registerStudentSchema,
  resendOtpSchema,
  resetPasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@peacefic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { authService } from '@/container';
import { AuthController } from '@/controllers/auth.controller';
import { authenticate, requireActiveAccount } from '@/middleware/auth.middleware';
import {
  forgotPasswordRateLimit,
  loginEmailRateLimit,
  loginRateLimit,
  otpRateLimit,
  registerRateLimit,
} from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new AuthController(authService);

export function authRoutes(): Router {
  const router = Router();

  /* --------------------------------- public -------------------------------- */

  router.post(
    '/register/college',
    registerRateLimit,
    validate({ body: registerCollegeSchema }),
    asyncHandler(controller.registerCollege),
  );

  // Same rate limit as institution registration: both are public, unauthenticated
  // account-creating endpoints and deserve the same abuse budget.
  router.post(
    '/register/student',
    registerRateLimit,
    validate({ body: registerStudentSchema }),
    asyncHandler(controller.registerStudent),
  );

  router.post(
    '/verify-email',
    otpRateLimit,
    validate({ body: verifyEmailSchema }),
    asyncHandler(controller.verifyEmail),
  );

  router.post(
    '/resend-otp',
    otpRateLimit,
    validate({ body: resendOtpSchema }),
    asyncHandler(controller.resendOtp),
  );

  // Limited per IP *and* per email: IP-only fails against distributed
  // credential stuffing, email-only lets an attacker lock out a victim.
  router.post(
    '/login',
    loginRateLimit,
    loginEmailRateLimit,
    validate({ body: loginSchema }),
    asyncHandler(controller.login),
  );

  // Cookie-authenticated, so it carries its own CSRF exposure — sameSite=strict
  // plus the narrow cookie path are the controls.
  router.post('/refresh', asyncHandler(controller.refresh));

  router.post(
    '/forgot-password',
    forgotPasswordRateLimit,
    validate({ body: forgotPasswordSchema }),
    asyncHandler(controller.forgotPassword),
  );

  router.post(
    '/reset-password',
    validate({ body: resetPasswordSchema }),
    asyncHandler(controller.resetPassword),
  );

  router.get(
    '/invite/:token',
    validate({ params: z.object({ token: z.string().min(10).max(2000) }) }),
    asyncHandler(controller.inspectInvite),
  );

  router.post(
    '/invite/:token/accept',
    validate({
      params: z.object({ token: z.string().min(10).max(2000) }),
      body: acceptInviteSchema,
    }),
    asyncHandler(controller.acceptInvite),
  );

  router.post('/logout', asyncHandler(controller.logout));

  /* ------------------------------ authenticated ----------------------------- */

  router.use(authenticate, requireActiveAccount);

  router.get('/session', asyncHandler(controller.session));
  router.get('/sessions', asyncHandler(controller.listSessions));

  router.delete(
    '/sessions/:id',
    validate({ params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) }) }),
    asyncHandler(controller.revokeSession),
  );

  router.post('/logout-all', asyncHandler(controller.logoutAll));

  router.patch(
    '/change-password',
    validate({ body: changePasswordSchema }),
    asyncHandler(controller.changePassword),
  );

  /**
   * Self-service profile and preferences. No permission is declared, matching
   * the other `/auth` routes above: authentication *is* the authorisation here,
   * because the user is read from the token and no id is accepted.
   */
  router.patch(
    '/profile',
    validate({ body: updateProfileSchema }),
    asyncHandler(controller.updateProfile),
  );

  router.patch(
    '/preferences',
    validate({ body: updatePreferencesSchema }),
    asyncHandler(controller.updatePreferences),
  );

  return router;
}
