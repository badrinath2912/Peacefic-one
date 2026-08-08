'use client';

import type { FilePurpose } from '@peacefic/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { apiClient, type ApiError } from '@/lib/api-client';

export interface StoredFile {
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  width: number | null;
  height: number | null;
}

interface UploadArgs {
  file: File;
  purpose: FilePurpose;
  /** Deleted server-side once the replacement is stored. */
  replacesKey?: string | null;
}

/**
 * Uploads with real progress. XHR-based progress is used rather than a fake
 * animation — on a slow connection a 10 MB upload needs an honest indicator,
 * and a bar that finishes before the file does is worse than none.
 */
export function useUploadFile() {
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: async ({ file, purpose, replacesKey }: UploadArgs) => {
      setProgress(0);

      const body = new FormData();
      body.append('file', file);
      body.append('purpose', purpose);
      if (replacesKey) body.append('replacesKey', replacesKey);

      const response = await apiClient.post<{ data: StoredFile }>('/files/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
        },
      });

      setProgress(100);
      return response.data.data;
    },

    onError: (error: ApiError) => {
      setProgress(0);
      toast.error(error.message);
    },
  });

  return { ...mutation, progress };
}

export function useDeleteFile() {
  return useMutation({
    mutationFn: async (key: string) => {
      await apiClient.delete('/files', { data: { key } });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
