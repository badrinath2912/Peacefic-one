import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { apiGet, apiGetPaginated, type ApiError } from '@/lib/api-client';
import { buildQuery } from '@/lib/utils';

/**
 * Query keys are declared in one place so an invalidation after a mutation
 * cannot silently miss a cache entry because the key was retyped.
 */
export const queryKeys = {
  departments: (params?: Record<string, unknown>) => ['departments', params ?? {}] as const,
  department: (id: string) => ['departments', id] as const,
  departmentAnalytics: (id: string) => ['departments', id, 'analytics'] as const,

  batches: (params?: Record<string, unknown>) => ['batches', params ?? {}] as const,
  batch: (id: string) => ['batches', id] as const,
  batchStudents: (id: string, params?: Record<string, unknown>) =>
    ['batches', id, 'students', params ?? {}] as const,

  students: (params?: Record<string, unknown>) => ['students', params ?? {}] as const,
  student: (id: string) => ['students', id] as const,
  ownStudentProfile: () => ['students', 'me'] as const,

  faculty: (params?: Record<string, unknown>) => ['faculty', params ?? {}] as const,
  facultyMember: (id: string) => ['faculty', id] as const,
  facultyWorkload: (id: string) => ['faculty', id, 'workload'] as const,

  attendanceSessions: (params?: Record<string, unknown>) =>
    ['attendance', 'sessions', params ?? {}] as const,
  attendanceSheet: (id: string) => ['attendance', 'sessions', id, 'sheet'] as const,
  attendanceDefaulters: (params?: Record<string, unknown>) =>
    ['attendance', 'defaulters', params ?? {}] as const,
  attendanceTrend: (params?: Record<string, unknown>) =>
    ['attendance', 'trend', params ?? {}] as const,
  attendanceBatchReport: (batchId: string) => ['attendance', 'batch', batchId] as const,
  ownAttendance: (params?: Record<string, unknown>) => ['attendance', 'me', params ?? {}] as const,
} as const;

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  [key: string]: unknown;
}

type QueryConfig<T> = Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>;

/* ------------------------------- departments ------------------------------ */

export interface Department {
  id: string;
  name: string;
  code: string;
  status: string;
  description: string | null;
  hodId: string | { id: string; fullName: string; email: string } | null;
  establishedYear: number | null;
  stats: { totalStudents: number; totalFaculty: number; totalBatches: number };
  createdAt: string;
}

export function useDepartments(params: PaginatedQuery = {}, config?: QueryConfig<{ items: Department[]; pagination: import('@peacefic/shared').PaginationMeta }>) {
  return useQuery({
    queryKey: queryKeys.departments(params),
    queryFn: () => apiGetPaginated<Department>(`/departments${buildQuery(params)}`),
    ...config,
  });
}

/* --------------------------------- batches -------------------------------- */

export interface Batch {
  id: string;
  name: string;
  code: string;
  admissionYear: number;
  graduationYear: number;
  currentSemester: number;
  capacity: number;
  status: string;
  section: string | null;
  departmentId: string | { id: string; name: string; code: string };
  classAdvisorId: string | { id: string; fullName: string; email: string } | null;
  stats: { totalStudents: number };
  createdAt: string;
}

/**
 * `enabled` exists because not every caller may list batches — the endpoint is
 * gated on `batch:read`, and a page that fires this without it earns a 403
 * rather than degrading.
 */
export function useBatches(params: PaginatedQuery = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.batches(params),
    queryFn: () => apiGetPaginated<Batch>(`/batches${buildQuery(params)}`),
  });
}

export function useDepartment(id: string) {
  return useQuery({
    queryKey: queryKeys.department(id),
    queryFn: () => apiGet<Department>(`/departments/${id}?include=hodId`),
    enabled: Boolean(id),
  });
}

export interface DepartmentAnalytics {
  department: { id: string; name: string; code: string };
  totalStudents: number;
  totalBatches: number;
  totalFaculty: number;
  placedStudents: number;
  placementRate: number;
  averageCgpa: number | null;
}

export function useDepartmentAnalytics(id: string) {
  return useQuery({
    queryKey: queryKeys.departmentAnalytics(id),
    queryFn: () => apiGet<DepartmentAnalytics>(`/departments/${id}/analytics`),
    enabled: Boolean(id),
  });
}

export function useBatch(id: string) {
  return useQuery({
    queryKey: queryKeys.batch(id),
    queryFn: () => apiGet<Batch>(`/batches/${id}?include=departmentId,classAdvisorId`),
    enabled: Boolean(id),
  });
}

export interface BatchAnalytics {
  batch: { id: string; name: string; code: string; currentSemester: number };
  totalStudents: number;
  capacity: number;
  utilisation: number;
  placedStudents: number;
  placementRate: number;
  averageCgpa: number | null;
}

export function useBatchAnalytics(id: string) {
  return useQuery({
    queryKey: ['batches', id, 'analytics'],
    queryFn: () => apiGet<BatchAnalytics>(`/batches/${id}/analytics`),
    enabled: Boolean(id),
  });
}

export function useBatchStudents(id: string, params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: queryKeys.batchStudents(id, params),
    queryFn: () => apiGetPaginated<Student>(`/batches/${id}/students${buildQuery(params)}`),
    enabled: Boolean(id),
  });
}

/* -------------------------------- students -------------------------------- */

export interface Student {
  id: string;
  rollNumber: string;
  registerNumber: string | null;
  currentSemester: number;
  status: string;
  gender: string | null;
  userId: { id: string; firstName: string; lastName: string; fullName: string; email: string } | string;
  departmentId: { id: string; name: string; code: string } | string;
  batchId: { id: string; name: string; code: string } | string;
  academics: {
    tenthPercent: number | null;
    twelfthPercent: number | null;
    diplomaPercent: number | null;
    currentCgpa: number | null;
    activeBacklogs: number;
    totalBacklogs: number;
    yearGap: number;
  };
  placement: { isPlaced: boolean; isEligible: boolean; highestPackage: number | null };
}

export function useStudents(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: queryKeys.students(params),
    queryFn: () => apiGetPaginated<Student>(`/students${buildQuery(params)}`),
  });
}

export function useStudent(id: string, config?: QueryConfig<Student>) {
  return useQuery({
    queryKey: queryKeys.student(id),
    queryFn: () => apiGet<Student>(`/students/${id}`),
    enabled: Boolean(id),
    ...config,
  });
}

export interface StudentProfile {
  student: Student & {
    admissionNumber: string;
    registerNumber: string | null;
    photoUrl: string | null;
    alternatePhone: string | null;
    programme: string | null;
    section: string | null;
    dateOfBirth: string | null;
    bloodGroup: string | null;
    admissionDate: string;
    /** Only the last four digits ever exist client-side. */
    aadhaar: { last4: string } | null;
    guardian: { name: string; relation: string; phone: string; email: string | null } | null;
    address: {
      line1: string;
      line2: string | null;
      city: string;
      district: string | null;
      state: string;
      country: string;
      pincode: string;
    } | null;
  };
  account: {
    id: string;
    email: string;
    status: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
    mustChangePassword: boolean;
  } | null;
  attendance: {
    threshold: number;
    percentage: number;
    totalSessions: number;
    attendedSessions: number;
    absentCount: number;
    isBelowThreshold: boolean;
  };
  placement: {
    isEligible: boolean;
    eligibilityNote: string | null;
    isPlaced: boolean;
    placementCount: number;
    highestPackage: number | null;
  };
  documents: Array<{ type: string; label: string; url: string; updatedAt: string | null }>;
  activity: Array<{
    id: string;
    action: string;
    category: string;
    severity: string;
    actor: string | null;
    outcome: string;
    changes: Array<{ field: string; from: unknown; to: unknown }> | null;
    at: string;
  }>;
}

export function useStudentProfile(id: string) {
  return useQuery({
    queryKey: ['students', id, 'profile'],
    queryFn: () => apiGet<StudentProfile>(`/students/${id}/profile`),
    enabled: Boolean(id),
  });
}

/**
 * What `GET /students/me` actually returns.
 *
 * The endpoint serialises the whole student document, so it carries the
 * self-service fields that `Student` — shaped for the college list, where they
 * are not selected — does not declare. Extending rather than widening `Student`
 * keeps the college pages' narrower view intact.
 */
export interface OwnStudentProfile extends Student {
  userId:
    | { id: string; firstName: string; lastName: string; fullName: string; email: string; phone: string | null }
    | string;
  admissionNumber: string;
  photoUrl: string | null;
  programme: string | null;
  section: string | null;
  admissionDate: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    district: string | null;
    state: string;
    country: string;
    pincode: string;
  } | null;
  guardian: { name: string; relation: string; phone: string; email: string | null } | null;
  /** `verified` and `verifiedVia` are set by the institution, never by the student. */
  skills: Array<{ name: string; level: string; verified: boolean; verifiedVia: string | null }>;
  portfolioLinks: {
    github: string | null;
    linkedin: string | null;
    portfolio: string | null;
    other: string[];
  };
}

/**
 * `enabled` gates the request on `student:read_own` at the call site, so a
 * caller without it never issues the call rather than issuing it and handling
 * the 403.
 */
export function useOwnStudentProfile(enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.ownStudentProfile(),
    queryFn: () => apiGet<OwnStudentProfile>('/students/me'),
  });
}

/* --------------------------------- faculty -------------------------------- */

export interface FacultyMember {
  id: string;
  employeeId: string;
  designation: string;
  type: string;
  employmentType: string;
  status: string;
  experienceYears: number;
  photoUrl?: string | null;
  alternatePhone?: string | null;
  userId:
    | { id: string; firstName: string; lastName: string; fullName: string; email: string; phone: string | null }
    | string;
  departmentId: { id: string; name: string; code: string } | string;
  assignedBatchIds: string[];
}

export function useFaculty(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: queryKeys.faculty(params),
    queryFn: () => apiGetPaginated<FacultyMember>(`/faculty${buildQuery(params)}`),
  });
}

export function useFacultyMember(id: string) {
  return useQuery({
    queryKey: queryKeys.facultyMember(id),
    queryFn: () => apiGet<FacultyMember>(`/faculty/${id}`),
    enabled: Boolean(id),
  });
}

export interface FacultyProfile {
  faculty: FacultyMember & {
    photoUrl: string | null;
    alternatePhone: string | null;
    joiningDate: string;
    qualifications: Array<{
      degree: string;
      specialization: string;
      institution: string;
      year: number;
    }>;
    specializations: string[];
    address: {
      line1: string;
      line2: string | null;
      city: string;
      district: string | null;
      state: string;
      country: string;
      pincode: string;
    } | null;
    emergencyContact: { name: string; relation: string; phone: string } | null;
  };
  account: {
    id: string;
    email: string;
    phone: string | null;
    status: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
  } | null;
  workload: {
    batchCount: number;
    studentCount: number;
    batches: Array<{ id: string; name: string; code: string; students: number }>;
  };
  compliance: {
    facultyId: string;
    totalSessions: number;
    markedSessions: number;
    pendingSessions: number;
    complianceRate: number;
  };
  /** Departments this member heads — shown because it blocks deletion. */
  headsOf: Array<{ id: string; name: string; code: string }>;
  activity: Array<{
    id: string;
    action: string;
    category: string;
    severity: string;
    actor: string | null;
    outcome: string;
    changes: Array<{ field: string; from: unknown; to: unknown }> | null;
    at: string;
  }>;
}

export function useFacultyProfile(id: string) {
  return useQuery({
    queryKey: ['faculty', id, 'profile'],
    queryFn: () => apiGet<FacultyProfile>(`/faculty/${id}/profile`),
    enabled: Boolean(id),
  });
}

/* --------------------------------- courses -------------------------------- */

export interface Course {
  id: string;
  title: string;
  code: string;
  description: string;
  category: string;
  level: string;
  durationHours: number;
  credits: number | null;
  semester: number | null;
  status: string;
  publishedAt: string | null;
  tags: string[];
  learningOutcomes: string[];
  thumbnailUrl: string | null;
  instructorIds: Array<string | { id: string; employeeId: string; designation: string }>;
  departmentIds: Array<string | { id: string; name: string; code: string }>;
  batchIds: Array<string | { id: string; name: string; code: string }>;
  prerequisites: Array<string | { id: string; title: string; code: string }>;
  stats: {
    moduleCount: number;
    materialCount: number;
    enrolledCount: number;
    completedCount: number;
    averageRating: number | null;
    ratingCount: number;
  };
  createdAt: string;
}

export function useCourses(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: ['courses', params],
    queryFn: () => apiGetPaginated<Course>(`/courses${buildQuery(params)}`),
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: ['courses', id],
    queryFn: () => apiGet<Course>(`/courses/${id}`),
    enabled: Boolean(id),
  });
}

export interface CourseProfile {
  course: Course;
  instructors: Array<{ id: string; employeeId: string; designation: string; name: string }>;
  /** Courses that list this one as a prerequisite — these block deletion. */
  dependents: Array<{ id: string; title: string; code: string }>;
}

export function useCourseProfile(id: string) {
  return useQuery({
    queryKey: ['courses', id, 'profile'],
    queryFn: () => apiGet<CourseProfile>(`/courses/${id}/profile`),
    enabled: Boolean(id),
  });
}

export interface CourseAnalytics {
  total: number;
  published: number;
  draft: number;
  byCategory: Array<{ category: string; count: number }>;
}

export function useCourseAnalytics(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['courses', 'analytics'],
    queryFn: () => apiGet<CourseAnalytics>('/courses/analytics'),
  });
}

/* ------------------------------- attendance ------------------------------- */

export interface AttendanceSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  topic: string | null;
  status: string;
  isLocked: boolean;
  batchId: { id: string; name: string; code: string } | string;
  stats: {
    totalStudents: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    percentage: number;
  };
}

export function useAttendanceSessions(params: PaginatedQuery = {}) {
  return useQuery({
    queryKey: queryKeys.attendanceSessions(params),
    queryFn: () => apiGetPaginated<AttendanceSession>(`/attendance/sessions${buildQuery(params)}`),
  });
}

export interface AttendanceSheet {
  session: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    type: string;
    topic: string | null;
    status: string;
    isLocked: boolean;
    stats: AttendanceSession['stats'];
  };
  roster: Array<{
    studentId: string;
    rollNumber: string;
    status: string | null;
    remarks: string | null;
    recordId: string | null;
  }>;
}

export function useAttendanceSheet(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.attendanceSheet(sessionId),
    queryFn: () => apiGet<AttendanceSheet>(`/attendance/sessions/${sessionId}/sheet`),
    enabled: Boolean(sessionId),
    // Always refetched: another member may have marked it since it was listed.
    staleTime: 0,
  });
}

export interface DefaulterReport {
  threshold: number;
  count: number;
  students: Array<{
    studentId: string;
    rollNumber: string;
    batchId: string;
    percentage: number;
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    sessionsNeededForThreshold: number;
  }>;
}

export function useAttendanceDefaulters(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.attendanceDefaulters(params),
    queryFn: () => apiGet<DefaulterReport>(`/attendance/reports/defaulters${buildQuery(params)}`),
  });
}

export interface TrendPoint {
  date: string;
  percentage: number;
  present: number;
  total: number;
}

export function useAttendanceTrend(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.attendanceTrend(params),
    queryFn: () => apiGet<TrendPoint[]>(`/attendance/reports/trend${buildQuery(params)}`),
  });
}

export interface OwnAttendance {
  studentId: string;
  rollNumber: string;
  threshold: number;
  percentage: number;
  isBelowThreshold: boolean;
  counts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    onDuty: number;
    total: number;
  };
  sessionsNeededForThreshold: number;
  sessions: Array<{
    id: string;
    sessionId: string;
    date: string;
    status: string;
    remarks: string | null;
    wasModified: boolean;
  }>;
}

/**
 * The student's own attendance. The server derives the student from the token,
 * so `params` carries a date range and nothing else — there is no student id to
 * send, and none may be added.
 *
 * `enabled` gates the request on `attendance:read_own` at the call site, so a
 * caller without it never issues the call rather than issuing it and handling
 * the 403.
 */
export function useOwnAttendance(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.ownAttendance(params),
    queryFn: () => apiGet<OwnAttendance>(`/attendance/me${buildQuery(params)}`),
  });
}
