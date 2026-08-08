import type { ExamLifecycle } from '@peacefic/shared';
import type { Request, Response } from 'express';

import type { ExamRegistrationDocument } from '@/models/exam-registration.model';
import type {
  ExamRegistrationRepository,
  ExamRepository,
  GradeScaleRepository,
  MarksEntryRepository,
} from '@/repositories/examination.repository';
import type { ExaminationService } from '@/services/examination.service';
import type { ExportService } from '@/services/export.service';
import type { ResultService } from '@/services/result.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

function populatedValue(relation: unknown, field: string): string {
  if (!relation || typeof relation !== 'object') return '';
  return String((relation as Record<string, unknown>)[field] ?? '');
}

export class ExaminationController {
  constructor(
    private readonly examinationService: ExaminationService,
    private readonly resultService: ResultService,
    private readonly examRepository: ExamRepository,
    private readonly gradeScaleRepository: GradeScaleRepository,
    private readonly registrationRepository: ExamRegistrationRepository,
    private readonly marksRepository: MarksEntryRepository,
    private readonly exportService: ExportService,
  ) {}

  /* ------------------------------- grade scales ------------------------------ */

  listGradeScales = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.examinationService.listGradeScales({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      filter: this.gradeScaleRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getGradeScale = async (req: Request, res: Response): Promise<Response> => {
    const scale = await this.examinationService.getGradeScale(req.params.id as string);
    return sendSuccess(res, scale);
  };

  createGradeScale = async (req: Request, res: Response): Promise<Response> => {
    const scale = await this.examinationService.createGradeScale(req.body);
    return sendCreated(res, scale);
  };

  updateGradeScale = async (req: Request, res: Response): Promise<Response> => {
    const scale = await this.examinationService.updateGradeScale(
      req.params.id as string,
      req.body,
    );
    return sendSuccess(res, scale);
  };

  deleteGradeScale = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.examinationService.deleteGradeScale(req.params.id as string);
    return sendSuccess(res, result);
  };

  /* ---------------------------------- exams ---------------------------------- */

  listExams = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.examinationService.listExams({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.examRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getExam = async (req: Request, res: Response): Promise<Response> => {
    const exam = await this.examinationService.getExam(req.params.id as string);
    return sendSuccess(res, exam);
  };

  getExamProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.examinationService.getExamProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  createExam = async (req: Request, res: Response): Promise<Response> => {
    const exam = await this.examinationService.createExam(req.body);
    return sendCreated(res, exam);
  };

  updateExam = async (req: Request, res: Response): Promise<Response> => {
    const exam = await this.examinationService.updateExam(req.params.id as string, req.body);
    return sendSuccess(res, exam);
  };

  deleteExam = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.examinationService.deleteExam(req.params.id as string);
    return sendSuccess(res, result);
  };

  transitionExam = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { to: ExamLifecycle; reason?: string };
    const exam = await this.examinationService.transitionExam(
      req.params.id as string,
      body.to,
      body.reason,
    );
    return sendSuccess(res, exam);
  };

  analytics = async (_req: Request, res: Response): Promise<Response> => {
    const analytics = await this.examinationService.analytics();
    return sendSuccess(res, analytics);
  };

  bulkDeleteExams = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.examinationService.bulkDeleteExams(
      (req.body as { ids: string[] }).ids,
    );
    return sendSuccess(res, result);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const exams = await this.examinationService.exportExams(
      this.examRepository.buildFilterFromQuery(query) as Record<string, unknown>,
      { ids },
    );

    const result = await this.exportService.build(
      format,
      exams,
      [
        { key: 'code', header: 'Code', value: (e) => e.code },
        { key: 'title', header: 'Title', width: 32, value: (e) => e.title },
        { key: 'examType', header: 'Type', value: (e) => e.examType },
        { key: 'course', header: 'Course', value: (e) => populatedValue(e.courseId, 'code') },
        {
          key: 'department',
          header: 'Department',
          width: 24,
          value: (e) => populatedValue(e.departmentId, 'name'),
        },
        { key: 'semester', header: 'Semester', value: (e) => e.semester },
        { key: 'academicYear', header: 'Academic Year', value: (e) => e.academicYear },
        { key: 'totalMarks', header: 'Total Marks', value: (e) => e.totalMarks },
        { key: 'credits', header: 'Credits', value: (e) => e.credits },
        { key: 'scheduledAt', header: 'Scheduled', value: (e) => e.scheduledAt },
        { key: 'status', header: 'Status', value: (e) => e.status },
        { key: 'registered', header: 'Registered', value: (e) => e.stats.registeredCount },
        { key: 'appeared', header: 'Appeared', value: (e) => e.stats.appearedCount },
        { key: 'passCount', header: 'Passed', value: (e) => e.stats.passCount },
        { key: 'failCount', header: 'Failed', value: (e) => e.stats.failCount },
        { key: 'averagePercent', header: 'Average %', value: (e) => e.stats.averagePercent },
      ],
      'Exams',
    );

    const fileName = this.exportService.fileName('exams', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(exams.length));
    res.send(result.buffer);
  };

  /* ---------------------------------- papers --------------------------------- */

  listPapers = async (req: Request, res: Response): Promise<Response> => {
    const papers = await this.examinationService.listPapers(req.params.id as string);
    return sendSuccess(res, papers);
  };

  createPaper = async (req: Request, res: Response): Promise<Response> => {
    const paper = await this.examinationService.createPaper(req.params.id as string, req.body);
    return sendCreated(res, paper);
  };

  /* ------------------------------- registration ------------------------------ */

  listRegistrations = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.examinationService.listRegistrations(req.params.id as string, {
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      filter: this.registrationRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  registerStudents = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.examinationService.registerStudents(
      req.params.id as string,
      req.body,
    );
    return sendCreated(res, result);
  };

  updateRegistration = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as {
      status: ExamRegistrationDocument['status'];
      reason?: string;
    };

    const registration = await this.examinationService.updateRegistration(
      req.params.registrationId as string,
      body.status,
      body.reason,
    );

    return sendSuccess(res, registration);
  };

  hallTickets = async (req: Request, res: Response): Promise<Response> => {
    const registrations = await this.examinationService.hallTickets(req.params.id as string);

    return sendSuccess(
      res,
      registrations.map((registration) => ({
        id: String(registration._id),
        hallTicketNumber: registration.hallTicketNumber,
        seatNumber: registration.seatNumber,
        rollNumber: populatedValue(registration.studentId, 'rollNumber'),
        batch: populatedValue(registration.batchId, 'name'),
        attempt: registration.attempt,
        status: registration.status,
      })),
    );
  };

  /* -------------------------------- attendance ------------------------------- */

  listAttendance = async (req: Request, res: Response): Promise<Response> => {
    const records = await this.examinationService.listExamAttendance(req.params.id as string);
    return sendSuccess(res, records);
  };

  markAttendance = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.examinationService.markAttendance(
      req.params.id as string,
      req.body,
    );
    return sendSuccess(res, result);
  };

  /* ---------------------------------- marks ---------------------------------- */

  listMarks = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.resultService.listMarks(req.params.id as string, {
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      filter: this.marksRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  enterMarks = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.resultService.enterMarks(req.params.id as string, req.body);
    return sendSuccess(res, result);
  };

  verifyMarks = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.resultService.verifyMarks(
      req.params.id as string,
      (req.body as { studentIds?: string[] }).studentIds,
    );
    return sendSuccess(res, result);
  };

  correctMark = async (req: Request, res: Response): Promise<Response> => {
    const entry = await this.resultService.correctMark(req.params.id as string, req.body);
    return sendSuccess(res, entry);
  };

  /* --------------------------------- results --------------------------------- */

  publishResults = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.resultService.publishResults(req.params.id as string, req.body);
    return sendSuccess(res, result);
  };

  unpublishResults = async (req: Request, res: Response): Promise<Response> => {
    const exam = await this.resultService.unpublishResults(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, exam);
  };

  recalculateResults = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.resultService.recalculateResults(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, result);
  };

  publicationHistory = async (req: Request, res: Response): Promise<Response> => {
    const history = await this.resultService.publicationHistory(req.params.id as string);
    return sendSuccess(res, history);
  };

  /* -------------------------- student results and transcripts ----------------- */

  studentResults = async (req: Request, res: Response): Promise<Response> => {
    const results = await this.resultService.studentResults(req.params.studentId as string);
    return sendSuccess(res, results);
  };

  /* ------------------------------- self-service ------------------------------ */
  // No `studentId` parameter by design: identity comes from the token, so
  // there is nothing here for a browser to substitute.

  ownResults = async (_req: Request, res: Response): Promise<Response> => {
    const results = await this.resultService.ownResults();
    return sendSuccess(res, results);
  };

  ownTranscript = async (_req: Request, res: Response): Promise<Response> => {
    const transcript = await this.resultService.ownTranscript();
    return sendSuccess(res, transcript);
  };

  getTranscript = async (req: Request, res: Response): Promise<Response> => {
    const transcript = await this.resultService.getTranscript(req.params.studentId as string);
    return sendSuccess(res, transcript);
  };

  listTranscriptVersions = async (req: Request, res: Response): Promise<Response> => {
    const versions = await this.resultService.listTranscriptVersions(
      req.params.studentId as string,
    );
    return sendSuccess(res, versions);
  };

  generateTranscript = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { studentId: string; upToSemester?: number | null };
    const transcript = await this.resultService.generateTranscript(
      body.studentId,
      body.upToSemester,
    );
    return sendCreated(res, transcript);
  };
}
