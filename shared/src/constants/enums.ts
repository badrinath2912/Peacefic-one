export const USER_STATUS = [
  'pending_verification',
  'pending_approval',
  'active',
  'suspended',
  'archived',
] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const COLLEGE_STATUS = ['pending', 'active', 'suspended', 'rejected'] as const;
export type CollegeStatus = (typeof COLLEGE_STATUS)[number];

export const COLLEGE_TYPE = [
  'engineering',
  'arts_science',
  'management',
  'polytechnic',
  'other',
] as const;
export type CollegeType = (typeof COLLEGE_TYPE)[number];

export const GRADING_SCALE = ['percentage', 'gpa_10', 'gpa_4'] as const;
export type GradingScale = (typeof GRADING_SCALE)[number];

export const DEPARTMENT_STATUS = ['active', 'inactive'] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUS)[number];

export const BATCH_STATUS = ['active', 'completed', 'archived'] as const;
export type BatchStatus = (typeof BATCH_STATUS)[number];

export const STUDENT_STATUS = [
  'active',
  'on_leave',
  'graduated',
  'dropped',
  'suspended',
] as const;
export type StudentStatus = (typeof STUDENT_STATUS)[number];

export const GENDER = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export type Gender = (typeof GENDER)[number];

export const SKILL_LEVEL = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVEL)[number];

export const FACULTY_STATUS = ['active', 'on_leave', 'resigned', 'retired'] as const;
export type FacultyStatus = (typeof FACULTY_STATUS)[number];

export const FACULTY_TYPE = ['faculty', 'trainer'] as const;
export type FacultyType = (typeof FACULTY_TYPE)[number];

export const EMPLOYMENT_TYPE = ['permanent', 'contract', 'visiting', 'guest'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE)[number];

export const COURSE_CATEGORY = [
  'technical',
  'aptitude',
  'soft_skills',
  'domain',
  'certification',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORY)[number];

export const COURSE_LEVEL = ['beginner', 'intermediate', 'advanced'] as const;
export type CourseLevel = (typeof COURSE_LEVEL)[number];

export const CONTENT_STATUS = ['draft', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const MATERIAL_TYPE = [
  'video',
  'pdf',
  'document',
  'link',
  'slides',
  'code',
  'quiz',
] as const;
export type MaterialType = (typeof MATERIAL_TYPE)[number];

export const ENROLLMENT_STATUS = [
  'enrolled',
  'in_progress',
  'completed',
  'dropped',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number];

export const LIVE_CLASS_STATUS = ['scheduled', 'live', 'completed', 'cancelled'] as const;
export type LiveClassStatus = (typeof LIVE_CLASS_STATUS)[number];

export const MEETING_PROVIDER = ['zoom', 'google_meet', 'jitsi', 'bigbluebutton'] as const;
export type MeetingProviderKey = (typeof MEETING_PROVIDER)[number];

export const ASSIGNMENT_STATUS = ['draft', 'published', 'closed'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];

export const SUBMISSION_TYPE = ['file', 'text', 'link', 'code'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPE)[number];

export const SUBMISSION_STATUS = [
  'submitted',
  'graded',
  'returned',
  'resubmit_requested',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUS)[number];

export const EXAM_KIND = ['practice', 'assessment', 'examination'] as const;
export type ExamKind = (typeof EXAM_KIND)[number];

/** The kinds of formal examination a college schedules and grades. */
export const EXAM_TYPE = ['internal', 'midterm', 'semester', 'practical', 'online'] as const;
export type ExamType = (typeof EXAM_TYPE)[number];

/**
 * The examination lifecycle. Every transition is checked server-side; the
 * order matters because marks cannot be entered before an exam is held, and
 * results cannot be published before marks exist.
 */
export const EXAM_LIFECYCLE = [
  'draft',
  'scheduled',
  'published',
  'completed',
  'marks_entered',
  'results_published',
  'archived',
] as const;
export type ExamLifecycle = (typeof EXAM_LIFECYCLE)[number];

export const EXAM_REGISTRATION_STATUS = [
  'registered',
  'approved',
  'blocked',
  'withdrawn',
] as const;
export type ExamRegistrationStatus = (typeof EXAM_REGISTRATION_STATUS)[number];

export const EXAM_ATTENDANCE_STATUS = [
  'present',
  'absent',
  'debarred',
  'malpractice',
] as const;
export type ExamAttendanceStatus = (typeof EXAM_ATTENDANCE_STATUS)[number];

export const MARKS_ENTRY_STATUS = ['draft', 'submitted', 'verified', 'locked'] as const;
export type MarksEntryStatus = (typeof MARKS_ENTRY_STATUS)[number];

/**
 * How a repeated attempt counts toward the GPA. `best` is the common Indian
 * convention; `latest` suits colleges where a resit supersedes outright.
 */
export const REPEAT_POLICY = ['best_attempt', 'latest_attempt', 'first_pass'] as const;
export type RepeatPolicy = (typeof REPEAT_POLICY)[number];

export const EXAM_CATEGORY = [
  'aptitude',
  'technical',
  'coding',
  'domain',
  'soft_skills',
] as const;
export type ExamCategory = (typeof EXAM_CATEGORY)[number];

export const EXAM_STATUS = ['draft', 'published', 'closed', 'archived'] as const;
export type ExamStatus = (typeof EXAM_STATUS)[number];

export const QUESTION_TYPE = [
  'mcq_single',
  'mcq_multiple',
  'true_false',
  'short_answer',
  'long_answer',
  'coding',
  'numeric',
] as const;
export type QuestionType = (typeof QUESTION_TYPE)[number];

export const DIFFICULTY = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTY)[number];

export const ATTEMPT_STATUS = [
  'in_progress',
  'submitted',
  'auto_submitted',
  'grading',
  'graded',
  'abandoned',
  'invalidated',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS)[number];

export const ATTENDANCE_STATUS = [
  'present',
  'absent',
  'late',
  'excused',
  'on_duty',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const ATTENDANCE_SESSION_STATUS = [
  'scheduled',
  'pending_marking',
  'marked',
  'locked',
  'cancelled',
] as const;
export type AttendanceSessionStatus = (typeof ATTENDANCE_SESSION_STATUS)[number];

export const ATTENDANCE_SESSION_TYPE = [
  'lecture',
  'lab',
  'tutorial',
  'live_class',
  'training',
  'workshop',
  'seminar',
  'exam',
] as const;
export type AttendanceSessionType = (typeof ATTENDANCE_SESSION_TYPE)[number];

/**
 * What an attendance session belongs to, as opposed to what kind of teaching
 * it is (`ATTENDANCE_SESSION_TYPE`). The two are different axes: a `training`
 * context can hold a `lecture` or a `lab`.
 *
 * `contextId` points at the owning record — a batch timetable for `class`, a
 * `TrainingSession` for `training`. One model, one set of marking rules.
 */
export const ATTENDANCE_CONTEXT = ['class', 'training', 'workshop', 'seminar'] as const;
export type AttendanceContext = (typeof ATTENDANCE_CONTEXT)[number];

export const ATTENDANCE_SOURCE = ['manual', 'live_class', 'biometric', 'import'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCE)[number];

export const RESULT_TYPE = [
  'internal',
  'semester',
  'supplementary',
  'course',
] as const;
export type ResultType = (typeof RESULT_TYPE)[number];

export const RESULT_STATUS = ['draft', 'published', 'withheld', 'revoked'] as const;
export type ResultStatus = (typeof RESULT_STATUS)[number];

export const CERTIFICATE_TYPE = [
  'course_completion',
  'training',
  'achievement',
  'participation',
  'internship',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPE)[number];

export const CERTIFICATE_STATUS = ['issued', 'revoked', 'expired'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUS)[number];

export const COMPANY_TYPE = [
  'product',
  'service',
  'startup',
  'mnc',
  'psu',
  'government',
] as const;
export type CompanyType = (typeof COMPANY_TYPE)[number];

export const COMPANY_STATUS = ['active', 'blacklisted', 'inactive'] as const;
export type CompanyStatus = (typeof COMPANY_STATUS)[number];

export const JOB_TYPE = [
  'full_time',
  'internship',
  'internship_ppo',
  'part_time',
  'contract',
] as const;
export type JobType = (typeof JOB_TYPE)[number];

export const WORK_MODE = ['onsite', 'remote', 'hybrid'] as const;
export type WorkMode = (typeof WORK_MODE)[number];

export const JOB_STATUS = [
  'draft',
  'published',
  'closed',
  'cancelled',
  'completed',
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const SELECTION_ROUND_TYPE = [
  'aptitude',
  'technical_test',
  'coding',
  'group_discussion',
  'technical_interview',
  'hr_interview',
  'managerial',
  'other',
] as const;
export type SelectionRoundType = (typeof SELECTION_ROUND_TYPE)[number];

export const APPLICATION_STATUS = [
  'applied',
  'under_review',
  'shortlisted',
  'in_process',
  'selected',
  'rejected',
  'withdrawn',
  'offer_declined',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

export const INTERVIEW_MODE = ['online', 'offline', 'telephonic'] as const;
export type InterviewMode = (typeof INTERVIEW_MODE)[number];

export const INTERVIEW_STATUS = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUS)[number];

export const INTERVIEW_RESULT_STATUS = [
  'pending',
  'cleared',
  'rejected',
  'on_hold',
  'no_show',
] as const;
export type InterviewResultStatus = (typeof INTERVIEW_RESULT_STATUS)[number];

export const PLACEMENT_STATUS = [
  'offered',
  'accepted',
  'declined',
  'joined',
  'offer_revoked',
  'not_joined',
] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUS)[number];

export const TRAINING_TYPE = [
  'technical',
  'aptitude',
  'soft_skills',
  'placement_prep',
  'certification',
  'workshop',
] as const;
export type TrainingType = (typeof TRAINING_TYPE)[number];

export const TRAINING_STATUS = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type TrainingStatus = (typeof TRAINING_STATUS)[number];

export const APPROVAL_STATUS = [
  'pending',
  'approved',
  'rejected',
  'more_info_required',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITY)[number];

export const NOTIFICATION_PRIORITY = ['low', 'normal', 'high', 'urgent'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITY)[number];

export const NOTIFICATION_CATEGORY = [
  'academic',
  'placement',
  'attendance',
  'system',
  'announcement',
  'support',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[number];

export const TICKET_CATEGORY = [
  'technical',
  'academic',
  'placement',
  'account',
  'billing',
  'feature_request',
  'other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORY)[number];

export const TICKET_STATUS = [
  'open',
  'in_progress',
  'awaiting_response',
  'resolved',
  'closed',
  'reopened',
] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];

export const AUDIT_CATEGORY = ['auth', 'data', 'admin', 'security', 'system'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORY)[number];

export const AUDIT_SEVERITY = ['info', 'warning', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITY)[number];

export const STORAGE_DRIVER = ['local', 's3', 'cloudinary'] as const;
export type StorageDriverKey = (typeof STORAGE_DRIVER)[number];

export const FILE_PURPOSE = [
  'avatar',
  'college_logo',
  'resume',
  'certificate',
  'assignment',
  'submission',
  'learning_material',
  'ticket_attachment',
  'offer_letter',
  'company_logo',
  'company_document',
  'import',
  'other',
] as const;
export type FilePurpose = (typeof FILE_PURPOSE)[number];

export const OTP_PURPOSE = [
  'email_verification',
  'phone_verification',
  'password_reset',
  'login_mfa',
  'sensitive_action',
] as const;
export type OtpPurpose = (typeof OTP_PURPOSE)[number];

export const THEME = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEME)[number];
