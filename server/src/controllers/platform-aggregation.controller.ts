import type { Request, Response } from 'express';

import type { PlatformAggregationService } from '@/services/platform-aggregation.service';
import { sendSuccess } from '@/utils/response';

export class PlatformAggregationController {
  constructor(private readonly platformAggregationService: PlatformAggregationService) {}

  getOverview = async (_req: Request, res: Response): Promise<Response> => {
    const result = await this.platformAggregationService.getOverview();
    return sendSuccess(res, result);
  };
}
