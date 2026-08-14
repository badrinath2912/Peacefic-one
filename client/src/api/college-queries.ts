'use client';

import type {
  CollegeType,
  GradingScale,
  UpdateCollegeInput,
  UpdateCollegeSettingsInput,
} from '@peacefic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiGet, apiGetPaginated, apiPatch, apiPost, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import type { PaginatedQuery } from './queries';

export const collegeKeys = {
  own: () => ['colleges', 'me'] as const,
  review: (params?: Record<string, unknown>) => ['colleges', 'review', params ?? {}] as const,
};

/**
 * The caller's own institution, as `GET /colleges/me` returns it.
 *
 * `settings.joinCode` is absent by design — it carries `select: false` on the
 * model and never leaves the server, so there is nothing to declare here.
 */
export interface OwnCollege {
  id: string;
  name: string;
  /** Fixed at registration; shown, never edited. */
  code: string;
  type: CollegeType;
  affiliatedTo: string | null;
  accreditation: string[];
  establishedYear: number;
  logoUrl: string | null;
  website: string | null;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    district: string | null;
    state: string;
    country: string;
    pincode: string;
  };
  timezone: string;
  academicYearStartMonth: number;
  status: string;
  primaryContact: { name: string; email: string; phone: string; designation: string };
  settings: {
    allowStudentSelfRegistration: boolean;
    attendanceThresholdPercent: number;
    gradingScale: GradingScale;
    certificateSignatory: { name: string; designation: string; signatureUrl: string | null };
  };
  stats: {
    totalStudents: number;
    totalFaculty: number;
    totalDepartments: number;
    totalBatches: number;
  };
}

/**
 * `enabled` gates the request on `college:read` at the call site, so a caller
 * without it never issues the call rather than issuing it and handling a 403.
 */
export function useOwnCollege(enabled = true) {
  return useQuery({
    enabled,
    queryKey: collegeKeys.own(),
    queryFn: () => apiGet<OwnCollege>('/colleges/me'),
  });
}

/** Both writes answer with the whole college, so the cache is written through. */
function useCollegeMutation<TInput>(
  mutationFn: (input: TInput) => Promise<OwnCollege>,
  successMessage: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (college) => {
      queryClient.setQueryData(collegeKeys.own(), college);
      toast.success(successMessage);
    },
    // Field-level messages are mapped onto the form by `useApiForm`; this is
    // the fallback for anything without a field path.
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateCollege() {
  return useCollegeMutation<UpdateCollegeInput>(
    (input) => apiPatch<OwnCollege>('/colleges/me', input),
    'Institution details updated.',
  );
}

export function useUpdateCollegeSettings() {
  return useCollegeMutation<UpdateCollegeSettingsInput>(
    (input) => apiPatch<OwnCollege>('/colleges/me/settings', input),
    'Settings saved.',
  );
}

/* ---------------------------- platform review ----------------------------- */

/**
 * A registration awaiting review, as `GET /colleges` returns it.
 *
 * Reachable only with `college:approve`, which no role holds except
 * `platform_admin`'s wildcard — so these hooks are gated at their call site
 * rather than being offered to a college administrator who would only get 403.
 */
export interface CollegeForReview {
  id: string;
  name: string;
  code: string;
  type: CollegeType;
  email: string;
  phone: string;
  establishedYear: number;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  rejectionReason: string | null;
  approvedAt: string | null;
  address: { city: string; state: string } | null;
  primaryContact: { name: string; email: string; phone: string; designation: string } | null;
  createdAt: string;
}

export function useCollegesForReview(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: collegeKeys.review(params),
    queryFn: () => apiGetPaginated<CollegeForReview>(`/colleges${buildQuery(params)}`),
  });
}

/** Both decisions invalidate the same list, so the queue reflects the outcome. */
function useReviewMutation<TInput>(
  mutationFn: (input: TInput) => Promise<CollegeForReview>,
  success: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['colleges', 'review'] });
      toast.success(success);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useApproveCollege() {
  return useReviewMutation<{ id: string; notes?: string }>(
    ({ id, notes }) => apiPost<CollegeForReview>(`/colleges/${id}/approve`, { notes }),
    'Institution approved. Their administrator can now sign in.',
  );
}

export function useRejectCollege() {
  return useReviewMutation<{ id: string; reason: string }>(
    ({ id, reason }) => apiPost<CollegeForReview>(`/colleges/${id}/reject`, { reason }),
    'Registration rejected.',
  );
}

/* -------------------------------- join code -------------------------------- */

export interface JoinCodeState {
  joinCode: string | null;
  allowStudentSelfRegistration: boolean;
}

/**
 * `GET /colleges/me/join-code`.
 *
 * Kept out of `useOwnCollege` on purpose: the code is `select: false` on the
 * model and absent from every ordinary college read. Fetching it separately
 * means it is only ever in memory on the one screen that asks for it.
 */
export function useJoinCode(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['colleges', 'me', 'join-code'] as const,
    queryFn: () => apiGet<JoinCodeState>('/colleges/me/join-code'),
  });
}

export function useRegenerateJoinCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<{ joinCode: string }>('/colleges/me/join-code/regenerate'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['colleges', 'me', 'join-code'] });
      toast.success('New join code issued. The previous one no longer works.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
