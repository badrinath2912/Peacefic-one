import { z } from 'zod';

import {
  APPLICATION_STATUS,
  COMPANY_STATUS,
  COMPANY_TYPE,
  INTERVIEW_MODE,
  INTERVIEW_RESULT_STATUS,
  INTERVIEW_STATUS,
  JOB_STATUS,
  JOB_TYPE,
  PLACEMENT_STATUS,
  SELECTION_ROUND_TYPE,
  WORK_MODE,
} from '../constants/enums';

import {
  academicYearSchema,
  attachmentSchema,
  booleanQuery,
  emailSchema,
  objectIdSchema,
  paginationQuerySchema,
  percentageSchema,
  phoneSchema,
} from './common.schema';

/* ---------------------------------- Company --------------------------------- */

export const companyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  designation: z.string().trim().max(120),
  email: emailSchema,
  phone: phoneSchema,
  isPrimary: z.boolean().default(false),
});
export type CompanyContactInput = z.infer<typeof companyContactSchema>;

export const createCompanySchema = z
  .object({
    name: z.string().trim().min(2, 'Company name is required').max(200),
    /** The registered entity, where it differs from the trading name. */
    legalName: z.string().trim().max(240).nullable().optional(),
    logoUrl: z.string().url().nullable().optional(),
    logoKey: z.string().trim().max(500).nullable().optional(),
    website: z.string().url().nullable().optional(),
    industry: z.string().trim().min(2, 'Industry is required').max(120),
    companyType: z.enum(COMPANY_TYPE),
    sizeRange: z.string().trim().max(40).nullable().optional(),
    headquarters: z.string().trim().max(160).nullable().optional(),
    /** Where the company actually recruits into, if not the headquarters. */
    locations: z.array(z.string().trim().max(120)).max(30).default([]),
    description: z.string().trim().max(5000).nullable().optional(),
    /** Switchboard details, distinct from any individual recruiter. */
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    contacts: z.array(companyContactSchema).max(10).default([]),
  })
  .superRefine((data, ctx) => {
    // Two primaries means nobody knows who to call first.
    const primaries = data.contacts.filter((contact) => contact.isPrimary);

    if (primaries.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contacts'],
        message: 'Only one contact can be the primary',
      });
    }
  });
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

/**
 * `.partial()` is unavailable on an effects schema, so the shape is restated.
 * Verification and blacklisting are deliberately absent — each is its own
 * audited action, not a field an update can quietly flip.
 */
export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  legalName: z.string().trim().max(240).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  logoKey: z.string().trim().max(500).nullable().optional(),
  website: z.string().url().nullable().optional(),
  industry: z.string().trim().min(2).max(120).optional(),
  companyType: z.enum(COMPANY_TYPE).optional(),
  sizeRange: z.string().trim().max(40).nullable().optional(),
  headquarters: z.string().trim().max(160).nullable().optional(),
  locations: z.array(z.string().trim().max(120)).max(30).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  contacts: z.array(companyContactSchema).max(10).optional(),
  status: z.enum(COMPANY_STATUS).optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const verifyCompanySchema = z.object({
  isVerified: z.boolean(),
  note: z.string().trim().max(500).optional(),
});
export type VerifyCompanyInput = z.infer<typeof verifyCompanySchema>;

export const companyExportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  industry: z.string().trim().max(120).optional(),
  companyType: z.enum(COMPANY_TYPE).optional(),
  status: z.enum(COMPANY_STATUS).optional(),
  isVerified: booleanQuery.optional(),
  search: z.string().trim().max(120).optional(),
});

export const companyListQuerySchema = paginationQuerySchema.extend({
  industry: z.string().trim().max(120).optional(),
  companyType: z.enum(COMPANY_TYPE).optional(),
  status: z.enum(COMPANY_STATUS).optional(),
  isVerified: booleanQuery.optional(),
});

export const blacklistCompanySchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

/* --------------------------------- Job posting ------------------------------- */

export const compensationSchema = z
  .object({
    currency: z.string().trim().length(3).default('INR'),
    ctcMin: z.number().int().min(0),
    ctcMax: z.number().int().min(0),
    fixedComponent: z.number().int().min(0).nullable().optional(),
    variableComponent: z.number().int().min(0).nullable().optional(),
    stipendPerMonth: z.number().int().min(0).nullable().optional(),
    bondMonths: z.number().int().min(0).max(120).nullable().optional(),
    bondAmount: z.number().int().min(0).nullable().optional(),
  })
  .refine((d) => d.ctcMax >= d.ctcMin, {
    message: 'Maximum CTC must be at least the minimum',
    path: ['ctcMax'],
  });

/**
 * Every criterion is opt-in: an empty array or a null means "do not filter on
 * this". A job with an empty eligibility block is open to the whole college,
 * which is the sane default for an open drive.
 */
export const eligibilitySchema = z.object({
  departmentIds: z.array(objectIdSchema).max(50).default([]),
  /** Narrower than departments — a specific section or cohort. */
  batchIds: z.array(objectIdSchema).max(100).default([]),
  graduationYears: z.array(z.number().int().min(1980).max(2100)).max(10).default([]),
  minCgpa: z.number().min(0).max(10).nullable().optional(),
  maxActiveBacklogs: z.number().int().min(0).max(50).nullable().optional(),
  maxTotalBacklogs: z.number().int().min(0).max(50).nullable().optional(),
  minTenthPercent: percentageSchema.nullable().optional(),
  minTwelfthPercent: percentageSchema.nullable().optional(),
  minDiplomaPercent: percentageSchema.nullable().optional(),
  minAttendancePercent: percentageSchema.nullable().optional(),
  maxYearGap: z.number().int().min(0).max(20).nullable().optional(),
  genderRestriction: z.enum(['any', 'female_only']).default('any'),
  requiredSkills: z.array(z.string().trim().max(60)).max(30).default([]),
  /** Free-text degrees the company accepts, matched against the student's. */
  qualifications: z.array(z.string().trim().max(120)).max(20).default([]),
  allowPlacedStudents: z.boolean().default(false),
  /**
   * Narrative conditions no rule can express ("must hold a valid passport").
   * Shown to the student; never evaluated, because the engine must not guess.
   */
  customCriteria: z.string().trim().max(2000).nullable().optional(),
});
export type EligibilityInput = z.infer<typeof eligibilitySchema>;

/** One failed criterion, in the shape the API returns. */
export const eligibilityReasonSchema = z.object({
  rule: z.string(),
  message: z.string(),
});
export type EligibilityReason = z.infer<typeof eligibilityReasonSchema>;

export const eligibilityResultSchema = z.object({
  eligible: z.boolean(),
  reasons: z.array(eligibilityReasonSchema),
});
export type EligibilityResult = z.infer<typeof eligibilityResultSchema>;

export const selectionRoundSchema = z.object({
  order: z.number().int().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  type: z.enum(SELECTION_ROUND_TYPE),
  mode: z.enum(['online', 'offline']).default('online'),
  durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const createJobPostingSchema = z
  .object({
    companyId: objectIdSchema,
    title: z.string().trim().min(3, 'Job title is required').max(200),
    description: z.string().trim().min(20, 'Description is required').max(20000),
    jobType: z.enum(JOB_TYPE),
    workMode: z.enum(WORK_MODE).default('onsite'),
    locations: z.array(z.string().trim().max(120)).min(1, 'Add at least one location').max(20),
    openings: z.number().int().min(1).max(10000),
    compensation: compensationSchema,
    eligibility: eligibilitySchema,
    selectionRounds: z.array(selectionRoundSchema).min(1, 'Add at least one round').max(20),
    applicationOpenAt: z.coerce.date(),
    applicationCloseAt: z.coerce.date(),
    driveDate: z.coerce.date().nullable().optional(),
    attachments: z.array(attachmentSchema).max(10).default([]),
    status: z.enum(JOB_STATUS).default('draft'),
  })
  .refine((d) => d.applicationCloseAt > d.applicationOpenAt, {
    message: 'Applications must close after they open',
    path: ['applicationCloseAt'],
  })
  .refine(
    (d) => {
      const orders = d.selectionRounds.map((r) => r.order).sort((a, b) => a - b);
      return orders.every((o, i) => o === i + 1);
    },
    { message: 'Round numbers must run 1, 2, 3 … without gaps', path: ['selectionRounds'] },
  );
export type CreateJobPostingInput = z.infer<typeof createJobPostingSchema>;

export const updateJobPostingSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(20).max(20000).optional(),
  jobType: z.enum(JOB_TYPE).optional(),
  workMode: z.enum(WORK_MODE).optional(),
  locations: z.array(z.string().trim().max(120)).min(1).max(20).optional(),
  openings: z.number().int().min(1).max(10000).optional(),
  compensation: compensationSchema.optional(),
  eligibility: eligibilitySchema.optional(),
  selectionRounds: z.array(selectionRoundSchema).min(1).max(20).optional(),
  applicationOpenAt: z.coerce.date().optional(),
  applicationCloseAt: z.coerce.date().optional(),
  driveDate: z.coerce.date().nullable().optional(),
  status: z.enum(JOB_STATUS).optional(),
});
export type UpdateJobPostingInput = z.infer<typeof updateJobPostingSchema>;

export const jobListQuerySchema = paginationQuerySchema.extend({
  companyId: objectIdSchema.optional(),
  jobType: z.enum(JOB_TYPE).optional(),
  workMode: z.enum(WORK_MODE).optional(),
  status: z.enum(JOB_STATUS).optional(),
  eligibleOnly: booleanQuery.optional(),
});

export const closeJobSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/* -------------------------------- Application -------------------------------- */

export const applyToJobSchema = z.object({
  coverLetter: z.string().trim().max(5000).nullable().optional(),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(5000),
      }),
    )
    .max(20)
    .default([]),
});
export type ApplyToJobInput = z.infer<typeof applyToJobSchema>;

export const applicationListQuerySchema = paginationQuerySchema.extend({
  jobPostingId: objectIdSchema.optional(),
  companyId: objectIdSchema.optional(),
  studentId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  status: z.enum(APPLICATION_STATUS).optional(),
  round: z.coerce.number().int().min(0).max(20).optional(),
});

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(1000),
});

export const advanceApplicationSchema = z.object({
  roundOrder: z.number().int().min(1).max(20),
  score: z.number().min(0).max(1000).nullable().optional(),
  feedback: z.string().trim().max(2000).nullable().optional(),
});
export type AdvanceApplicationInput = z.infer<typeof advanceApplicationSchema>;

export const bulkApplicationActionSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
  reason: z.string().trim().max(1000).optional(),
});

export const withdrawApplicationSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

/* --------------------------------- Interview --------------------------------- */

export const scheduleInterviewSchema = z.object({
  applicationId: objectIdSchema,
  roundOrder: z.number().int().min(1).max(20),
  roundName: z.string().trim().min(2).max(120),
  type: z.enum(SELECTION_ROUND_TYPE),
  mode: z.enum(INTERVIEW_MODE).default('online'),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(600).default(45),
  venue: z.string().trim().max(300).nullable().optional(),
  meetingLink: z.string().url().nullable().optional(),
  interviewers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        designation: z.string().trim().max(120),
        email: emailSchema.nullable().optional(),
      }),
    )
    .max(10)
    .default([]),
  panelNumber: z.string().trim().max(40).nullable().optional(),
  instructions: z.string().trim().max(2000).nullable().optional(),
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const bulkScheduleInterviewSchema = z.object({
  jobPostingId: objectIdSchema,
  applicationIds: z.array(objectIdSchema).min(1).max(500),
  roundOrder: z.number().int().min(1).max(20),
  roundName: z.string().trim().min(2).max(120),
  type: z.enum(SELECTION_ROUND_TYPE),
  mode: z.enum(INTERVIEW_MODE).default('online'),
  startAt: z.coerce.date(),
  slotDurationMinutes: z.number().int().min(5).max(240).default(30),
  slotsPerPanel: z.number().int().min(1).max(100).default(10),
  panels: z.number().int().min(1).max(20).default(1),
  venue: z.string().trim().max(300).nullable().optional(),
  meetingLink: z.string().url().nullable().optional(),
});
export type BulkScheduleInterviewInput = z.infer<typeof bulkScheduleInterviewSchema>;

export const rescheduleInterviewSchema = z.object({
  scheduledAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(500),
});

export const recordInterviewResultSchema = z.object({
  status: z.enum(INTERVIEW_RESULT_STATUS),
  score: z.number().min(0).max(1000).nullable().optional(),
  maxScore: z.number().min(0).max(1000).nullable().optional(),
  feedback: z.string().trim().max(5000).nullable().optional(),
  strengths: z.array(z.string().trim().max(200)).max(20).default([]),
  improvements: z.array(z.string().trim().max(200)).max(20).default([]),
});
export type RecordInterviewResultInput = z.infer<typeof recordInterviewResultSchema>;

export const interviewListQuerySchema = paginationQuerySchema.extend({
  jobPostingId: objectIdSchema.optional(),
  studentId: objectIdSchema.optional(),
  companyId: objectIdSchema.optional(),
  status: z.enum(INTERVIEW_STATUS).optional(),
  mode: z.enum(INTERVIEW_MODE).optional(),
});

export const requestRescheduleSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  preferredSlots: z.array(z.coerce.date()).max(5).default([]),
});

/* --------------------------------- Placement --------------------------------- */

export const createPlacementSchema = z.object({
  studentId: objectIdSchema,
  applicationId: objectIdSchema,
  jobPostingId: objectIdSchema,
  companyId: objectIdSchema,
  offerDate: z.coerce.date(),
  joiningDate: z.coerce.date().nullable().optional(),
  designation: z.string().trim().min(2).max(160),
  location: z.string().trim().min(1).max(160),
  jobType: z.enum(['full_time', 'internship', 'internship_ppo']),
  package: z.object({
    currency: z.string().trim().length(3).default('INR'),
    ctc: z.number().int().min(0),
    fixed: z.number().int().min(0).nullable().optional(),
    variable: z.number().int().min(0).nullable().optional(),
    stipendPerMonth: z.number().int().min(0).nullable().optional(),
    bondMonths: z.number().int().min(0).max(120).nullable().optional(),
  }),
  isPrimaryOffer: z.boolean().default(true),
  academicYear: academicYearSchema,
  status: z.enum(PLACEMENT_STATUS).default('offered'),
});
export type CreatePlacementInput = z.infer<typeof createPlacementSchema>;

export const updatePlacementSchema = z.object({
  joiningDate: z.coerce.date().nullable().optional(),
  designation: z.string().trim().min(2).max(160).optional(),
  location: z.string().trim().min(1).max(160).optional(),
  isPrimaryOffer: z.boolean().optional(),
  status: z.enum(PLACEMENT_STATUS).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const placementListQuerySchema = paginationQuerySchema.extend({
  studentId: objectIdSchema.optional(),
  companyId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  academicYear: academicYearSchema.optional(),
  status: z.enum(PLACEMENT_STATUS).optional(),
  jobType: z.enum(['full_time', 'internship', 'internship_ppo']).optional(),
});

export const placementReportQuerySchema = z.object({
  academicYear: academicYearSchema.optional(),
  departmentId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PlacementReportQuery = z.infer<typeof placementReportQuerySchema>;
