import type { ImportFacultyRow } from '@peacefic/shared';
import type { Request, Response } from 'express';

import { ValidationError } from '@/errors';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { ExportService } from '@/services/export.service';
import type { FacultyService } from '@/services/faculty.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

export class FacultyController {
  constructor(
    private readonly facultyService: FacultyService,
    private readonly facultyRepository: FacultyRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.facultyService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.facultyRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const faculty = await this.facultyService.getById(req.params.id as string);
    return sendSuccess(res, faculty);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const faculty = await this.facultyService.create(req.body);
    return sendCreated(res, faculty);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const faculty = await this.facultyService.update(req.params.id as string, req.body);
    return sendSuccess(res, faculty);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.facultyService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  assignBatches = async (req: Request, res: Response): Promise<Response> => {
    const faculty = await this.facultyService.assignBatches(req.params.id as string, req.body);
    return sendSuccess(res, faculty);
  };

  workload = async (req: Request, res: Response): Promise<Response> => {
    const workload = await this.facultyService.workload(req.params.id as string);
    return sendSuccess(res, workload);
  };

  attendanceCompliance = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as { from?: Date; to?: Date };
    const compliance = await this.facultyService.attendanceCompliance(
      req.params.id as string,
      query.from,
      query.to,
    );
    return sendSuccess(res, compliance);
  };

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.facultyService.getProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.facultyService.bulkDelete(ids);
    return sendSuccess(res, result);
  };

  /** Streams a file download rather than the JSON envelope. */
  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const staff = await this.facultyService.exportFaculty(
      this.facultyRepository.buildFilterFromQuery(query),
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
      staff,
      [
        { key: 'employeeId', header: 'Employee ID', value: (f) => f.employeeId },
        {
          key: 'name',
          header: 'Name',
          width: 24,
          value: (f) => `${relation(f.userId, 'firstName')} ${relation(f.userId, 'lastName')}`.trim(),
        },
        { key: 'email', header: 'Email', width: 28, value: (f) => relation(f.userId, 'email') },
        { key: 'phone', header: 'Mobile', value: (f) => relation(f.userId, 'phone') },
        { key: 'alternatePhone', header: 'Alternate Mobile', value: (f) => f.alternatePhone },
        { key: 'department', header: 'Department', value: (f) => relation(f.departmentId, 'name') },
        { key: 'designation', header: 'Designation', width: 22, value: (f) => f.designation },
        { key: 'type', header: 'Type', value: (f) => f.type },
        { key: 'employmentType', header: 'Employment Type', value: (f) => f.employmentType },
        {
          key: 'qualifications',
          header: 'Qualifications',
          width: 30,
          value: (f) =>
            f.qualifications.map((q) => `${q.degree} ${q.specialization}`.trim()).join('; '),
        },
        { key: 'experienceYears', header: 'Experience (years)', value: (f) => f.experienceYears },
        { key: 'joiningDate', header: 'Date of Joining', value: (f) => f.joiningDate },
        { key: 'specializations', header: 'Specialisations', value: (f) => f.specializations.join('; ') },
        { key: 'batches', header: 'Assigned Batches', value: (f) => f.assignedBatchIds.length },
        { key: 'city', header: 'City', value: (f) => f.address?.city },
        { key: 'district', header: 'District', value: (f) => f.address?.district },
        { key: 'state', header: 'State', value: (f) => f.address?.state },
        { key: 'pincode', header: 'PIN Code', value: (f) => f.address?.pincode },
        { key: 'emergencyName', header: 'Emergency Contact', value: (f) => f.emergencyContact?.name },
        { key: 'emergencyPhone', header: 'Emergency Mobile', value: (f) => f.emergencyContact?.phone },
        { key: 'status', header: 'Status', value: (f) => f.status },
      ],
      'Faculty',
    );

    const fileName = this.exportService.fileName('faculty', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(staff.length));
    res.send(result.buffer);
  };

  importRows = async (req: Request, res: Response): Promise<Response> => {
    const { rows } = req.body as { rows: ImportFacultyRow[] };
    const dryRun = (req.query as { dryRun?: boolean }).dryRun !== false;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError('The import contained no rows.', [
        { field: 'rows', message: 'At least one row is required' },
      ]);
    }

    const report = await this.facultyService.importRows(rows, dryRun);
    return sendSuccess(res, report);
  };

  importTemplate = async (_req: Request, res: Response): Promise<Response> => {
    return sendSuccess(res, {
      columns: [
        'firstName',
        'lastName',
        'email',
        'phone',
        'employeeId',
        'departmentCode',
        'designation',
        'employmentType',
        'type',
        'joiningDate',
        'experienceYears',
      ],
      example: {
        firstName: 'Ravi',
        lastName: 'Kumar',
        email: 'ravi.kumar@example.edu',
        phone: '+919812345671',
        employeeId: 'EMP1042',
        departmentCode: 'CSE',
        designation: 'Assistant Professor',
        employmentType: 'permanent',
        type: 'faculty',
        joiningDate: '2019-07-15',
        experienceYears: 6,
      },
      notes: {
        joiningDate: 'YYYY-MM-DD or DD/MM/YYYY',
        employmentType: 'permanent | contract | visiting | guest',
        type: 'faculty | trainer',
      },
    });
  };
}
