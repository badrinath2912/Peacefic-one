import type { InterviewStatus } from '@peacefic/shared';
import type { Request, Response } from 'express';

import type { InterviewRepository } from '@/repositories/placement.repository';
import type { InterviewService } from '@/services/interview.service';
import { sendCreated, sendSuccess, sendPaginated } from '@/utils/response';

export class InterviewController {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly interviewRepository: InterviewRepository,
  ) {}

  /* ------------------------------- self-service ------------------------------ */
  // No student parameter anywhere below: identity comes from the token.

  mine = async (_req: Request, res: Response): Promise<Response> => {
    const interviews = await this.interviewService.myInterviews();
    return sendSuccess(res, interviews);
  };

  mineOne = async (req: Request, res: Response): Promise<Response> => {
    const interview = await this.interviewService.myInterview(req.params.id as string);
    return sendSuccess(res, interview);
  };

  confirm = async (req: Request, res: Response): Promise<Response> => {
    const interview = await this.interviewService.confirm(req.params.id as string);
    return sendSuccess(res, interview);
  };

  requestReschedule = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { reason: string; preferredSlots: Date[] };

    const interview = await this.interviewService.requestReschedule(
      req.params.id as string,
      body.reason,
      body.preferredSlots,
    );

    return sendSuccess(res, interview);
  };

  /* ---------------------------------- office --------------------------------- */

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.interviewService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.interviewRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const interview = await this.interviewService.get(req.params.id as string);
    return sendSuccess(res, interview);
  };

  schedule = async (req: Request, res: Response): Promise<Response> => {
    const interview = await this.interviewService.schedule(req.body);
    return sendCreated(res, interview);
  };

  bulkSchedule = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.interviewService.bulkSchedule(req.body);
    return sendSuccess(res, result);
  };

  reschedule = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { scheduledAt: Date; reason: string };

    const interview = await this.interviewService.reschedule(
      req.params.id as string,
      body.scheduledAt,
      body.reason,
    );

    return sendSuccess(res, interview);
  };

  cancel = async (req: Request, res: Response): Promise<Response> => {
    const interview = await this.interviewService.cancel(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );

    return sendSuccess(res, interview);
  };

  transition = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { to: InterviewStatus; reason?: string };

    const interview = await this.interviewService.transition(
      req.params.id as string,
      body.to,
      body.reason,
    );

    return sendSuccess(res, interview);
  };

  /**
   * The result carries a suggested application status. It is a suggestion:
   * moving the application is a separate, separately-permissioned request.
   */
  recordResult = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.interviewService.recordResult(req.params.id as string, req.body);
    return sendSuccess(res, result);
  };

  analytics = async (req: Request, res: Response): Promise<Response> => {
    const filter = this.interviewRepository.buildFilterFromQuery(
      req.query as Record<string, unknown>,
    ) as Record<string, unknown>;

    const analytics = await this.interviewService.analytics(filter);
    return sendSuccess(res, analytics);
  };
}
