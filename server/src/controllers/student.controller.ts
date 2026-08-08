import type { ImportStudentRow, StudentListQuery } from '@peacefic/shared';
import type { Request, Response } from 'express';

import { ValidationError } from '@/errors';
import type { StudentRepository } from '@/repositories/student.repository';
import type { ExportService } from '@/services/export.service';
import type { StudentService } from '@/services/student.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly studentRepository: StudentRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as unknown as StudentListQuery & Record<string, unknown>;

    const result = await this.studentService.list(query, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      search: query.search,
      include: query.include,
      filter: this.studentRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const student = await this.studentService.getById(req.params.id as string);
    return sendSuccess(res, student);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const student = await this.studentService.create(req.body);
    return sendCreated(res, student);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const student = await this.studentService.update(req.params.id as string, req.body);
    return sendSuccess(res, student);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.studentService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  bulkUpdate = async (req: Request, res: Response): Promise<Response> => {
    const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
    const result = await this.studentService.bulkUpdate(ids, patch);
    return sendSuccess(res, result);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.studentService.bulkDelete(ids);
    return sendSuccess(res, result);
  };

  /**
   * Import runs dry by default. Nothing is written until the caller explicitly
   * passes `dryRun=false` after reviewing the report.
   */
  importRows = async (req: Request, res: Response): Promise<Response> => {
    const { rows } = req.body as { rows: ImportStudentRow[] };
    const dryRun = (req.query as { dryRun?: boolean }).dryRun !== false;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError('The import contained no rows.', [
        { field: 'rows', message: 'At least one row is required' },
      ]);
    }

    const report = await this.studentService.importRows(rows, dryRun);
    return sendSuccess(res, report);
  };

  /** Column headers plus one example row, so the file shape is unambiguous. */
  importTemplate = async (_req: Request, res: Response): Promise<Response> => {
    return sendSuccess(res, {
      columns: [
        'firstName',
        'lastName',
        'email',
        'phone',
        'rollNumber',
        'registerNumber',
        'departmentCode',
        'batchCode',
        'admissionDate',
        'currentSemester',
        'dateOfBirth',
        'gender',
        'tenthPercent',
        'twelfthPercent',
        'currentCgpa',
        'guardianName',
        'guardianPhone',
      ],
      example: {
        firstName: 'Meera',
        lastName: 'Iyer',
        email: 'meera.iyer@example.edu',
        phone: '+919812345678',
        rollNumber: 'CS22B001',
        registerNumber: '731122104001',
        departmentCode: 'CSE',
        batchCode: 'CSE-22-A',
        admissionDate: '2022-08-01',
        currentSemester: 5,
        dateOfBirth: '2004-03-14',
        gender: 'female',
        tenthPercent: 92.4,
        twelfthPercent: 89.1,
        currentCgpa: 8.6,
        guardianName: 'Lakshmi Iyer',
        guardianPhone: '+919812345600',
      },
      notes: {
        admissionDate: 'YYYY-MM-DD or DD/MM/YYYY',
        gender: 'male | female | other | prefer_not_to_say',
        departmentCode: 'Must match an existing department code',
        batchCode: 'Must match an existing batch in that department',
      },
    });
  };

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.studentService.getProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  /** Streams a file download rather than returning the envelope. */
  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as StudentListQuery & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const students = await this.studentService.exportStudents(query, { ids });

    const relation = (value: unknown, key: string): string => {
      if (value && typeof value === 'object' && key in value) {
        return String((value as Record<string, unknown>)[key] ?? '');
      }
      return '';
    };

    const result = await this.exportService.build(
      format,
      students,
      [
        { key: 'admissionNumber', header: 'Admission Number', value: (s) => s.admissionNumber },
        { key: 'rollNumber', header: 'Roll Number', value: (s) => s.rollNumber },
        { key: 'registerNumber', header: 'Register Number', value: (s) => s.registerNumber },
        {
          key: 'name',
          header: 'Name',
          width: 24,
          value: (s) =>
            `${relation(s.userId, 'firstName')} ${relation(s.userId, 'lastName')}`.trim(),
        },
        { key: 'email', header: 'Email', width: 28, value: (s) => relation(s.userId, 'email') },
        { key: 'phone', header: 'Mobile', value: (s) => relation(s.userId, 'phone') },
        { key: 'alternatePhone', header: 'Alternate Mobile', value: (s) => s.alternatePhone },
        { key: 'department', header: 'Department', value: (s) => relation(s.departmentId, 'name') },
        { key: 'batch', header: 'Batch', value: (s) => relation(s.batchId, 'code') },
        { key: 'programme', header: 'Programme', value: (s) => s.programme },
        { key: 'section', header: 'Section', value: (s) => s.section },
        { key: 'currentSemester', header: 'Semester', value: (s) => s.currentSemester },
        { key: 'admissionDate', header: 'Joining Date', value: (s) => s.admissionDate },
        { key: 'gender', header: 'Gender', value: (s) => s.gender },
        { key: 'dateOfBirth', header: 'Date of Birth', value: (s) => s.dateOfBirth },
        { key: 'bloodGroup', header: 'Blood Group', value: (s) => s.bloodGroup },
        { key: 'cgpa', header: 'CGPA', value: (s) => s.academics.currentCgpa },
        { key: 'activeBacklogs', header: 'Active Backlogs', value: (s) => s.academics.activeBacklogs },
        { key: 'guardianName', header: 'Parent Name', value: (s) => s.guardian?.name },
        { key: 'guardianPhone', header: 'Parent Mobile', value: (s) => s.guardian?.phone },
        { key: 'city', header: 'City', value: (s) => s.address?.city },
        { key: 'state', header: 'State', value: (s) => s.address?.state },
        { key: 'pincode', header: 'PIN Code', value: (s) => s.address?.pincode },
        { key: 'isPlaced', header: 'Placed', value: (s) => (s.placement.isPlaced ? 'Yes' : 'No') },
        { key: 'status', header: 'Status', value: (s) => s.status },
        // Aadhaar deliberately omitted: an export is the easiest way for
        // regulated data to leave the building.
      ],
      'Students',
    );

    const fileName = this.exportService.fileName('students', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(students.length));
    res.send(result.buffer);
  };

  resendInvite = async (req: Request, res: Response): Promise<Response> => {
    await this.studentService.resendInvite(req.params.id as string);
    return sendSuccess(res, { message: 'The invitation has been sent again.' });
  };

  /* ------------------------------ student portal ---------------------------- */

  getOwnProfile = async (_req: Request, res: Response): Promise<Response> => {
    const student = await this.studentService.getOwnProfile();
    return sendSuccess(res, student);
  };

  updateOwnProfile = async (req: Request, res: Response): Promise<Response> => {
    const student = await this.studentService.updateOwnProfile(req.body);
    return sendSuccess(res, student);
  };
}
