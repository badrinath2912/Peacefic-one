'use client';

import type {
  ApplicationStatus,
  CompanyStatus,
  CompanyType,
  InterviewMode,
  InterviewResultStatus,
  InterviewStatus,
  JobStatus,
  JobType,
  PlacementStatus,
  WorkMode,
} from '@peacefic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  apiClient,
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  type ApiError,
} from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

import type { ExportFormat } from './admin-mutations';
import type { PaginatedQuery } from './queries';

/* ---------------------------------- types ---------------------------------- */

/** A relation is either an id or the populated document, depending on `include`. */
export type Relation<T> = string | T;

export interface CompanyContact {
  name: string;
  designation: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

/**
 * `contacts`, `email` and `phone` arrive empty for a caller who cannot manage
 * companies — the server strips recruiter details for students. Treat an empty
 * contacts array as "not visible to you", not "none recorded".
 */
export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  logoKey: string | null;
  website: string | null;
  industry: string;
  companyType: CompanyType;
  sizeRange: string | null;
  headquarters: string | null;
  locations: string[];
  description: string | null;
  email: string | null;
  phone: string | null;
  contacts: CompanyContact[];
  isVerified: boolean;
  verifiedAt: string | null;
  verificationNote: string | null;
  status: CompanyStatus;
  blacklistReason: string | null;
  blacklistedAt: string | null;
  stats: {
    jobCount: number;
    activeJobCount: number;
    applicationCount: number;
    offerCount: number;
    lastDriveAt: string | null;
  };
  createdAt: string;
}

export interface CompanyProfile {
  company: Company;
  jobs: JobPosting[];
  counts: {
    total: number;
    published: number;
    draft: number;
    closed: number;
    applications: number;
    selected: number;
  };
}

export interface CompanyAnalytics {
  total: number;
  active: number;
  blacklisted: number;
  inactive: number;
  verified: number;
  industries: string[];
  byStatus: Record<string, number>;
}

export interface JobEligibility {
  departmentIds: Array<Relation<{ id: string; name: string; code: string }>>;
  batchIds: Array<Relation<{ id: string; name: string; code: string }>>;
  graduationYears: number[];
  minCgpa: number | null;
  maxActiveBacklogs: number | null;
  maxTotalBacklogs: number | null;
  minTenthPercent: number | null;
  minTwelfthPercent: number | null;
  minDiplomaPercent: number | null;
  minAttendancePercent: number | null;
  maxYearGap: number | null;
  genderRestriction: 'any' | 'female_only';
  requiredSkills: string[];
  qualifications: string[];
  allowPlacedStudents: boolean;
  customCriteria: string | null;
}

export interface SelectionRound {
  order: number;
  name: string;
  type: string;
  mode: 'online' | 'offline';
  durationMinutes: number | null;
  description: string | null;
}

export interface JobPosting {
  id: string;
  companyId: Relation<Company>;
  title: string;
  description: string;
  jobType: JobType;
  workMode: WorkMode;
  locations: string[];
  openings: number;
  compensation: {
    currency: string;
    ctcMin: number;
    ctcMax: number;
    fixedComponent: number | null;
    variableComponent: number | null;
    stipendPerMonth: number | null;
    bondMonths: number | null;
    bondAmount: number | null;
  };
  eligibility: JobEligibility;
  selectionRounds: SelectionRound[];
  applicationOpenAt: string;
  applicationCloseAt: string;
  driveDate: string | null;
  status: JobStatus;
  publishedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  stats: {
    eligibleCount: number;
    applicationCount: number;
    shortlistedCount: number;
    selectedCount: number;
    eligibilityComputedAt: string | null;
  };
  createdAt: string;
}

export interface JobProfile {
  job: JobPosting;
  company: Company | null;
  counts: {
    eligible: number;
    applications: number;
    shortlisted: number;
    selected: number;
    openings: number;
  };
  window: { isOpen: boolean; opensAt: string; closesAt: string };
  /** The server's own view of the state machine — never recomputed here. */
  allowedTransitions: JobStatus[];
}

export interface JobAnalytics {
  total: number;
  open: number;
  published: number;
  draft: number;
  closed: number;
  byStatus: Record<string, number>;
  averageCtc: number;
  highestCtc: number;
  totalOpenings: number;
}

export interface EligibilityReason {
  rule: string;
  message: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReason[];
}

export interface EligibleStudent {
  id: string;
  rollNumber: string;
  name: { firstName?: string; lastName?: string } | null;
  departmentId: string;
  batchId: string;
  cgpa: number | null;
  activeBacklogs: number;
  isPlaced: boolean;
}

export interface JobApplication {
  id: string;
  jobPostingId: Relation<JobPosting>;
  companyId: Relation<Company>;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { firstName: string; lastName: string; email: string } | string;
    academics?: { currentCgpa: number | null; activeBacklogs: number };
  }>;
  status: ApplicationStatus;
  currentRound: number;
  coverLetter: string | null;
  answers: Array<{ question: string; answer: string }>;
  resumeUrl: string | null;
  /** Frozen at apply time — not the student's current figures. */
  eligibilitySnapshot: {
    cgpa: number | null;
    activeBacklogs: number;
    totalBacklogs: number;
    attendancePercent: number | null;
    capturedAt: string;
  };
  appliedAt: string;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  selectedAt: string | null;
  history: Array<{
    from: ApplicationStatus | null;
    to: ApplicationStatus;
    actedByRole: 'student' | 'staff';
    at: string;
    reason: string | null;
    roundOrder: number | null;
  }>;
}

export interface ApplicationAnalytics {
  total: number;
  applied: number;
  underReview: number;
  shortlisted: number;
  inProcess: number;
  selected: number;
  rejected: number;
  withdrawn: number;
  offerDeclined: number;
  inProgress: number;
  conversionRate: number;
  byStatus: Record<string, number>;
}

export interface Placement {
  id: string;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { firstName: string; lastName: string; email: string } | string;
  }>;
  applicationId: Relation<{ id: string; status: string; appliedAt: string }>;
  jobPostingId: Relation<JobPosting>;
  companyId: Relation<Company>;
  departmentId: string;
  batchId: string;
  offerDate: string;
  joiningDate: string | null;
  designation: string;
  location: string;
  jobType: 'full_time' | 'internship' | 'internship_ppo';
  package: {
    currency: string;
    ctc: number;
    fixed: number | null;
    variable: number | null;
    stipendPerMonth: number | null;
    bondMonths: number | null;
  };
  isPrimaryOffer: boolean;
  academicYear: string;
  status: PlacementStatus;
  offerLetter: { url: string; fileName: string } | null;
  respondedAt: string | null;
  declineReason: string | null;
  revokeReason: string | null;
  joinedAt: string | null;
  notes: string | null;
  isVerified: boolean;
  history: Array<{
    from: PlacementStatus | null;
    to: PlacementStatus;
    actedByRole: 'student' | 'staff';
    at: string;
    reason: string | null;
  }>;
}

export interface PlacementAnalytics {
  totalOffers: number;
  offered: number;
  accepted: number;
  declined: number;
  joined: number;
  revoked: number;
  notJoined: number;
  placedStudents: number;
  totalStudents: number;
  placementPercentage: number;
  averageCtc: number;
  highestCtc: number;
  lowestCtc: number;
  medianCtc: number;
  byStatus: Record<string, number>;
  byDepartment: Array<{ departmentId: string; placed: number; highestCtc: number }>;
  byBatch: Array<{ batchId: string; placed: number; highestCtc: number }>;
  topRecruiters: Array<{ companyId: string; offers: number; highestCtc: number }>;
}

/** One open drive with the signed-in student's own eligibility against it. */
export interface StudentOpening {
  job: JobPosting;
  eligible: boolean;
  reasons: EligibilityReason[];
}

/* -------------------------------- query keys ------------------------------- */

export const placementKeys = {
  all: ['placement'] as const,

  companies: (params?: Record<string, unknown>) =>
    ['placement', 'companies', params ?? {}] as const,
  company: (id: string) => ['placement', 'companies', id] as const,
  companyProfile: (id: string) => ['placement', 'companies', id, 'profile'] as const,
  companyAnalytics: () => ['placement', 'companies', 'analytics'] as const,

  jobs: (params?: Record<string, unknown>) => ['placement', 'jobs', params ?? {}] as const,
  job: (id: string) => ['placement', 'jobs', id] as const,
  jobProfile: (id: string) => ['placement', 'jobs', id, 'profile'] as const,
  jobAnalytics: () => ['placement', 'jobs', 'analytics'] as const,
  eligibleStudents: (id: string) => ['placement', 'jobs', id, 'eligible-students'] as const,
  studentEligibility: (jobId: string, studentId: string) =>
    ['placement', 'jobs', jobId, 'eligibility', studentId] as const,

  applications: (params?: Record<string, unknown>) =>
    ['placement', 'applications', params ?? {}] as const,
  application: (id: string) => ['placement', 'applications', id] as const,
  applicationAnalytics: (params?: Record<string, unknown>) =>
    ['placement', 'applications', 'analytics', params ?? {}] as const,

  placements: (params?: Record<string, unknown>) =>
    ['placement', 'offers', params ?? {}] as const,
  placement: (id: string) => ['placement', 'offers', id] as const,
  placementAnalytics: (params?: Record<string, unknown>) =>
    ['placement', 'offers', 'analytics', params ?? {}] as const,

  interviews: (params?: Record<string, unknown>) =>
    ['placement', 'interviews', params ?? {}] as const,
  interview: (id: string) => ['placement', 'interviews', id] as const,
  interviewAnalytics: (params?: Record<string, unknown>) =>
    ['placement', 'interviews', 'analytics', params ?? {}] as const,

  // Self-service. No id in the key: the server derives it from the token, so
  // there is only ever one caller's data in this entry.
  myOpenings: () => ['placement', 'me', 'openings'] as const,
  myEligibility: (jobId: string) => ['placement', 'me', 'eligibility', jobId] as const,
  myApplications: () => ['placement', 'me', 'applications'] as const,
  myApplication: (id: string) => ['placement', 'me', 'applications', id] as const,
  myInterviews: () => ['placement', 'me', 'interviews'] as const,
  myInterview: (id: string) => ['placement', 'me', 'interviews', id] as const,
  myOffers: () => ['placement', 'me', 'offers'] as const,
  myOffer: (id: string) => ['placement', 'me', 'offers', id] as const,
};

/**
 * Every placement write can move counts on a dashboard, a company profile and
 * a job list at once, so one invalidation covers the tree rather than each
 * caller guessing which keys went stale.
 */
function useInvalidatePlacement() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: placementKeys.all });
  };
}

/* -------------------------------- companies -------------------------------- */

/**
 * `enabled` exists because not every placement reader may read companies —
 * HOD holds `placement:read_all` without `company:read`, and a page that
 * fires this for them would earn a 403 rather than degrade.
 */
export function useCompanies(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.companies(params),
    queryFn: () => apiGetPaginated<Company>(`/companies${buildQuery(params)}`),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: placementKeys.company(id),
    queryFn: () => apiGet<Company>(`/companies/${id}`),
    enabled: Boolean(id),
  });
}

export function useCompanyProfile(id: string) {
  return useQuery({
    queryKey: placementKeys.companyProfile(id),
    queryFn: () => apiGet<CompanyProfile>(`/companies/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useCompanyAnalytics(enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.companyAnalytics(),
    queryFn: () => apiGet<CompanyAnalytics>('/companies/analytics'),
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Company>('/companies', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateCompany(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch<Company>(`/companies/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteCompany() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/companies/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Company removed.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useVerifyCompany(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: { isVerified: boolean; note?: string }) =>
      apiPost<Company>(`/companies/${id}/verify`, body),

    onSuccess: (company) => {
      invalidate();
      toast.success(company.isVerified ? 'Company verified.' : 'Verification withdrawn.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBlacklistCompany(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) => apiPost<Company>(`/companies/${id}/blacklist`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Company blacklisted. It can no longer post new roles.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useReinstateCompany(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) => apiPost<Company>(`/companies/${id}/reinstate`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Company reinstated.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUploadCompanyLogo(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);

      // Content-Type is left unset so the browser adds the multipart boundary.
      const response = await apiClient.post(`/companies/${id}/logo`, form, {
        headers: { 'Content-Type': undefined },
      });

      return response.data.data as Company;
    },

    onSuccess: () => {
      invalidate();
      toast.success('Logo updated.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkDeleteCompanies() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.delete('/companies/bulk', { data: { ids } });
      return response.data.data as {
        successCount: number;
        failureCount: number;
        results: Array<{ message?: string }>;
      };
    },

    onSuccess: (result) => {
      invalidate();

      if (result.failureCount === 0) {
        toast.success(
          `Removed ${result.successCount} compan${result.successCount === 1 ? 'y' : 'ies'}.`,
        );
        return;
      }

      // The server says *why* a row was blocked — that beats a bare count.
      const reason = result.results.find((row) => row.message)?.message;
      toast(
        `Removed ${result.successCount}. ${result.failureCount} could not be removed${reason ? `: ${reason}` : '.'}`,
        { icon: '⚠️', duration: 7000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* ------------------------------ job postings ------------------------------- */

/**
 * `enabled` exists for the same reason it does on `useCompanies` — not every
 * placement reader may read drives. A HOD holds `application:read_all` and
 * `interview:read_all` without `job:read`, and a page that fires this for them
 * earns a 403 rather than degrading.
 */
export function useJobPostings(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.jobs(params),
    queryFn: () => apiGetPaginated<JobPosting>(`/jobs${buildQuery(params)}`),
  });
}

export function useJobPosting(id: string) {
  return useQuery({
    queryKey: placementKeys.job(id),
    queryFn: () => apiGet<JobPosting>(`/jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useJobProfile(id: string) {
  return useQuery({
    queryKey: placementKeys.jobProfile(id),
    queryFn: () => apiGet<JobProfile>(`/jobs/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useJobAnalytics(enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.jobAnalytics(),
    queryFn: () => apiGet<JobAnalytics>('/jobs/analytics'),
  });
}

/** Names other students, so it needs `application:read_all`. */
export function useEligibleStudents(jobId: string, enabled = true) {
  return useQuery({
    queryKey: placementKeys.eligibleStudents(jobId),
    queryFn: () => apiGet<EligibleStudent[]>(`/jobs/${jobId}/eligible-students`),
    enabled: Boolean(jobId) && enabled,
  });
}

export function useCreateJobPosting() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<JobPosting>('/jobs', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateJobPosting(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch<JobPosting>(`/jobs/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteJobPosting() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/jobs/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Job posting deleted.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkDeleteJobPostings() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.delete('/jobs/bulk', { data: { ids } });
      return response.data.data as {
        successCount: number;
        failureCount: number;
        results: Array<{ message?: string }>;
      };
    },

    onSuccess: (result) => {
      invalidate();

      if (result.failureCount === 0) {
        toast.success(`Deleted ${result.successCount} posting${result.successCount === 1 ? '' : 's'}.`);
        return;
      }

      // Only a draft with no applications can be deleted, so a partial result
      // is the norm here — the server's reason is more use than the count.
      const reason = result.results.find((row) => row.message)?.message;
      toast(
        `Deleted ${result.successCount}. ${result.failureCount} could not be deleted${reason ? `: ${reason}` : '.'}`,
        { icon: '⚠️', duration: 7000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

const JOB_TRANSITION_MESSAGES: Partial<Record<JobStatus, string>> = {
  draft: 'Posting withdrawn to draft.',
  published: 'Posting published. Eligible students have been notified.',
  closed: 'Applications closed.',
  completed: 'Drive marked complete.',
  cancelled: 'Drive cancelled.',
};

export function useTransitionJobPosting(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: ({ to, reason }: { to: JobStatus; reason?: string }) =>
      apiPost<JobPosting>(`/jobs/${id}/transition`, { to, reason }),

    onSuccess: (job) => {
      invalidate();
      toast.success(JOB_TRANSITION_MESSAGES[job.status] ?? 'Posting updated.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* ------------------------------- applications ------------------------------ */

export function useApplications(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: placementKeys.applications(params),
    queryFn: () => apiGetPaginated<JobApplication>(`/applications${buildQuery(params)}`),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: placementKeys.application(id),
    queryFn: () => apiGet<JobApplication>(`/applications/${id}`),
    enabled: Boolean(id),
  });
}

export function useApplicationAnalytics(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.applicationAnalytics(params),
    queryFn: () => apiGet<ApplicationAnalytics>(`/applications/analytics${buildQuery(params)}`),
  });
}

export function useShortlistApplication(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: { roundOrder: number; score?: number | null; feedback?: string | null }) =>
      apiPost<JobApplication>(`/applications/${id}/shortlist`, body),

    onSuccess: () => {
      invalidate();
      toast.success('Candidate shortlisted.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useAdvanceApplication(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: { to: ApplicationStatus; reason?: string; roundOrder?: number }) =>
      apiPost<JobApplication>(`/applications/${id}/advance`, body),

    onSuccess: () => {
      invalidate();
      toast.success('Application updated.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRejectApplication(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<JobApplication>(`/applications/${id}/reject`, { reason }),

    onSuccess: () => {
      invalidate();
      toast.success('Candidate rejected. They have been notified.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/** Selecting needs `placement:create`, unlike shortlisting and rejecting. */
export function useSelectApplication(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason?: string) =>
      apiPost<JobApplication>(`/applications/${id}/select`, { reason }),

    onSuccess: () => {
      invalidate();
      toast.success('Candidate selected. Record their offer next.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkApplicationAction(action: 'shortlist' | 'reject') {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: async (body: { ids: string[]; reason?: string }) => {
      const response = await apiPost<{
        successCount: number;
        failureCount: number;
        results: Array<{ message?: string }>;
      }>(`/applications/bulk/${action}`, body);

      return response;
    },

    onSuccess: (result) => {
      invalidate();

      if (result.failureCount === 0) {
        toast.success(`${result.successCount} application(s) updated.`);
        return;
      }

      const reason = result.results.find((row) => row.message)?.message;
      toast(
        `${result.successCount} updated. ${result.failureCount} could not be${reason ? `: ${reason}` : '.'}`,
        { icon: '⚠️', duration: 7000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* --------------------------- placements and offers ------------------------- */

export function usePlacements(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: placementKeys.placements(params),
    queryFn: () => apiGetPaginated<Placement>(`/placements${buildQuery(params)}`),
  });
}

export function usePlacement(id: string) {
  return useQuery({
    queryKey: placementKeys.placement(id),
    queryFn: () => apiGet<Placement>(`/placements/${id}`),
    enabled: Boolean(id),
  });
}

/** Needs `placement:report`, which is narrower than `placement:read_all`. */
export function usePlacementAnalytics(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: placementKeys.placementAnalytics(params),
    queryFn: () => apiGet<PlacementAnalytics>(`/placements/analytics${buildQuery(params)}`),
    enabled,
  });
}

export function useCreatePlacement() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Placement>('/placements', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdatePlacement(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch<Placement>(`/placements/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRevokeOffer(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) => apiPost<Placement>(`/placements/${id}/revoke`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Offer withdrawn. The student has been notified.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useMarkJoined(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (joiningDate?: string) =>
      apiPost<Placement>(`/placements/${id}/joined`, { joiningDate }),
    onSuccess: () => {
      invalidate();
      toast.success('Joining recorded.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useMarkNotJoined(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<Placement>(`/placements/${id}/not-joined`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Recorded as not joined.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useVerifyPlacement(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (isVerified: boolean) =>
      apiPost<Placement>(`/placements/${id}/verify`, { isVerified }),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* ------------------------------ self-service ------------------------------- */
/**
 * None of these take an id for the student: the server reads it from the
 * token, so the browser has nothing to substitute. A staff member calling them
 * gets a 403 rather than someone else's data.
 */

export function useMyOpenings() {
  return useQuery({
    queryKey: placementKeys.myOpenings(),
    queryFn: () => apiGet<StudentOpening[]>('/jobs/me/openings'),
  });
}

export function useMyEligibility(jobId: string) {
  return useQuery({
    queryKey: placementKeys.myEligibility(jobId),
    queryFn: () => apiGet<EligibilityResult>(`/jobs/me/eligibility/${jobId}`),
    enabled: Boolean(jobId),
  });
}

export function useMyApplications() {
  return useQuery({
    queryKey: placementKeys.myApplications(),
    queryFn: () => apiGet<JobApplication[]>('/applications/me'),
  });
}

export function useMyApplication(id: string) {
  return useQuery({
    queryKey: placementKeys.myApplication(id),
    queryFn: () => apiGet<JobApplication>(`/applications/me/${id}`),
    enabled: Boolean(id),
    // A 404 here means it is not the caller's application, which no amount of
    // retrying will change.
    retry: false,
  });
}

export function useApplyToJob(jobId: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: {
      coverLetter?: string | null;
      answers: Array<{ question: string; answer: string }>;
    }) => apiPost<JobApplication>(`/jobs/${jobId}/apply`, body),

    onSuccess: () => {
      invalidate();
      toast.success('Application submitted.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useWithdrawApplication(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<JobApplication>(`/applications/me/${id}/withdraw`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Application withdrawn.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/**
 * Declining the offer on the application itself.
 *
 * Distinct from `useDeclineOffer`, which answers a `Placement`. An application
 * can be `selected` before the office has recorded an offer, and this is the
 * only path in that window. The server keeps the two records in step whichever
 * end the student uses.
 */
export function useDeclineApplicationOffer(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<JobApplication>(`/applications/me/${id}/decline-offer`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Offer declined.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useMyOffers() {
  return useQuery({
    queryKey: placementKeys.myOffers(),
    queryFn: () => apiGet<Placement[]>('/placements/me'),
  });
}

export function useMyOffer(id: string) {
  return useQuery({
    queryKey: placementKeys.myOffer(id),
    queryFn: () => apiGet<Placement>(`/placements/me/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAcceptOffer(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: () => apiPost<Placement>(`/placements/me/${id}/accept`, {}),
    onSuccess: () => {
      invalidate();
      toast.success('Offer accepted.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeclineOffer(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<Placement>(`/placements/me/${id}/decline`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Offer declined.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* -------------------------------- interviews -------------------------------- */

export interface Interview {
  id: string;
  applicationId: Relation<{ id: string; status: ApplicationStatus; currentRound: number }>;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { firstName: string; lastName: string; email: string } | string;
  }>;
  jobPostingId: Relation<{ id: string; title: string; jobType: JobType; workMode: WorkMode }>;
  companyId: Relation<{ id: string; name: string; logoUrl: string | null; industry: string }>;

  roundOrder: number;
  roundName: string;
  type: string;
  mode: InterviewMode;

  scheduledAt: string;
  durationMinutes: number;
  venue: string | null;
  meetingLink: string | null;

  interviewers: Array<{ name: string; designation: string; email: string | null }>;
  panelNumber: string | null;
  instructions: string | null;

  status: InterviewStatus;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;

  result: {
    status: InterviewResultStatus;
    score: number | null;
    maxScore: number | null;
    feedback: string | null;
    strengths: string[];
    improvements: string[];
    recordedAt: string | null;
  };

  /** What the student asked for. A request, not a change. */
  rescheduleRequest: {
    reason: string;
    preferredSlots: string[];
    requestedAt: string;
  } | null;

  history: Array<{
    from: InterviewStatus | null;
    to: InterviewStatus;
    actedByRole: 'student' | 'staff';
    at: string;
    reason: string | null;
  }>;
}

export interface InterviewAnalytics {
  total: number;
  upcoming: number;
  scheduled: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  cleared: number;
  rejected: number;
  pendingResult: number;
  byStatus: Record<string, number>;
  byResult: Record<string, number>;
}

export interface BulkScheduleResult {
  scheduledCount: number;
  skippedCount: number;
  results: Array<{ applicationId: string; scheduled: boolean; message?: string }>;
}

/**
 * Recording a result never moves the application: `application:shortlist` and
 * `application:reject` are separate permissions. The server returns what it
 * would suggest, and the office acts on it through the application API.
 */
export interface InterviewResultResponse {
  interview: Interview;
  suggestedApplicationStatus: string | null;
}

export function useInterviews(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.interviews(params),
    queryFn: () => apiGetPaginated<Interview>(`/interviews${buildQuery(params)}`),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: placementKeys.interview(id),
    queryFn: () => apiGet<Interview>(`/interviews/${id}`),
    enabled: Boolean(id),
  });
}

/** Needs `interview:read_all`, which a student never holds. */
export function useInterviewAnalytics(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: placementKeys.interviewAnalytics(params),
    queryFn: () => apiGet<InterviewAnalytics>(`/interviews/analytics${buildQuery(params)}`),
  });
}

export function useScheduleInterview() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Interview>('/interviews', body),
    onSuccess: () => {
      invalidate();
      toast.success('Interview scheduled. The candidate has been notified.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkScheduleInterviews() {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<BulkScheduleResult>('/interviews/bulk/schedule', body),

    onSuccess: (result) => {
      invalidate();

      if (result.skippedCount === 0) {
        toast.success(`Scheduled ${result.scheduledCount} interview(s).`);
        return;
      }

      // The server says why each row was skipped, which beats a bare count.
      const reason = result.results.find((row) => !row.scheduled)?.message;
      toast(
        `Scheduled ${result.scheduledCount}. ${result.skippedCount} skipped${reason ? `: ${reason}` : '.'}`,
        { icon: '⚠️', duration: 7000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRescheduleInterview(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: { scheduledAt: string; reason: string }) =>
      apiPost<Interview>(`/interviews/${id}/reschedule`, body),
    onSuccess: () => {
      invalidate();
      toast.success('Interview moved. The candidate has been notified.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCancelInterview(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<Interview>(`/interviews/${id}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Interview cancelled. The candidate has been notified.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useTransitionInterview(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: ({ to, reason }: { to: InterviewStatus; reason?: string }) =>
      apiPost<Interview>(`/interviews/${id}/transition`, { to, reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Interview updated.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRecordInterviewResult(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<InterviewResultResponse>(`/interviews/${id}/result`, body),
    onSuccess: () => {
      invalidate();
      toast.success('Result recorded.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* --------------------------- interviews: self-service ------------------------ */
// No student parameter: the server reads identity from the token.

export function useMyInterviews() {
  return useQuery({
    queryKey: placementKeys.myInterviews(),
    queryFn: () => apiGet<Interview[]>('/interviews/me'),
  });
}

export function useMyInterview(id: string) {
  return useQuery({
    queryKey: placementKeys.myInterview(id),
    queryFn: () => apiGet<Interview>(`/interviews/me/${id}`),
    enabled: Boolean(id),
    // A 404 means it is not the caller's interview, which retrying cannot fix.
    retry: false,
  });
}

/** Answering needs `interview:respond`, which only students hold. */
export function useConfirmInterview(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: () => apiPost<Interview>(`/interviews/me/${id}/confirm`, {}),
    onSuccess: () => {
      invalidate();
      toast.success('Interview confirmed.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRequestReschedule(id: string) {
  const invalidate = useInvalidatePlacement();

  return useMutation({
    mutationFn: (body: { reason: string; preferredSlots: string[] }) =>
      apiPost<Interview>(`/interviews/me/${id}/request-reschedule`, body),
    onSuccess: () => {
      invalidate();
      toast.success('Request sent to the placement office.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

/* --------------------------------- exports --------------------------------- */

type ExportResource = 'companies' | 'jobs' | 'applications' | 'placements';

/**
 * Four exports share one shape, so one factory serves them rather than four
 * near-identical hooks. The server neutralises formula injection.
 */
function createPlacementExport(resource: ExportResource) {
  return function usePlacementExport() {
    return useMutation({
      mutationFn: async ({
        format,
        ids,
        filters = {},
      }: {
        format: ExportFormat;
        ids?: string[];
        filters?: Record<string, unknown>;
      }) => {
        const { page: _page, limit: _limit, ...exportable } = filters;

        const response = await apiClient.post(
          `/${resource}/bulk/export${buildQuery({ ...exportable, format })}`,
          { ids },
          { responseType: 'blob' },
        );

        const disposition = String(response.headers['content-disposition'] ?? '');
        const fileName =
          /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `${resource}.${format}`;

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

      onSuccess: (rows) => toast.success(`Exported ${rows} record${rows === 1 ? '' : 's'}.`),
      onError: (error: ApiError) => toast.error(error.message),
    });
  };
}

export const useExportCompanies = createPlacementExport('companies');
export const useExportJobPostings = createPlacementExport('jobs');
export const useExportApplications = createPlacementExport('applications');
export const useExportPlacements = createPlacementExport('placements');
