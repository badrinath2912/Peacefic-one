'use client';

import type { ApproveStudentRegistrationInput } from '@peacefic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiGetPaginated, apiPost, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import type { PaginatedQuery } from './queries';

/**
 * Students who signed up with the college join code and are awaiting review.
 *
 * Every endpoint here is gated on `student:approve`, and
 * `StudentRegistrationRepository` is `tenantScoped: true` — so the server
 * narrows these reads to the caller's own institution before this module is
 * involved. **No college id is sent from the client**, on any call: there is no
 * parameter through which another tenant could be selected.
 */
export interface StudentRegistration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  rollNumber: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  reviewedAt: string | null;
  studentId: string | null;
  createdAt: string;
}

export const registrationKeys = {
  all: ['student-registrations'] as const,
  list: (params?: Record<string, unknown>) =>
    ['student-registrations', 'list', params ?? {}] as const,
};

/**
 * `enabled` gates the request on `student:approve` at the call site, so a
 * caller without it never issues the call rather than issuing it and handling
 * a 403.
 */
export function useStudentRegistrations(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: registrationKeys.list(params),
    queryFn: () => apiGetPaginated<StudentRegistration>(`/students/registrations${buildQuery(params)}`),
  });
}

/**
 * Both decisions invalidate the queue and the student list: approving creates a
 * `Student`, so a stale roster would omit someone who now exists.
 */
function useReviewMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: registrationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success(success);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useApproveRegistration() {
  return useReviewMutation<{ id: string; input: ApproveStudentRegistrationInput }>(
    ({ id, input }) => apiPost(`/students/registrations/${id}/approve`, input),
    'Student approved. They can sign in now.',
  );
}

export function useRejectRegistration() {
  return useReviewMutation<{ id: string; reason: string }>(
    ({ id, reason }) => apiPost(`/students/registrations/${id}/reject`, { reason }),
    'Registration rejected.',
  );
}
