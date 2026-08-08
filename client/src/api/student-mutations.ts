'use client';

import type { UpdateOwnStudentProfileInput } from '@peacefic/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiClient, apiPatch, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import { queryKeys, type OwnStudentProfile } from './queries';

export type ExportFormat = 'csv' | 'xlsx';

interface ExportArgs {
  format: ExportFormat;
  /** Omit to export everything matching the current filters. */
  ids?: string[];
  filters?: Record<string, unknown>;
}

/**
 * Downloads rather than rendering. The response is a file, so the blob is
 * handed to an anchor click — the only way to get a browser to save a
 * POST response with the server's filename.
 */
export function useExportStudents() {
  return useMutation({
    mutationFn: async ({ format, ids, filters = {} }: ExportArgs) => {
      const { page: _page, limit: _limit, ...exportable } = filters;

      const response = await apiClient.post(
        `/students/bulk/export${buildQuery({ ...exportable, format })}`,
        { ids },
        { responseType: 'blob' },
      );

      const disposition = String(response.headers['content-disposition'] ?? '');
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const fileName = match?.[1] ?? `students.${format}`;

      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoked immediately: the download has already been handed to the browser.
      URL.revokeObjectURL(url);

      return { rows: Number(response.headers['x-row-count'] ?? 0), fileName };
    },

    onSuccess: (result) => {
      toast.success(`Exported ${result.rows} student${result.rows === 1 ? '' : 's'}.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export interface BulkPatch {
  status?: string;
  batchId?: string;
  departmentId?: string;
  currentSemester?: number;
}

export function useBulkUpdateStudents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: BulkPatch }) =>
      apiPatch<{ successCount: number; failureCount: number; results: Array<{ message?: string }> }>(
        '/students/bulk',
        { ids, patch },
      ),

    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['batches'] });

      // Partial success is the normal case for a bulk action, so both halves
      // are reported rather than a blanket "done".
      if (result.failureCount === 0) {
        toast.success(`Updated ${result.successCount} student${result.successCount === 1 ? '' : 's'}.`);
      } else {
        toast(
          `Updated ${result.successCount}, but ${result.failureCount} could not be changed.`,
          { icon: '⚠️', duration: 6000 },
        );
      }
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkDeleteStudents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.delete('/students/bulk', { data: { ids } });
      return response.data.data as { successCount: number; failureCount: number };
    },

    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['batches'] });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });

      if (result.failureCount === 0) {
        toast.success(`Removed ${result.successCount} student${result.successCount === 1 ? '' : 's'}.`);
      } else {
        toast(`Removed ${result.successCount}, ${result.failureCount} failed.`, { icon: '⚠️' });
      }
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/**
 * The student's own profile. The server resolves the student from the token,
 * so the body carries editable fields only — there is no id to send, and the
 * `.strict()` schema on the server rejects anything institutional outright.
 */
export function useUpdateOwnStudentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateOwnStudentProfileInput) =>
      apiPatch<OwnStudentProfile>('/students/me', payload),

    onSuccess: (updated) => {
      // Write through, then invalidate: the form reopens on the saved values
      // rather than flashing the old ones while the refetch is in flight.
      queryClient.setQueryData(queryKeys.ownStudentProfile(), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ownStudentProfile() });
      toast.success('Profile updated.');
    },

    // Field-level messages are mapped onto the form by `useApiForm`; this is
    // the fallback for anything without a field path.
    onError: (error: ApiError) => toast.error(error.message),
  });
}
