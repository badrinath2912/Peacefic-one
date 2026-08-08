import type { Request, Response } from 'express';

import type { BatchRepository } from '@/repositories/batch.repository';
import type { BatchService } from '@/services/batch.service';
import type { ExportService } from '@/services/export.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

export class BatchController {
  constructor(
    private readonly batchService: BatchService,
    private readonly batchRepository: BatchRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;
    const result = await this.batchService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.batchRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const batch = await this.batchService.getById(req.params.id as string);
    return sendSuccess(res, batch);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const batch = await this.batchService.create(req.body);
    return sendCreated(res, batch);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const batch = await this.batchService.update(req.params.id as string, req.body);
    return sendSuccess(res, batch);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.batchService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  listStudents = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;
    const result = await this.batchService.listStudents(req.params.id as string, {
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  promote = async (req: Request, res: Response): Promise<Response> => {
    const batch = await this.batchService.promote(req.params.id as string);
    return sendSuccess(res, batch);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.batchService.bulkDelete(ids);
    return sendSuccess(res, result);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const batches = await this.batchService.exportBatches(
      this.batchRepository.buildFilterFromQuery(query),
      { ids },
    );

    const relation = (value: unknown, key: string): string => {
      if (value && typeof value === 'object' && key in value) {
        const found = (value as Record<string, unknown>)[key];
        return found ? String(found) : '';
      }
      return '';
    };

    const result = await this.exportService.build(
      format,
      batches,
      [
        { key: 'code', header: 'Code', value: (b) => b.code },
        { key: 'name', header: 'Batch', width: 30, value: (b) => b.name },
        { key: 'department', header: 'Department', width: 24, value: (b) => relation(b.departmentId, 'name') },
        {
          key: 'academicYear',
          header: 'Academic Year',
          value: (b) => `${b.admissionYear}-${b.graduationYear}`,
        },
        { key: 'currentSemester', header: 'Semester', value: (b) => b.currentSemester },
        { key: 'section', header: 'Section', value: (b) => b.section },
        { key: 'capacity', header: 'Capacity', value: (b) => b.capacity },
        { key: 'strength', header: 'Current Strength', value: (b) => b.stats.totalStudents },
        {
          key: 'utilisation',
          header: 'Utilisation %',
          value: (b) =>
            b.capacity > 0 ? Math.round((b.stats.totalStudents / b.capacity) * 1000) / 10 : 0,
        },
        {
          key: 'advisor',
          header: 'Class Advisor',
          width: 24,
          value: (b) =>
            `${relation(b.classAdvisorId, 'firstName')} ${relation(b.classAdvisorId, 'lastName')}`.trim(),
        },
        { key: 'status', header: 'Status', value: (b) => b.status },
      ],
      'Batches',
    );

    const fileName = this.exportService.fileName('batches', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(batches.length));
    res.send(result.buffer);
  };

  analytics = async (req: Request, res: Response): Promise<Response> => {
    const analytics = await this.batchService.analytics(req.params.id as string);
    return sendSuccess(res, analytics);
  };
}
