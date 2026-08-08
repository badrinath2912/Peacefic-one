'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiGet, apiGetPaginated, apiPatch, apiPost, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import type { PaginatedQuery } from './queries';

/* --------------------------------- types ---------------------------------- */

export interface TrainingRequest {
  id: string;
  reference: string;
  title: string;
  description: string;
  trainingType: string;
  expectedParticipants: number;
  preferredStartDate: string;
  preferredEndDate: string;
  durationHours: number;
  mode: string;
  topics: string[];
  objectives: string | null;
  budget: { currency: string; amount: number } | null;
  priority: string;
  status: string;
  approvalStatus: string;
  reviewComments: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  reviewedAt: string | null;
  departmentIds: Array<string | { id: string; name: string; code: string }>;
  batchIds: Array<string | { id: string; name: string; code: string }>;
  requestedBy: string | { id: string; firstName: string; lastName: string; email: string } | null;
  reviewedBy: string | { id: string; firstName: string; lastName: string; email: string } | null;
  sessionIds: string[];
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  requestId: string | null;
  title: string;
  description: string | null;
  trainingType: string;
  startDate: string;
  endDate: string;
  capacity: number;
  mode: string;
  location: string | null;
  meetingLink: string | null;
  learningObjectives: string[];
  topics: string[];
  status: string;
  cancellationReason: string | null;
  completedAt: string | null;
  feedbackScore: number | null;
  report: string | null;
  departmentIds: Array<string | { id: string; name: string; code: string }>;
  batchIds: Array<string | { id: string; name: string; code: string }>;
  trainerIds: Array<string | { id: string; employeeId: string; designation: string }>;
  stats: { enrolledCount: number; completedCount: number; withdrawnCount: number };
  createdAt: string;
}

export interface TrainingSessionProfile {
  session: TrainingSession;
  counts: { enrolled: number; completed: number; withdrawn: number; attended: number };
  seatsRemaining: number;
  roster: Array<{
    id: string;
    studentId: string;
    rollNumber: string;
    name: string | null;
    status: string;
    enrolledAt: string;
  }>;
}

export interface CalendarEntry {
  id: string;
  title: string;
  trainingType: string;
  startDate: string;
  endDate: string;
  mode: string;
  location: string | null;
  status: string;
  capacity: number;
  enrolledCount: number;
  trainers: string[];
}

export interface TrainingAnalytics {
  requests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byStatus: Record<string, number>;
  };
  sessions: {
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    upcoming: number;
    byStatus: Record<string, number>;
  };
  completion: {
    totalEnrolled: number;
    totalCompleted: number;
    completionRate: number;
    averageFeedback: number | null;
  };
}

/* -------------------------------- queries ---------------------------------- */

export function useTrainingRequests(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: ['training', 'requests', params],
    queryFn: () => apiGetPaginated<TrainingRequest>(`/training/requests${buildQuery(params)}`),
  });
}

export function useTrainingRequest(id: string) {
  return useQuery({
    queryKey: ['training', 'requests', id],
    queryFn: () => apiGet<TrainingRequest>(`/training/requests/${id}`),
    enabled: Boolean(id),
  });
}

export function useTrainingSessions(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: ['training', 'sessions', params],
    queryFn: () => apiGetPaginated<TrainingSession>(`/training/sessions${buildQuery(params)}`),
  });
}

export function useTrainingSession(id: string) {
  return useQuery({
    queryKey: ['training', 'sessions', id],
    queryFn: () => apiGet<TrainingSession>(`/training/sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useTrainingSessionProfile(id: string) {
  return useQuery({
    queryKey: ['training', 'sessions', id, 'profile'],
    queryFn: () => apiGet<TrainingSessionProfile>(`/training/sessions/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useTrainingCalendar(from: Date, to: Date, filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['training', 'calendar', from.toISOString(), to.toISOString(), filters],
    queryFn: () =>
      apiGet<CalendarEntry[]>(`/training/calendar${buildQuery({ from, to, ...filters })}`),
  });
}

export function useTrainingAnalytics(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['training', 'analytics'],
    queryFn: () => apiGet<TrainingAnalytics>('/training/analytics'),
  });
}

/* ------------------------------- mutations --------------------------------- */

/** Every training write invalidates the same tree, so one helper covers them all. */
function useInvalidateTraining() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['training'] });
  };
}

export function useCreateTrainingRequest() {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<TrainingRequest>('/training/requests', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateTrainingRequest(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch<TrainingRequest>(`/training/requests/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

type RequestAction = 'submit' | 'approve' | 'reject' | 'cancel';

const ACTION_MESSAGES: Record<RequestAction, string> = {
  submit: 'Request submitted for approval.',
  approve: 'Request approved.',
  reject: 'Request rejected.',
  cancel: 'Request cancelled.',
};

/** The four workflow transitions share a shape, so one hook serves them all. */
export function useTrainingRequestAction(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: ({ action, body }: { action: RequestAction; body?: Record<string, unknown> }) =>
      apiPost<TrainingRequest>(`/training/requests/${id}/${action}`, body ?? {}),

    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(ACTION_MESSAGES[variables.action]);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCreateTrainingSession() {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<TrainingSession>('/training/sessions', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateTrainingSession(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch<TrainingSession>(`/training/sessions/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCancelTrainingSession(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<TrainingSession>(`/training/sessions/${id}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Session cancelled. Everyone enrolled has been notified.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCompleteTrainingSession(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: {
      completedStudentIds: string[];
      feedbackScore?: number | null;
      report?: string | null;
    }) => apiPost<TrainingSession>(`/training/sessions/${id}/complete`, body),

    onSuccess: (session) => {
      invalidate();
      toast.success(`Session completed. ${session.stats.completedCount} student(s) recorded.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useEnrolStudents(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: { studentIds?: string[]; batchIds?: string[] }) =>
      apiPost<{ enrolled: number; skipped: number; seatsRemaining: number }>(
        `/training/sessions/${id}/enrol`,
        body,
      ),

    onSuccess: (result) => {
      invalidate();

      // Skipped students are already enrolled — worth saying so the count
      // does not look wrong.
      const skipped = result.skipped > 0 ? ` ${result.skipped} already enrolled.` : '';
      toast.success(`Enrolled ${result.enrolled} student(s).${skipped}`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useWithdrawStudents(id: string) {
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (body: { studentIds: string[]; reason?: string }) =>
      apiPost<{ withdrawn: number }>(`/training/sessions/${id}/withdraw`, body),

    onSuccess: (result) => {
      invalidate();
      toast.success(`Withdrew ${result.withdrawn} student(s).`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}
