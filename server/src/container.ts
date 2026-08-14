import { ActivityLogRepository } from '@/repositories/activity-log.repository';
import {
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AttendanceSummaryRepository,
} from '@/repositories/attendance.repository';
import { BatchRepository } from '@/repositories/batch.repository';
import { CollegeRepository } from '@/repositories/college.repository';
import { CourseRepository } from '@/repositories/course.repository';
import { DepartmentRepository } from '@/repositories/department.repository';
import {
  ExamAttendanceRepository,
  ExamPaperRepository,
  ExamRegistrationRepository,
  ExamRepository,
  GradeScaleRepository,
  MarksEntryRepository,
  TranscriptRepository,
} from '@/repositories/examination.repository';
import { FacultyRepository } from '@/repositories/faculty.repository';
import { NotificationRepository } from '@/repositories/notification.repository';
import { OtpRepository } from '@/repositories/otp.repository';
import {
  CompanyRepository,
  InterviewRepository,
  JobApplicationRepository,
  JobPostingRepository,
  PlacementRepository,
} from '@/repositories/placement.repository';
import { RoleRepository } from '@/repositories/role.repository';
import { SessionRepository } from '@/repositories/session.repository';
import { StudentRegistrationRepository } from '@/repositories/student-registration.repository';
import { StudentRepository } from '@/repositories/student.repository';
import {
  TrainingEnrollmentRepository,
  TrainingRequestRepository,
  TrainingSessionRepository,
} from '@/repositories/training.repository';
import { UserRepository } from '@/repositories/user.repository';
import { AttendanceService } from '@/services/attendance.service';
import { AuditService } from '@/services/audit.service';
import { AuthService } from '@/services/auth.service';
import { BatchService } from '@/services/batch.service';
import { CompanyService } from '@/services/company.service';
import { CourseService } from '@/services/course.service';
import { DepartmentService } from '@/services/department.service';
import { EligibilityService } from '@/services/eligibility.service';
import { EmailService } from '@/services/email.service';
import { ExaminationService } from '@/services/examination.service';
import { ExportService } from '@/services/export.service';
import { FacultyService } from '@/services/faculty.service';
import { InterviewService } from '@/services/interview.service';
import { JobApplicationService } from '@/services/job-application.service';
import { JobPostingService } from '@/services/job-posting.service';
import { NotificationService } from '@/services/notification.service';
import { PlacementService } from '@/services/placement.service';
import { ResultService } from '@/services/result.service';
import { ScopeGuard } from '@/services/scope-guard.service';
import { StorageService } from '@/services/storage/storage.service';
import { StudentService } from '@/services/student.service';
import { TokenService } from '@/services/token.service';
import { TrainingService } from '@/services/training.service';

/**
 * Hand-written composition root. The graph is shallow enough that this is
 * clearer than a DI framework with decorators and metadata reflection.
 */

// Repositories
export const activityLogRepository = new ActivityLogRepository();
export const attendanceRecordRepository = new AttendanceRecordRepository();
export const attendanceSessionRepository = new AttendanceSessionRepository();
export const attendanceSummaryRepository = new AttendanceSummaryRepository();
export const batchRepository = new BatchRepository();
export const collegeRepository = new CollegeRepository();
export const courseRepository = new CourseRepository();
export const departmentRepository = new DepartmentRepository();
export const examRepository = new ExamRepository();
export const examPaperRepository = new ExamPaperRepository();
export const examRegistrationRepository = new ExamRegistrationRepository();
export const examAttendanceRepository = new ExamAttendanceRepository();
export const gradeScaleRepository = new GradeScaleRepository();
export const marksEntryRepository = new MarksEntryRepository();
export const transcriptRepository = new TranscriptRepository();
export const facultyRepository = new FacultyRepository();
export const notificationRepository = new NotificationRepository();
export const companyRepository = new CompanyRepository();
export const jobPostingRepository = new JobPostingRepository();
export const jobApplicationRepository = new JobApplicationRepository();
export const placementRepository = new PlacementRepository();
export const interviewRepository = new InterviewRepository();
export const otpRepository = new OtpRepository();
export const roleRepository = new RoleRepository();
export const sessionRepository = new SessionRepository();
export const studentRepository = new StudentRepository();
export const studentRegistrationRepository = new StudentRegistrationRepository();
export const trainingRequestRepository = new TrainingRequestRepository();
export const trainingSessionRepository = new TrainingSessionRepository();
export const trainingEnrollmentRepository = new TrainingEnrollmentRepository();
export const userRepository = new UserRepository();

// Services
export const emailService = new EmailService();
export const exportService = new ExportService();
export const storageService = new StorageService();
export const auditService = new AuditService(activityLogRepository);
export const tokenService = new TokenService(sessionRepository);

export const notificationService = new NotificationService(
  notificationRepository,
  userRepository,
  emailService,
);

export const scopeGuard = new ScopeGuard(
  facultyRepository,
  studentRepository,
  batchRepository,
  departmentRepository,
);

export const authService = new AuthService(
  userRepository,
  roleRepository,
  collegeRepository,
  studentRepository,
  facultyRepository,
  departmentRepository,
  batchRepository,
  otpRepository,
  tokenService,
  auditService,
  emailService,
  studentRegistrationRepository,
);

export const departmentService = new DepartmentService(
  departmentRepository,
  batchRepository,
  studentRepository,
  facultyRepository,
  userRepository,
  roleRepository,
  collegeRepository,
  scopeGuard,
  auditService,
);

export const batchService = new BatchService(
  batchRepository,
  departmentRepository,
  studentRepository,
  facultyRepository,
  collegeRepository,
  scopeGuard,
  auditService,
);

export const studentService = new StudentService(
  studentRepository,
  userRepository,
  batchRepository,
  departmentRepository,
  collegeRepository,
  roleRepository,
  attendanceSummaryRepository,
  activityLogRepository,
  scopeGuard,
  auditService,
  authService,
  emailService,
  studentRegistrationRepository,
);

export const attendanceService = new AttendanceService(
  attendanceSessionRepository,
  attendanceRecordRepository,
  attendanceSummaryRepository,
  studentRepository,
  batchRepository,
  facultyRepository,
  collegeRepository,
  scopeGuard,
  auditService,
  notificationService,
);

export const courseService = new CourseService(
  courseRepository,
  departmentRepository,
  batchRepository,
  facultyRepository,
  scopeGuard,
  auditService,
);

export const facultyService = new FacultyService(
  facultyRepository,
  userRepository,
  departmentRepository,
  batchRepository,
  collegeRepository,
  roleRepository,
  attendanceSessionRepository,
  activityLogRepository,
  scopeGuard,
  auditService,
  authService,
  emailService,
);

export const examinationService = new ExaminationService(
  examRepository,
  gradeScaleRepository,
  examPaperRepository,
  examRegistrationRepository,
  examAttendanceRepository,
  marksEntryRepository,
  courseRepository,
  departmentRepository,
  batchRepository,
  studentRepository,
  trainingSessionRepository,
  scopeGuard,
  auditService,
  notificationService,
);

/**
 * Depends on the examination service for the grading context so both halves of
 * the module grade against the same resolved scale. The dependency is one-way.
 */
export const resultService = new ResultService(
  marksEntryRepository,
  examRepository,
  examRegistrationRepository,
  examAttendanceRepository,
  transcriptRepository,
  attendanceSummaryRepository,
  studentRepository,
  courseRepository,
  trainingEnrollmentRepository,
  examinationService,
  scopeGuard,
  auditService,
  notificationService,
);

/**
 * Reads the CGPA, backlog and attendance figures the Examination and
 * Attendance modules already maintain. It recomputes none of them.
 */
export const eligibilityService = new EligibilityService(
  studentRepository,
  batchRepository,
  attendanceSummaryRepository,
);

export const companyService = new CompanyService(
  companyRepository,
  jobPostingRepository,
  storageService,
  auditService,
);

export const jobPostingService = new JobPostingService(
  jobPostingRepository,
  companyRepository,
  departmentRepository,
  batchRepository,
  studentRepository,
  companyService,
  eligibilityService,
  scopeGuard,
  auditService,
  notificationService,
);

export const jobApplicationService = new JobApplicationService(
  jobApplicationRepository,
  jobPostingRepository,
  companyRepository,
  placementRepository,
  studentRepository,
  jobPostingService,
  eligibilityService,
  scopeGuard,
  auditService,
  notificationService,
);

/**
 * Reads the application it was raised from and writes the student's placement
 * figures the eligibility engine and reports already consume.
 */
export const placementService = new PlacementService(
  placementRepository,
  jobApplicationRepository,
  jobPostingRepository,
  companyRepository,
  studentRepository,
  scopeGuard,
  auditService,
  notificationService,
);

export const interviewService = new InterviewService(
  interviewRepository,
  jobApplicationRepository,
  jobPostingRepository,
  studentRepository,
  scopeGuard,
  auditService,
  notificationService,
);

export const trainingService = new TrainingService(
  trainingRequestRepository,
  trainingSessionRepository,
  trainingEnrollmentRepository,
  departmentRepository,
  batchRepository,
  facultyRepository,
  studentRepository,
  scopeGuard,
  auditService,
  notificationService,
);
