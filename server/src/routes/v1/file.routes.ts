import { Router } from 'express';
import { z } from 'zod';

import { auditService, storageService } from '@/container';
import { FileController } from '@/controllers/file.controller';
import { authorize } from '@/middleware/auth.middleware';
import { uploadRateLimit } from '@/middleware/rate-limit.middleware';
import { uploadSingle } from '@/middleware/upload.middleware';
import { validate } from '@/middleware/validate.middleware';
import { asyncHandler } from '@/utils/async-handler';

const controller = new FileController(storageService, auditService);

const keySchema = z.object({
  key: z.string().trim().min(1).max(500),
  downloadFileName: z.string().trim().max(255).optional(),
});

export function fileRoutes(): Router {
  const router = Router();

  // multer runs before validation because the body is multipart and cannot be
  // parsed until it has been consumed.
  router.post(
    '/upload',
    authorize('file:upload'),
    uploadRateLimit,
    uploadSingle,
    asyncHandler(controller.upload),
  );

  router.post(
    '/signed-url',
    authorize('file:upload'),
    validate({ body: keySchema }),
    asyncHandler(controller.signedUrl),
  );

  router.delete(
    '/',
    authorize('file:delete'),
    validate({ body: keySchema }),
    asyncHandler(controller.remove),
  );

  return router;
}
