import type { Request, Response } from 'express';

import type { DepartmentRepository } from '@/repositories/department.repository';
import type { DepartmentService } from '@/services/department.service';
import type { ExportService } from '@/services/export.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

export class DepartmentController {
  constructor(
    private readonly departmentService: DepartmentService,
    private readonly departmentRepository: DepartmentRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;
    const result = await this.departmentService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.departmentRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const department = await this.departmentService.getById(req.params.id as string);
    return sendSuccess(res, department);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const department = await this.departmentService.create(req.body);
    return sendCreated(res, department);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const department = await this.departmentService.update(req.params.id as string, req.body);
    return sendSuccess(res, department);
  };

  assignHod = async (req: Request, res: Response): Promise<Response> => {
    const department = await this.departmentService.assignHod(req.params.id as string, req.body);
    return sendSuccess(res, department);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.departmentService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.departmentService.bulkDelete(ids);
    return sendSuccess(res, result);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const departments = await this.departmentService.exportDepartments(
      this.departmentRepository.buildFilterFromQuery(query),
      { ids },
    );

    const hod = (value: unknown, key: string): string => {
      if (value && typeof value === 'object' && key in value) {
        const found = (value as Record<string, unknown>)[key];
        return found ? String(found) : '';
      }
      return '';
    };

    const result = await this.exportService.build(
      format,
      departments,
      [
        { key: 'code', header: 'Code', value: (d) => d.code },
        { key: 'name', header: 'Department', width: 30, value: (d) => d.name },
        {
          key: 'hod',
          header: 'Head of Department',
          width: 24,
          value: (d) =>
            `${hod(d.hodId, 'firstName')} ${hod(d.hodId, 'lastName')}`.trim(),
        },
        { key: 'hodEmail', header: 'HOD Email', width: 26, value: (d) => hod(d.hodId, 'email') },
        { key: 'establishedYear', header: 'Established', value: (d) => d.establishedYear },
        { key: 'totalStudents', header: 'Students', value: (d) => d.stats.totalStudents },
        { key: 'totalFaculty', header: 'Faculty', value: (d) => d.stats.totalFaculty },
        { key: 'totalBatches', header: 'Batches', value: (d) => d.stats.totalBatches },
        { key: 'description', header: 'Description', width: 40, value: (d) => d.description },
        { key: 'status', header: 'Status', value: (d) => d.status },
        { key: 'createdAt', header: 'Created', value: (d) => d.createdAt },
      ],
      'Departments',
    );

    const fileName = this.exportService.fileName('departments', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(departments.length));
    res.send(result.buffer);
  };

  analytics = async (req: Request, res: Response): Promise<Response> => {
    const analytics = await this.departmentService.analytics(req.params.id as string);
    return sendSuccess(res, analytics);
  };
}
