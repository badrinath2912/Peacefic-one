'use client';

import type { AuditCategory, AuditSeverity } from '@peacefic/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiClient, apiGetPaginated, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import type { ExportFormat } from './admin-mutations';
import type { PaginatedQuery } from './queries';

/**
 * The audit log.
 *
 * Read-only: the model is append-only and the API exposes no write verb, so
 * there is nothing here but a list and an export.
 */
export interface AuditEntry {
  id: string;
  userId:
    | string
    | { id: string; firstName: string; lastName: string; email: string }
    | null;
  /** Denormalised, so the entry survives the user being anonymised. */
  userEmail: string | null;
  userRole: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  entity: { type: string; id: string | null; label: string | null } | null;
  /** Sensitive values are replaced with `[redacted]` before they are stored. */
  changes: Array<{ field: string; from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure';
  errorMessage: string | null;
  createdAt: string;
}

export const auditKeys = {
  all: ['audit'] as const,
  list: (params?: Record<string, unknown>) => ['audit', 'list', params ?? {}] as const,
};

/** Needs `audit:read`, which only a college administrator holds. */
export function useAuditLogs(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: auditKeys.list(params),
    queryFn: () => apiGetPaginated<AuditEntry>(`/audit${buildQuery(params)}`),
  });
}

/**
 * Needs `audit:export`, which is separate from `audit:read` — seeing the log
 * and walking out with a copy of it are different acts.
 */
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: async ({
      format,
      filters = {},
    }: {
      format: ExportFormat;
      filters?: Record<string, unknown>;
    }) => {
      const { page: _page, limit: _limit, ...exportable } = filters;

      const response = await apiClient.post(
        `/audit/bulk/export${buildQuery({ ...exportable, format })}`,
        undefined,
        { responseType: 'blob' },
      );

      const disposition = String(response.headers['content-disposition'] ?? '');
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const fileName = match?.[1] ?? `audit-log.${format}`;

      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      return Number(response.headers['x-row-count'] ?? 0);
    },

    onSuccess: (rows) => toast.success(`Exported ${rows} entr${rows === 1 ? 'y' : 'ies'}.`),
    onError: (error: ApiError) => toast.error(error.message),
  });
}
