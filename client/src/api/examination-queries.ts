'use client';

import type { ExamLifecycle } from '@peacefic/shared';
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

/* ---------------------------------- types --------------------------------- */

/** A relation is either an id or the populated document, depending on `include`. */
export type Relation<T> = string | T;

export interface GradeBand {
  letter: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number;
  isPass: boolean;
  description: string | null;
}

export interface GradePolicy {
  passingPercent: number;
  maxGraceMarks: number;
  maxGracePerSemester: number;
  attendanceBonusEnabled: boolean;
  attendanceBonusThreshold: number;
  attendanceBonusMarks: number;
  repeatPolicy: 'best_attempt' | 'latest_attempt' | 'first_pass';
  countFailedCredits: boolean;
  gpaDecimalPlaces: number;
}

export interface GradeScale {
  id: string;
  name: string;
  code: string;
  description: string | null;
  bands: GradeBand[];
  policy: GradePolicy;
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Exam {
  id: string;
  title: string;
  code: string;
  examType: string;
  courseId: Relation<{ id: string; title: string; code: string; credits: number }>;
  departmentId: Relation<{ id: string; name: string; code: string }>;
  batchIds: Array<Relation<{ id: string; name: string; code: string }>>;
  semester: number;
  academicYear: string;
  maxMarks: { theory: number; practical: number; internal: number };
  totalMarks: number;
  credits: number;
  gradeScaleId: Relation<{ id: string; name: string; code: string }> | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  venue: string | null;
  instructions: string | null;
  status: ExamLifecycle;
  trainingSessionId: string | null;
  resultsPublishedAt: string | null;
  currentResultVersion: number;
  publications: ResultPublication[];
  stats: {
    registeredCount: number;
    appearedCount: number;
    absentCount: number;
    passCount: number;
    failCount: number;
    averagePercent: number;
    highestPercent: number;
  };
  createdAt: string;
}

export interface ResultPublication {
  version: number;
  action: 'published' | 'unpublished' | 'recalculated';
  actedBy: string | null;
  actedAt: string;
  reason: string | null;
  studentCount: number;
  passCount: number;
  failCount: number;
  withheldCount: number;
  averagePercent: number;
}

export interface ExamProfile {
  exam: Exam;
  gradeScale: GradeScale | null;
  paper: ExamPaper | null;
  counts: {
    registered: number;
    present: number;
    absent: number;
    debarred: number;
    malpractice: number;
    marksEntered: number;
  };
  results: {
    passCount: number;
    failCount: number;
    averagePercent: number;
    highestPercent: number;
    currentVersion: number;
    publishedAt: string | null;
  };
  /** The server's own view of the state machine — never recomputed here. */
  allowedTransitions: ExamLifecycle[];
}

export interface ExamPaperSection {
  name: string;
  instructions: string | null;
  questionCount: number;
  marksPerQuestion: number;
  isOptional: boolean;
}

export interface ExamPaper {
  id: string;
  examId: string;
  revision: number;
  title: string;
  totalMarks: number;
  sections: ExamPaperSection[];
  instructions: string | null;
  attachment: { url: string; fileName: string } | null;
  isReleased: boolean;
  releasedAt: string | null;
  createdAt: string;
}

export interface ExamRegistration {
  id: string;
  examId: string;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { id: string; firstName: string; lastName: string; email: string } | string;
  }>;
  batchId: Relation<{ id: string; name: string; code: string }>;
  hallTicketNumber: string;
  seatNumber: string | null;
  status: 'registered' | 'approved' | 'blocked' | 'withdrawn';
  attempt: number;
  statusReason: string | null;
  registeredAt: string;
}

export interface HallTicket {
  id: string;
  hallTicketNumber: string;
  seatNumber: string | null;
  rollNumber: string;
  batch: string;
  attempt: number;
  status: string;
}

export interface ExamAttendanceRecord {
  id: string;
  examId: string;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { firstName: string; lastName: string } | string;
  }>;
  status: 'present' | 'absent' | 'debarred' | 'malpractice';
  remarks: string | null;
  markedAt: string;
}

export interface MarksEntry {
  id: string;
  examId: string;
  studentId: Relation<{
    id: string;
    rollNumber: string;
    userId: { firstName: string; lastName: string } | string;
  }>;
  courseId: Relation<{ id: string; title: string; code: string }>;
  semester: number;
  credits: number;
  attempt: number;
  theory: number | null;
  practical: number | null;
  internal: number | null;
  rawTotal: number;
  attendanceBonus: number;
  graceMarks: number;
  finalTotal: number;
  maxTotal: number;
  percentage: number;
  letter: string;
  gradePoint: number;
  isPass: boolean;
  isAbsent: boolean;
  isRepeat: boolean;
  isWithheld: boolean;
  status: 'draft' | 'submitted' | 'verified' | 'locked';
  remarks: string | null;
  publishedVersion: number | null;
  history: Array<{
    version: number;
    theory: number | null;
    practical: number | null;
    internal: number | null;
    graceMarks: number;
    finalTotal: number;
    percentage: number;
    letter: string;
    changedAt: string;
    reason: string;
  }>;
}

export interface TranscriptSubject {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  semester: number;
  credits: number;
  letter: string;
  gradePoint: number;
  percentage: number;
  isPass: boolean;
  attempt: number;
  examId: string;
}

export interface TranscriptSemester {
  semester: number;
  creditsAttempted: number;
  creditsEarned: number;
  gpa: number;
  subjectCount: number;
  failedCount: number;
}

export interface Transcript {
  id: string;
  studentId: string;
  revision: number;
  isCurrent: boolean;
  upToSemester: number;
  cgpa: number;
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  activeBacklogs: number;
  totalBacklogs: number;
  semesters: TranscriptSemester[];
  subjects: TranscriptSubject[];
  generatedAt: string;
}

export interface StudentResults {
  results: MarksEntry[];
  summary: {
    cgpa: number;
    totalCreditsEarned: number;
    totalCreditsAttempted: number;
    activeBacklogs: number;
    semesters: TranscriptSemester[];
  };
}

/**
 * One of the student's own results.
 *
 * Deliberately narrower than `MarksEntry`: the server strips correction
 * history, examiner remarks, workflow status and the ids of whoever entered or
 * verified the mark before it leaves. Those are the examination office's
 * record, so they are absent from this type as well as from the payload.
 */
export interface OwnResult {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  courseCode: string | null;
  courseTitle: string | null;
  semester: number;
  credits: number;
  attempt: number;
  isRepeat: boolean;
  theory: number | null;
  practical: number | null;
  internal: number | null;
  rawTotal: number;
  attendanceBonus: number;
  graceMarks: number;
  finalTotal: number;
  maxTotal: number;
  percentage: number;
  letter: string;
  gradePoint: number;
  isPass: boolean;
  isAbsent: boolean;
}

/** A result held back from a release — identity only, never the mark. */
export interface WithheldResult {
  examId: string;
  examTitle: string;
  examCode: string;
  courseCode: string | null;
  courseTitle: string | null;
  semester: number;
  credits: number;
  attempt: number;
}

export interface OwnResults {
  results: OwnResult[];
  withheld: WithheldResult[];
  summary: {
    cgpa: number;
    totalCreditsEarned: number;
    totalCreditsAttempted: number;
    activeBacklogs: number;
    totalBacklogs: number;
    semesters: TranscriptSemester[];
  };
}

export interface ExaminationAnalytics {
  total: number;
  byStatus: Record<string, number>;
  upcoming: number;
  awaitingMarks: number;
  published: number;
  passRate: number;
  averagePercent: number;
}

/* -------------------------------- query keys ------------------------------- */

export const examKeys = {
  all: ['examinations'] as const,
  exams: (params?: Record<string, unknown>) => ['examinations', 'list', params ?? {}] as const,
  exam: (id: string) => ['examinations', 'exam', id] as const,
  profile: (id: string) => ['examinations', 'exam', id, 'profile'] as const,
  papers: (id: string) => ['examinations', 'exam', id, 'papers'] as const,
  registrations: (id: string, params?: Record<string, unknown>) =>
    ['examinations', 'exam', id, 'registrations', params ?? {}] as const,
  hallTickets: (id: string) => ['examinations', 'exam', id, 'hall-tickets'] as const,
  attendance: (id: string) => ['examinations', 'exam', id, 'attendance'] as const,
  marks: (id: string, params?: Record<string, unknown>) =>
    ['examinations', 'exam', id, 'marks', params ?? {}] as const,
  publications: (id: string) => ['examinations', 'exam', id, 'results', 'history'] as const,
  analytics: () => ['examinations', 'analytics'] as const,
  gradeScales: (params?: Record<string, unknown>) =>
    ['examinations', 'grade-scales', params ?? {}] as const,
  gradeScale: (id: string) => ['examinations', 'grade-scales', id] as const,
  transcript: (studentId: string) => ['examinations', 'transcripts', studentId] as const,
  transcriptVersions: (studentId: string) =>
    ['examinations', 'transcripts', studentId, 'versions'] as const,
  studentResults: (studentId: string) => ['examinations', 'results', studentId] as const,

  // Self-service. No id in the key because the server derives it from the
  // token — there is only ever one caller's data in this cache entry.
  ownResults: () => ['examinations', 'me', 'results'] as const,
  ownTranscript: () => ['examinations', 'me', 'transcript'] as const,
};

/* --------------------------------- queries -------------------------------- */

export function useExams(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: examKeys.exams(params),
    queryFn: () => apiGetPaginated<Exam>(`/examinations${buildQuery(params)}`),
  });
}

export function useExam(id: string) {
  return useQuery({
    queryKey: examKeys.exam(id),
    queryFn: () => apiGet<Exam>(`/examinations/${id}`),
    enabled: Boolean(id),
  });
}

export function useExamProfile(id: string) {
  return useQuery({
    queryKey: examKeys.profile(id),
    queryFn: () => apiGet<ExamProfile>(`/examinations/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useExaminationAnalytics(enabled = true) {
  return useQuery({
    enabled,
    queryKey: examKeys.analytics(),
    queryFn: () => apiGet<ExaminationAnalytics>('/examinations/analytics'),
  });
}

export function useExamPapers(examId: string) {
  return useQuery({
    queryKey: examKeys.papers(examId),
    queryFn: () => apiGet<ExamPaper[]>(`/examinations/${examId}/papers`),
    enabled: Boolean(examId),
  });
}

export function useExamRegistrations(examId: string, params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: examKeys.registrations(examId, params),
    queryFn: () =>
      apiGetPaginated<ExamRegistration>(`/examinations/${examId}/registrations${buildQuery(params)}`),
    enabled: Boolean(examId),
  });
}

export function useHallTickets(examId: string, enabled = true) {
  return useQuery({
    queryKey: examKeys.hallTickets(examId),
    queryFn: () => apiGet<HallTicket[]>(`/examinations/${examId}/hall-tickets`),
    enabled: Boolean(examId) && enabled,
    // A 422 here means the exam is not published yet, which is a legitimate
    // state rather than a fault — retrying would not change the answer.
    retry: false,
  });
}

export function useExamAttendance(examId: string) {
  return useQuery({
    queryKey: examKeys.attendance(examId),
    queryFn: () => apiGet<ExamAttendanceRecord[]>(`/examinations/${examId}/attendance`),
    enabled: Boolean(examId),
  });
}

export function useExamMarks(examId: string, params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: examKeys.marks(examId, params),
    queryFn: () => apiGetPaginated<MarksEntry>(`/examinations/${examId}/marks${buildQuery(params)}`),
    enabled: Boolean(examId),
  });
}

export function usePublicationHistory(examId: string) {
  return useQuery({
    queryKey: examKeys.publications(examId),
    queryFn: () => apiGet<ResultPublication[]>(`/examinations/${examId}/results/history`),
    enabled: Boolean(examId),
  });
}

export function useGradeScales(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: examKeys.gradeScales(params),
    queryFn: () => apiGetPaginated<GradeScale>(`/examinations/grade-scales${buildQuery(params)}`),
  });
}

export function useGradeScale(id: string) {
  return useQuery({
    queryKey: examKeys.gradeScale(id),
    queryFn: () => apiGet<GradeScale>(`/examinations/grade-scales/${id}`),
    enabled: Boolean(id),
  });
}

export function useTranscript(studentId: string) {
  return useQuery({
    queryKey: examKeys.transcript(studentId),
    queryFn: () => apiGet<Transcript>(`/examinations/transcripts/${studentId}`),
    enabled: Boolean(studentId),
    // A student with no transcript yet answers 404. That is an empty state,
    // not an error worth three retries.
    retry: false,
  });
}

export function useTranscriptVersions(studentId: string) {
  return useQuery({
    queryKey: examKeys.transcriptVersions(studentId),
    queryFn: () => apiGet<Transcript[]>(`/examinations/transcripts/${studentId}/versions`),
    enabled: Boolean(studentId),
  });
}

export function useStudentResults(studentId: string) {
  return useQuery({
    queryKey: examKeys.studentResults(studentId),
    queryFn: () => apiGet<StudentResults>(`/examinations/results/students/${studentId}`),
    enabled: Boolean(studentId),
  });
}

/* ------------------------------ self-service ------------------------------- */

/**
 * The signed-in student's own results.
 *
 * There is no id to pass: the server reads the caller's student record from the
 * token, so the browser has nothing to substitute. A staff member calling this
 * gets a 403 rather than someone else's marks.
 */
export function useOwnResults() {
  return useQuery({
    queryKey: examKeys.ownResults(),
    queryFn: () => apiGet<OwnResults>('/examinations/me/results'),
  });
}

/** The signed-in student's current transcript, or null if none was issued. */
export function useOwnTranscript() {
  return useQuery({
    queryKey: examKeys.ownTranscript(),
    queryFn: () => apiGet<Transcript | null>('/examinations/me/transcript'),
  });
}

/* -------------------------------- mutations -------------------------------- */

/**
 * Every examination write can move counts on the dashboard, the profile and the
 * list, so one invalidation covers the whole tree rather than each caller
 * guessing which keys went stale.
 */
function useInvalidateExaminations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: examKeys.all });
  };
}

export function useCreateExam() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Exam>('/examinations', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateExam(id: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch<Exam>(`/examinations/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteExam() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/examinations/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Exam deleted.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

const TRANSITION_MESSAGES: Partial<Record<ExamLifecycle, string>> = {
  draft: 'Exam returned to draft.',
  scheduled: 'Exam scheduled.',
  published: 'Exam published. Candidates have been notified.',
  completed: 'Exam marked complete.',
  marks_entered: 'Marks entry closed.',
  archived: 'Exam archived.',
};

export function useTransitionExam(id: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: ({ to, reason }: { to: ExamLifecycle; reason?: string }) =>
      apiPost<Exam>(`/examinations/${id}/transition`, { to, reason }),

    onSuccess: (exam) => {
      invalidate();
      toast.success(TRANSITION_MESSAGES[exam.status] ?? 'Exam updated.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCreateExamPaper(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<ExamPaper>(`/examinations/${examId}/papers`, body),

    onSuccess: (paper) => {
      invalidate();
      toast.success(`Revision ${paper.revision} saved.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRegisterStudents(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: { studentIds: string[]; batchIds: string[] }) =>
      apiPost<{ registered: number; skipped: number; total: number }>(
        `/examinations/${examId}/registrations`,
        body,
      ),

    onSuccess: (result) => {
      invalidate();
      // Skipped students were already registered — saying so stops the count
      // reading as a failure.
      const skipped = result.skipped > 0 ? ` ${result.skipped} already registered.` : '';
      toast.success(`Registered ${result.registered} student(s).${skipped}`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateRegistration() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: ({
      registrationId,
      status,
      reason,
    }: {
      registrationId: string;
      status: ExamRegistration['status'];
      reason?: string;
    }) =>
      apiPatch<ExamRegistration>(`/examinations/registrations/${registrationId}`, {
        status,
        reason,
      }),

    onSuccess: (registration) => {
      invalidate();
      toast.success(`${registration.hallTicketNumber} is now ${registration.status}.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useMarkExamAttendance(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: {
      entries: Array<{ studentId: string; status: string; remarks?: string | null }>;
    }) => apiPost<{ marked: number; skipped: number }>(`/examinations/${examId}/attendance`, body),

    onSuccess: (result) => {
      invalidate();
      toast.success(`Attendance recorded for ${result.marked} candidate(s).`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useEnterMarks(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: {
      entries: Array<{
        studentId: string;
        theory?: number | null;
        practical?: number | null;
        internal?: number | null;
        graceMarks?: number;
        remarks?: string | null;
      }>;
      submit: boolean;
    }) =>
      apiPost<{ saved: number; skipped: number; status: string }>(
        `/examinations/${examId}/marks`,
        body,
      ),

    onSuccess: (result, variables) => {
      invalidate();

      // A skipped row is one already verified or locked; it needs a correction
      // rather than an overwrite, so the count alone would be misleading.
      const skipped =
        result.skipped > 0
          ? ` ${result.skipped} already verified — use Correct to change those.`
          : '';

      toast.success(
        `${variables.submit ? 'Submitted' : 'Saved'} ${result.saved} entr${result.saved === 1 ? 'y' : 'ies'}.${skipped}`,
        { duration: result.skipped > 0 ? 7000 : 4000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useVerifyMarks(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (studentIds?: string[]) =>
      apiPost<{ verified: number }>(`/examinations/${examId}/marks/verify`, { studentIds }),

    onSuccess: (result) => {
      invalidate();
      toast.success(`Verified ${result.verified} mark(s).`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCorrectMark(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: {
      studentId: string;
      theory?: number | null;
      practical?: number | null;
      internal?: number | null;
      graceMarks: number;
      remarks?: string | null;
      reason: string;
    }) => apiPost<MarksEntry>(`/examinations/${examId}/marks/correct`, body),

    onSuccess: (entry) => {
      invalidate();
      toast.success(`Corrected to ${entry.letter} (${entry.percentage}%). Awaiting verification.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function usePublishResults(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: { reason?: string; withholdStudentIds: string[] }) =>
      apiPost<{ exam: Exam; publication: ResultPublication }>(
        `/examinations/${examId}/results/publish`,
        body,
      ),

    onSuccess: ({ publication }) => {
      invalidate();
      const withheld =
        publication.withheldCount > 0 ? ` ${publication.withheldCount} withheld.` : '';
      toast.success(
        `Published to ${publication.studentCount} student(s).${withheld}`,
        { duration: 6000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUnpublishResults(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<Exam>(`/examinations/${examId}/results/unpublish`, { reason }),

    onSuccess: () => {
      invalidate();
      toast.success('Results withdrawn. Every candidate has been notified.');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRecalculateResults(examId: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (reason: string) =>
      apiPost<{ recalculated: number; changed: number; version: number }>(
        `/examinations/${examId}/results/recalculate`,
        { reason },
      ),

    onSuccess: (result) => {
      invalidate();

      // "0 changed" is the useful answer when a scale edit turned out to be a
      // no-op, so it is reported rather than dressed up as success.
      toast.success(
        result.changed === 0
          ? `Recalculated ${result.recalculated} entr${result.recalculated === 1 ? 'y' : 'ies'} — no grade changed.`
          : `Recalculated ${result.recalculated}. ${result.changed} grade(s) changed.`,
        { duration: 6000 },
      );
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCreateGradeScale() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<GradeScale>('/examinations/grade-scales', body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateGradeScale(id: string) {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch<GradeScale>(`/examinations/grade-scales/${id}`, body),
    onSuccess: invalidate,
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteGradeScale() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string }>(`/examinations/grade-scales/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Grade scale deleted.');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useGenerateTranscript() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: (body: { studentId: string; upToSemester?: number | null }) =>
      apiPost<Transcript>('/examinations/transcripts', body),

    onSuccess: (transcript) => {
      invalidate();
      toast.success(`Revision ${transcript.revision} generated. CGPA ${transcript.cgpa}.`);
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useBulkDeleteExams() {
  const invalidate = useInvalidateExaminations();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.delete('/examinations/bulk', { data: { ids } });
      return response.data.data as {
        successCount: number;
        failureCount: number;
        results: Array<{ message?: string }>;
      };
    },

    onSuccess: (result) => {
      invalidate();

      if (result.failureCount === 0) {
        toast.success(`Removed ${result.successCount} exam${result.successCount === 1 ? '' : 's'}.`);
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

export function useExportExams() {
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
        `/examinations/bulk/export${buildQuery({ ...exportable, format })}`,
        { ids },
        { responseType: 'blob' },
      );

      const disposition = String(response.headers['content-disposition'] ?? '');
      const fileName = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? 'exams.csv';

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
}
