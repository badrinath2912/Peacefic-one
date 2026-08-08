'use client';

import type { AttendanceStatus } from '@peacefic/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiPatch, apiPost, type ApiError } from '@/lib/api-client';

import { queryKeys, type AttendanceSheet } from './queries';

export interface MarkAttendancePayload {
  entries: Array<{ studentId: string; status: AttendanceStatus; remarks?: string | null }>;
  lockAfterMarking?: boolean;
}

export interface MarkAttendanceResult {
  sessionId: string;
  stats: AttendanceSheet['session']['stats'];
  belowThreshold: Array<{ studentId: string; rollNumber: string; percentage: number }>;
}

export function useMarkAttendance(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MarkAttendancePayload) =>
      apiPost<MarkAttendanceResult>(`/attendance/sessions/${sessionId}/mark`, payload),

    onSuccess: (result) => {
      // Marking changes the session, the sheet, the defaulter list and the
      // trend. Invalidating each keeps them from showing stale figures.
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceSheet(sessionId) });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'defaulters'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'trend'] });

      const marked = result.stats.totalStudents;
      toast.success(`Attendance saved for ${marked} student${marked === 1 ? '' : 's'}.`);

      // Surfaced immediately: the person who just marked is the one who can act.
      if (result.belowThreshold.length > 0) {
        toast(
          `${result.belowThreshold.length} student${result.belowThreshold.length === 1 ? ' is' : 's are'} now below the attendance requirement.`,
          { icon: '⚠️', duration: 6000 },
        );
      }
    },

    onError: (error: ApiError) => {
      toast.error(error.message);
    },
  });
}

export function useCorrectAttendanceRecord(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recordId,
      status,
      reason,
    }: {
      recordId: string;
      status: AttendanceStatus;
      reason: string;
    }) =>
      apiPatch(`/attendance/sessions/${sessionId}/records/${recordId}`, { status, reason }),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceSheet(sessionId) });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Attendance corrected.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useLockAttendanceSession(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost(`/attendance/sessions/${sessionId}/lock`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Session locked.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCreateAttendanceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      batchId: string;
      date: string;
      startTime: string;
      endTime: string;
      type: string;
      periodNumber?: number | null;
      topic?: string | null;
    }) => apiPost<{ id: string }>('/attendance/sessions', payload),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'sessions'] });
      toast.success('Session created.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}
