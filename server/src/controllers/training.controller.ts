import type { Request, Response } from 'express';

import type {
  TrainingRequestRepository,
  TrainingSessionRepository,
} from '@/repositories/training.repository';
import type { ExportService } from '@/services/export.service';
import type { TrainingService } from '@/services/training.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

function relationCodes(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) =>
      entry && typeof entry === 'object' && 'code' in entry
        ? String((entry as { code: unknown }).code ?? '')
        : '',
    )
    .filter(Boolean)
    .join('; ');
}

export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly requestRepository: TrainingRequestRepository,
    private readonly sessionRepository: TrainingSessionRepository,
    private readonly exportService: ExportService,
  ) {}

  /* -------------------------------- requests -------------------------------- */

  listRequests = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.trainingService.listRequests({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.requestRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.getRequest(req.params.id as string);
    return sendSuccess(res, request);
  };

  createRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.createRequest(req.body);
    return sendCreated(res, request);
  };

  updateRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.updateRequest(req.params.id as string, req.body);
    return sendSuccess(res, request);
  };

  submitRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.submitRequest(req.params.id as string);
    return sendSuccess(res, request);
  };

  approveRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.approveRequest(
      req.params.id as string,
      (req.body as { comments?: string }).comments,
    );
    return sendSuccess(res, request);
  };

  rejectRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.rejectRequest(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, request);
  };

  cancelRequest = async (req: Request, res: Response): Promise<Response> => {
    const request = await this.trainingService.cancelRequest(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, request);
  };

  /* -------------------------------- sessions -------------------------------- */

  listSessions = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.trainingService.listSessions({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.sessionRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.trainingService.getSession(req.params.id as string);
    return sendSuccess(res, session);
  };

  getSessionProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.trainingService.getSessionProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  createSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.trainingService.createSession(req.body);
    return sendCreated(res, session);
  };

  updateSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.trainingService.updateSession(req.params.id as string, req.body);
    return sendSuccess(res, session);
  };

  cancelSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.trainingService.cancelSession(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, session);
  };

  completeSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.trainingService.completeSession(req.params.id as string, req.body);
    return sendSuccess(res, session);
  };

  deleteSession = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.trainingService.deleteSession(req.params.id as string);
    return sendSuccess(res, result);
  };

  bulkDeleteSessions = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.trainingService.bulkDeleteSessions(ids);
    return sendSuccess(res, result);
  };

  /* ------------------------------- enrolment -------------------------------- */

  enrolStudents = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.trainingService.enrolStudents(req.params.id as string, req.body);
    return sendSuccess(res, result);
  };

  withdrawStudents = async (req: Request, res: Response): Promise<Response> => {
    const { studentIds, reason } = req.body as { studentIds: string[]; reason?: string };
    const result = await this.trainingService.withdrawStudents(
      req.params.id as string,
      studentIds,
      reason,
    );
    return sendSuccess(res, result);
  };

  /* -------------------------- calendar and analytics ------------------------- */

  calendar = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as { from: Date; to: Date } & Record<string, unknown>;

    const filters: Record<string, unknown> = {};
    if (query.trainerIds) filters.trainerIds = query.trainerIds;
    if (query.departmentIds) filters.departmentIds = query.departmentIds;

    const sessions = await this.trainingService.calendar(query.from, query.to, filters);
    return sendSuccess(res, sessions);
  };

  analytics = async (_req: Request, res: Response): Promise<Response> => {
    const analytics = await this.trainingService.analytics();
    return sendSuccess(res, analytics);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const sessions = await this.trainingService.exportSessions(
      this.sessionRepository.buildFilterFromQuery(query),
      { ids },
    );

    const result = await this.exportService.build(
      format,
      sessions,
      [
        { key: 'title', header: 'Title', width: 32, value: (s) => s.title },
        { key: 'trainingType', header: 'Category', value: (s) => s.trainingType },
        { key: 'mode', header: 'Mode', value: (s) => s.mode },
        { key: 'startDate', header: 'Start Date', value: (s) => s.startDate },
        { key: 'endDate', header: 'End Date', value: (s) => s.endDate },
        { key: 'location', header: 'Location', width: 24, value: (s) => s.location },
        {
          key: 'departments',
          header: 'Departments',
          width: 24,
          value: (s) => relationCodes(s.departmentIds),
        },
        { key: 'batches', header: 'Batches', width: 24, value: (s) => relationCodes(s.batchIds) },
        { key: 'trainers', header: 'Trainers', value: (s) => s.trainerIds.length },
        { key: 'capacity', header: 'Capacity', value: (s) => s.capacity },
        { key: 'enrolled', header: 'Enrolled', value: (s) => s.stats.enrolledCount },
        { key: 'completed', header: 'Completed', value: (s) => s.stats.completedCount },
        {
          key: 'completionRate',
          header: 'Completion %',
          value: (s) =>
            s.stats.enrolledCount > 0
              ? Math.round((s.stats.completedCount / s.stats.enrolledCount) * 1000) / 10
              : 0,
        },
        { key: 'feedbackScore', header: 'Feedback', value: (s) => s.feedbackScore },
        { key: 'status', header: 'Status', value: (s) => s.status },
      ],
      'Training',
    );

    const fileName = this.exportService.fileName('training-sessions', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(sessions.length));
    res.send(result.buffer);
  };
}
