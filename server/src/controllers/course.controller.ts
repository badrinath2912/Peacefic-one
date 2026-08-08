import type { Request, Response } from 'express';

import type { CourseRepository } from '@/repositories/course.repository';
import type { CourseService } from '@/services/course.service';
import type { ExportService } from '@/services/export.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

function relationList(value: unknown, key: string): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) =>
      entry && typeof entry === 'object' && key in entry
        ? String((entry as Record<string, unknown>)[key] ?? '')
        : '',
    )
    .filter(Boolean)
    .join('; ');
}

export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly courseRepository: CourseRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.courseService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.courseRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const course = await this.courseService.getById(req.params.id as string);
    return sendSuccess(res, course);
  };

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.courseService.getProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const course = await this.courseService.create(req.body);
    return sendCreated(res, course);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const course = await this.courseService.update(req.params.id as string, req.body);
    return sendSuccess(res, course);
  };

  assignInstructors = async (req: Request, res: Response): Promise<Response> => {
    const course = await this.courseService.assignInstructors(req.params.id as string, req.body);
    return sendSuccess(res, course);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.courseService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const { ids } = req.body as { ids: string[] };
    const result = await this.courseService.bulkDelete(ids);
    return sendSuccess(res, result);
  };

  analytics = async (_req: Request, res: Response): Promise<Response> => {
    const analytics = await this.courseService.analytics();
    return sendSuccess(res, analytics);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const courses = await this.courseService.exportCourses(
      this.courseRepository.buildFilterFromQuery(query),
      { ids },
    );

    const result = await this.exportService.build(
      format,
      courses,
      [
        { key: 'code', header: 'Code', value: (c) => c.code },
        { key: 'title', header: 'Course', width: 32, value: (c) => c.title },
        { key: 'category', header: 'Category', value: (c) => c.category },
        { key: 'level', header: 'Level', value: (c) => c.level },
        { key: 'semester', header: 'Semester', value: (c) => c.semester },
        { key: 'credits', header: 'Credits', value: (c) => c.credits },
        { key: 'durationHours', header: 'Duration (hours)', value: (c) => c.durationHours },
        {
          key: 'departments',
          header: 'Departments',
          width: 26,
          value: (c) => relationList(c.departmentIds, 'code'),
        },
        {
          key: 'batches',
          header: 'Batches',
          width: 26,
          value: (c) => relationList(c.batchIds, 'code'),
        },
        {
          key: 'prerequisites',
          header: 'Prerequisites',
          width: 26,
          value: (c) => relationList(c.prerequisites, 'code'),
        },
        { key: 'instructorCount', header: 'Instructors', value: (c) => c.instructorIds.length },
        { key: 'enrolled', header: 'Enrolled', value: (c) => c.stats.enrolledCount },
        { key: 'modules', header: 'Modules', value: (c) => c.stats.moduleCount },
        { key: 'tags', header: 'Tags', width: 24, value: (c) => c.tags.join('; ') },
        { key: 'status', header: 'Status', value: (c) => c.status },
        { key: 'publishedAt', header: 'Published', value: (c) => c.publishedAt },
      ],
      'Courses',
    );

    const fileName = this.exportService.fileName('courses', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(courses.length));
    res.send(result.buffer);
  };
}
