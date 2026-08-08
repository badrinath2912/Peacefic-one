import type { AttendanceReportQuery } from '@peacefic/shared';
import type { Request, Response } from 'express';

import type { AttendanceSessionRepository } from '@/repositories/attendance.repository';
import type { AttendanceService } from '@/services/attendance.service';
import { addDays } from '@/utils/date';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly sessionRepository: AttendanceSessionRepository,
  ) {}

  listSessions = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.attendanceService.listSessions({
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
    const session = await this.attendanceService.getSession(req.params.id as string);
    return sendSuccess(res, session);
  };

  createSession = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.attendanceService.createSession(req.body);
    return sendCreated(res, session);
  };

  /** The roster plus any existing marks — what the marking sheet renders from. */
  getSheet = async (req: Request, res: Response): Promise<Response> => {
    const sheet = await this.attendanceService.getSessionSheet(req.params.id as string);
    return sendSuccess(res, sheet);
  };

  mark = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.attendanceService.markSession(req.params.id as string, req.body);
    return sendSuccess(res, result);
  };

  correctRecord = async (req: Request, res: Response): Promise<Response> => {
    const record = await this.attendanceService.correctRecord(
      req.params.id as string,
      req.params.recordId as string,
      req.body,
    );
    return sendSuccess(res, record);
  };

  lock = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.attendanceService.lockSession(req.params.id as string);
    return sendSuccess(res, session);
  };

  unlock = async (req: Request, res: Response): Promise<Response> => {
    const session = await this.attendanceService.unlockSession(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, session);
  };

  studentAttendance = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as { from?: Date; to?: Date; period?: 'month' | 'semester' | 'overall' };
    const attendance = await this.attendanceService.getStudentAttendance(
      req.params.studentId as string,
      query,
    );
    return sendSuccess(res, attendance);
  };

  ownAttendance = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as { from?: Date; to?: Date };
    const attendance = await this.attendanceService.getOwnAttendance(query);
    return sendSuccess(res, attendance);
  };

  batchReport = async (req: Request, res: Response): Promise<Response> => {
    const report = await this.attendanceService.batchReport(
      req.params.batchId as string,
      req.query as unknown as AttendanceReportQuery,
    );
    return sendSuccess(res, report);
  };

  defaulters = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.attendanceService.defaulters(
      req.query as unknown as AttendanceReportQuery,
    );
    return sendSuccess(res, result);
  };

  trend = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as { from?: Date; to?: Date; batchId?: string };
    // Default to the last 30 days rather than scanning the whole collection.
    const to = query.to ?? new Date();
    const from = query.from ?? addDays(to, -30);

    const trend = await this.attendanceService.trend(from, to, query.batchId);
    return sendSuccess(res, trend);
  };
}
