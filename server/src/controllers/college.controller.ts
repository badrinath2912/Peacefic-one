import type { Request, Response } from 'express';

import type { CollegeRepository } from '@/repositories/college.repository';
import type { CollegeService } from '@/services/college.service';
import { sendPaginated, sendSuccess } from '@/utils/response';

/**
 * The caller's own institution, plus the platform review routes.
 *
 * None of the self-service routes takes a college id: the service resolves it
 * from the request context, so there is no parameter a caller could substitute
 * to reach another tenant. The review routes below *do* take an id, and are
 * gated on `college:approve`, which only a platform administrator holds.
 */
export class CollegeController {
  constructor(
    private readonly collegeService: CollegeService,
    private readonly collegeRepository: CollegeRepository,
  ) {}

  getOwn = async (_req: Request, res: Response): Promise<Response> => {
    const college = await this.collegeService.getOwn();
    return sendSuccess(res, college);
  };

  updateOwn = async (req: Request, res: Response): Promise<Response> => {
    const college = await this.collegeService.updateOwn(req.body);
    return sendSuccess(res, college);
  };

  updateSettings = async (req: Request, res: Response): Promise<Response> => {
    const college = await this.collegeService.updateSettings(req.body);
    return sendSuccess(res, college);
  };

  getJoinCode = async (_req: Request, res: Response): Promise<Response> => {
    return sendSuccess(res, await this.collegeService.getJoinCode());
  };

  regenerateJoinCode = async (_req: Request, res: Response): Promise<Response> => {
    return sendSuccess(res, await this.collegeService.regenerateJoinCode());
  };

  /* ----------------------------- platform review ---------------------------- */

  listForReview = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.collegeService.listForReview({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      filter: this.collegeRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  approve = async (req: Request, res: Response): Promise<Response> => {
    const college = await this.collegeService.approve(
      req.params.id as string,
      req.body?.notes as string | undefined,
    );
    return sendSuccess(res, college);
  };

  reject = async (req: Request, res: Response): Promise<Response> => {
    const college = await this.collegeService.reject(
      req.params.id as string,
      req.body.reason as string,
    );
    return sendSuccess(res, college);
  };
}
