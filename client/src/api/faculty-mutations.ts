'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiClient, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

/** Mirrors the student export hook: same contract, same download mechanics. */
export function useExportFaculty() {
  return useMutation({
    mutationFn: async ({
      format,
      ids,
      filters = {},
    }: {
      format: 'csv' | 'xlsx';
      ids?: string[];
      filters?: Record<string, unknown>;
    }) => {
      const { page: _page, limit: _limit, ...exportable } = filters;

      const response = await apiClient.post(
        `/faculty/bulk/export${buildQuery({ ...exportable, format })}`,
        { ids },
        { responseType: 'blob' },
      );

      const disposition = String(response.headers['content-disposition'] ?? '');
      const fileName = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `faculty.${format}`;

      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      return { rows: Number(response.headers['x-row-count'] ?? 0) };
    },

    onSuccess: (result) =>
      toast.success(`Exported ${result.rows} record${result.rows === 1 ? '' : 's'}.`),
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkDeleteFaculty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.delete('/faculty/bulk', { data: { ids } });
      return response.data.data as {
        successCount: number;
        failureCount: number;
        results: Array<{ message?: string }>;
      };
    },

    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['faculty'] });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });

      if (result.failureCount === 0) {
        toast.success(`Removed ${result.successCount} record${result.successCount === 1 ? '' : 's'}.`);
        return;
      }

      // The commonest cause is someone still heading a department, and the
      // server says so — surfacing that beats a generic count.
      const reason = result.results.find((row) => row.message)?.message;
      toast(
        `Removed ${result.successCount}. ${result.failureCount} could not be removed${reason ? `: ${reason}` : '.'}`,
        { icon: '⚠️', duration: 7000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}
