import { z } from 'zod';

import { AUDIT_CATEGORY, AUDIT_SEVERITY } from '../constants/enums';

import { objectIdSchema, paginationQuerySchema } from './common.schema';

/**
 * Reading the audit log.
 *
 * Every key here is one the request can actually carry end to end, which is
 * narrower than what `ActivityLogRepository` declares:
 *
 * - `express-mongo-sanitize({ replaceWith: '_' })` rewrites `.` in query keys,
 *   so `entity.type` arrives as `entity_type` and never matches a filterable
 *   field. The repository's dotted fields are therefore unreachable over HTTP.
 * - Express parses `createdAt[gte]` into a nested object, which
 *   `buildFilterFromQuery` — which looks for a literal bracketed key — does not
 *   match. The operator syntax is unreachable over HTTP for the same reason.
 *
 * The date range uses `from` and `to` instead: they are already on
 * `paginationQuerySchema`, already the convention in `attendance.service`, and
 * they survive both the sanitiser and the query parser. The controller maps
 * them onto `createdAt`.
 *
 * Nothing is declared here that would be silently dropped.
 */
export const auditListQuerySchema = paginationQuerySchema.extend({
  userId: objectIdSchema.optional(),
  action: z.string().trim().max(120).optional(),
  category: z.enum(AUDIT_CATEGORY).optional(),
  severity: z.enum(AUDIT_SEVERITY).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditExportQuerySchema = auditListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});
