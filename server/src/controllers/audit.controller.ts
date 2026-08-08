import type { Request, Response } from 'express';

import type { ActivityLogRepository } from '@/repositories/activity-log.repository';
import type { AuditService } from '@/services/audit.service';
import type { ExportService } from '@/services/export.service';
import { sendPaginated } from '@/utils/response';

/**
 * Reading the audit log.
 *
 * Read-only by design: the model rejects updates and deletes at the schema
 * level, so there is no write path here to expose. Tenant isolation comes from
 * the repository being tenant-scoped, not from anything this controller does.
 */
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly activityLogRepository: ActivityLogRepository,
    private readonly exportService: ExportService,
  ) {}

  /**
   * The date range arrives as `from`/`to` rather than through the repository's
   * operator syntax: `createdAt[gte]` is parsed by Express into a nested object
   * that `buildFilterFromQuery` never matches, so it would be silently ignored.
   * These two are already on the shared pagination schema and survive intact.
   */
  private withDateRange(
    query: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): Record<string, unknown> {
    const from = query.from as Date | undefined;
    const to = query.to as Date | undefined;

    if (!from && !to) return filter;

    return {
      ...filter,
      createdAt: {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      },
    };
  }

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.auditService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.withDateRange(
        query,
        this.activityLogRepository.buildFilterFromQuery(query) as Record<string, unknown>,
      ),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const entries = await this.auditService.export(
      this.withDateRange(
        query,
        this.activityLogRepository.buildFilterFromQuery(query) as Record<string, unknown>,
      ),
      query.search as string | undefined,
    );

    const result = await this.exportService.build(
      format,
      entries,
      [
        { key: 'createdAt', header: 'When', width: 22, value: (entry) => entry.createdAt },
        { key: 'userEmail', header: 'User', width: 28, value: (entry) => entry.userEmail },
        { key: 'userRole', header: 'Role', width: 18, value: (entry) => entry.userRole },
        { key: 'action', header: 'Action', width: 30, value: (entry) => entry.action },
        { key: 'category', header: 'Category', value: (entry) => entry.category },
        { key: 'severity', header: 'Severity', value: (entry) => entry.severity },
        { key: 'outcome', header: 'Outcome', value: (entry) => entry.outcome },
        {
          key: 'entityType',
          header: 'Entity',
          width: 20,
          value: (entry) => entry.entity?.type ?? '',
        },
        {
          key: 'entityLabel',
          header: 'Entity Label',
          width: 26,
          value: (entry) => entry.entity?.label ?? '',
        },
        {
          key: 'errorMessage',
          header: 'Error',
          width: 30,
          value: (entry) => entry.errorMessage ?? '',
        },
        { key: 'requestId', header: 'Request', width: 20, value: (entry) => entry.requestId ?? '' },
      ],
      'Audit Log',
    );

    const fileName = this.exportService.fileName('audit-log', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(entries.length));
    res.send(result.buffer);
  };
}
