'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiClient, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

export type ExportFormat = 'csv' | 'xlsx';

interface ExportArgs {
  format: ExportFormat;
  ids?: string[];
  filters?: Record<string, unknown>;
}

interface BulkResult {
  successCount: number;
  failureCount: number;
  results: Array<{ message?: string }>;
}

/** Triggers a file download from a POST response carrying the server filename. */
async function download(path: string, body: unknown): Promise<number> {
  const response = await apiClient.post(path, body, { responseType: 'blob' });

  const disposition = String(response.headers['content-disposition'] ?? '');
  const fileName = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? 'export.csv';

  const url = URL.createObjectURL(response.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return Number(response.headers['x-row-count'] ?? 0);
}

/**
 * Departments and batches share the same export and bulk-delete shape, so one
 * pair of factories serves both rather than four near-identical hooks.
 */
type BulkResource = 'departments' | 'batches' | 'courses';

function createExportHook(resource: BulkResource) {
  return function useExport() {
    return useMutation({
      mutationFn: async ({ format, ids, filters = {} }: ExportArgs) => {
        const { page: _page, limit: _limit, ...exportable } = filters;
        const rows = await download(
          `/${resource}/bulk/export${buildQuery({ ...exportable, format })}`,
          { ids },
        );
        return { rows };
      },
      onSuccess: (result) =>
        toast.success(`Exported ${result.rows} record${result.rows === 1 ? '' : 's'}.`),
      onError: (error: ApiError) => toast.error(error.message),
    });
  };
}

function createBulkDeleteHook(resource: BulkResource, noun: string) {
  return function useBulkDelete() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: async (ids: string[]) => {
        const response = await apiClient.delete(`/${resource}/bulk`, { data: { ids } });
        return response.data.data as BulkResult;
      },

      onSuccess: (result) => {
        void queryClient.invalidateQueries({ queryKey: [resource] });
        // Counts on the dashboard and in other pickers are now stale.
        void queryClient.invalidateQueries({ queryKey: ['departments'] });
        void queryClient.invalidateQueries({ queryKey: ['batches'] });

        if (result.failureCount === 0) {
          toast.success(`Removed ${result.successCount} ${noun}${result.successCount === 1 ? '' : 's'}.`);
          return;
        }

        // The server explains *why* a row was blocked; that beats a bare count.
        const reason = result.results.find((row) => row.message)?.message;
        toast(
          `Removed ${result.successCount}. ${result.failureCount} could not be removed${reason ? `: ${reason}` : '.'}`,
          { icon: '⚠️', duration: 7000 },
        );
      },

      onError: (error: ApiError) => toast.error(error.message),
    });
  };
}

export const useExportDepartments = createExportHook('departments');
export const useExportBatches = createExportHook('batches');
export const useExportCourses = createExportHook('courses');
export const useBulkDeleteDepartments = createBulkDeleteHook('departments', 'department');
export const useBulkDeleteBatches = createBulkDeleteHook('batches', 'batch');
export const useBulkDeleteCourses = createBulkDeleteHook('courses', 'course');
