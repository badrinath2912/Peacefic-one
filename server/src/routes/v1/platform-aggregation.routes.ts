import { Router } from 'express';

import { PlatformAggregationController } from '@/controllers/platform-aggregation.controller';
import { requirePlatformAdmin } from '@/middleware/auth.middleware';
import { PlatformAggregationService } from '@/services/platform-aggregation.service';
import { asyncHandler } from '@/utils/async-handler';

const service = new PlatformAggregationService();
const controller = new PlatformAggregationController(service);

export function platformAggregationRoutes(): Router {
  const router = Router();

  router.get(
    '/overview',
    requirePlatformAdmin(),
    asyncHandler(controller.getOverview),
  );

  return router;
}
