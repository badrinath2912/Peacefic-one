import { z } from 'zod';

import {
  EXAM_ATTENDANCE_STATUS,
  EXAM_LIFECYCLE,
  EXAM_REGISTRATION_STATUS,
  EXAM_TYPE,
  MARKS_ENTRY_STATUS,
  REPEAT_POLICY,
} from '../constants/enums';

import {
  academicYearSchema,
  attachmentSchema,
  codeSchema,
  objectIdSchema,
  paginationQuerySchema,
  percentageSchema,
} from './common.schema';

/* ------------------------------- grade scale ------------------------------- */

export const gradeBandSchema = z.object({
  letter: z.string().trim().min(1, 'Grade letter is required').max(4),
  /** Inclusive lower bound as a percentage of the maximum marks. */
  minPercent: percentageSchema,
  maxPercent: percentageSchema,
  gradePoint: z.number().min(0).max(10),
  isPass: z.boolean(),
  description: z.string().trim().max(80).nullable().optional(),
});
export type GradeBandInput = z.infer<typeof gradeBandSchema>;

export const gradePolicySchema = z.object({
  passingPercent: percentageSchema.default(40),
  /** Most a single subject may be lifted by grace, in marks. */
  maxGraceMarks: z.number().min(0).max(50).default(0),
  /** Total grace a student may receive across one semester. */
  maxGracePerSemester: z.number().min(0).max(100).default(0),
  attendanceBonusEnabled: z.boolean().default(false),
  attendanceBonusThreshold: percentageSchema.default(90),
  attendanceBonusMarks: z.number().min(0).max(10).default(0),
  repeatPolicy: z.enum(REPEAT_POLICY).default('best_attempt'),
  /** Whether a failed subject still contributes its credits to the GPA divisor. */
  countFailedCredits: z.boolean().default(true),
  gpaDecimalPlaces: z.number().int().min(0).max(4).default(2),
});
export type GradePolicyInput = z.infer<typeof gradePolicySchema>;

export const createGradeScaleSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    code: codeSchema,
    description: z.string().trim().max(500).nullable().optional(),
    bands: z.array(gradeBandSchema).min(2, 'A scale needs at least two bands').max(20),
    policy: gradePolicySchema,
    isDefault: z.boolean().default(false),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .superRefine((data, ctx) => {
    const sorted = [...data.bands].sort((a, b) => a.minPercent - b.minPercent);

    for (const [index, band] of sorted.entries()) {
      if (band.maxPercent < band.minPercent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bands', index, 'maxPercent'],
          message: `"${band.letter}" has a maximum below its minimum`,
        });
      }

      const next = sorted[index + 1];
      if (!next) continue;

      // Overlapping bands make the grade for a mark ambiguous.
      if (next.minPercent <= band.maxPercent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bands', index, 'maxPercent'],
          message: `"${band.letter}" overlaps "${next.letter}"`,
        });
      }
    }

    // A gap would leave some marks ungradeable.
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    if (lowest && lowest.minPercent > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bands'],
        message: 'The lowest band must start at 0%',
      });
    }

    if (highest && highest.maxPercent < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bands'],
        message: 'The highest band must reach 100%',
      });
    }

    if (!data.bands.some((band) => band.isPass)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bands'],
        message: 'At least one band must be a pass',
      });
    }
  });
export type CreateGradeScaleInput = z.infer<typeof createGradeScaleSchema>;

export const updateGradeScaleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  bands: z.array(gradeBandSchema).min(2).max(20).optional(),
  policy: gradePolicySchema.partial().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type UpdateGradeScaleInput = z.infer<typeof updateGradeScaleSchema>;

export const gradeScaleListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'inactive']).optional(),
  isDefault: z.coerce.boolean().optional(),
});

/* ----------------------------------- exam ---------------------------------- */

export const markComponentsSchema = z
  .object({
    theory: z.number().min(0).max(1000).default(0),
    practical: z.number().min(0).max(1000).default(0),
    internal: z.number().min(0).max(1000).default(0),
  })
  .refine((data) => data.theory + data.practical + data.internal > 0, {
    message: 'An exam must carry marks in at least one component',
  });
export type MarkComponentsInput = z.infer<typeof markComponentsSchema>;

export const createExaminationSchema = z
  .object({
    title: z.string().trim().min(3, 'Title is required').max(200),
    code: codeSchema,
    examType: z.enum(EXAM_TYPE),
    courseId: objectIdSchema,
    departmentId: objectIdSchema,
    batchIds: z.array(objectIdSchema).min(1, 'Select at least one batch').max(50),
    semester: z.number().int().min(1).max(12),
    academicYear: academicYearSchema,
    /** Marks available in each component; their sum is the maximum. */
    maxMarks: markComponentsSchema,
    credits: z.number().min(0).max(20),
    gradeScaleId: objectIdSchema.nullable().optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
    durationMinutes: z.number().int().min(10).max(600).nullable().optional(),
    venue: z.string().trim().max(200).nullable().optional(),
    instructions: z.string().trim().max(10000).nullable().optional(),
    /** Links this exam to a training session's assessment. */
    trainingSessionId: objectIdSchema.nullable().optional(),
  })
  .refine(
    (data) => data.examType !== 'online' || data.durationMinutes !== null,
    { message: 'An online exam needs a duration', path: ['durationMinutes'] },
  );
export type CreateExaminationInput = z.infer<typeof createExaminationSchema>;

export const updateExaminationSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  examType: z.enum(EXAM_TYPE).optional(),
  batchIds: z.array(objectIdSchema).min(1).max(50).optional(),
  semester: z.number().int().min(1).max(12).optional(),
  maxMarks: markComponentsSchema.optional(),
  credits: z.number().min(0).max(20).optional(),
  gradeScaleId: objectIdSchema.nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  durationMinutes: z.number().int().min(10).max(600).nullable().optional(),
  venue: z.string().trim().max(200).nullable().optional(),
  instructions: z.string().trim().max(10000).nullable().optional(),
});
export type UpdateExaminationInput = z.infer<typeof updateExaminationSchema>;

export const examinationListQuerySchema = paginationQuerySchema.extend({
  examType: z.enum(EXAM_TYPE).optional(),
  status: z.enum(EXAM_LIFECYCLE).optional(),
  courseId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  batchIds: objectIdSchema.optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  academicYear: academicYearSchema.optional(),
});

export const examinationExportQuerySchema = examinationListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

export const transitionExaminationSchema = z.object({
  to: z.enum(EXAM_LIFECYCLE),
  reason: z.string().trim().max(500).optional(),
});
export type TransitionExaminationInput = z.infer<typeof transitionExaminationSchema>;

/* -------------------------------- exam paper ------------------------------- */

export const examinationPaperSectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().max(2000).nullable().optional(),
  questionCount: z.number().int().min(1).max(200),
  marksPerQuestion: z.number().min(0).max(100),
  isOptional: z.boolean().default(false),
});

export const createExaminationPaperSchema = z.object({
  title: z.string().trim().min(3).max(200),
  totalMarks: z.number().min(1).max(1000),
  sections: z.array(examinationPaperSectionSchema).max(20).default([]),
  instructions: z.string().trim().max(10000).nullable().optional(),
  attachment: attachmentSchema.nullable().optional(),
  /** Setting this true exposes the paper; it is irreversible per version. */
  isReleased: z.boolean().default(false),
});
export type CreateExaminationPaperInput = z.infer<typeof createExaminationPaperSchema>;

export const updateExaminationPaperSchema = createExaminationPaperSchema.partial();

/* ------------------------------- registration ------------------------------ */

export const registerStudentsSchema = z
  .object({
    studentIds: z.array(objectIdSchema).max(2000).default([]),
    batchIds: z.array(objectIdSchema).max(50).default([]),
  })
  .refine((data) => data.studentIds.length > 0 || data.batchIds.length > 0, {
    message: 'Select at least one student or batch',
    path: ['studentIds'],
  });
export type RegisterStudentsInput = z.infer<typeof registerStudentsSchema>;

export const updateRegistrationSchema = z.object({
  status: z.enum(EXAM_REGISTRATION_STATUS),
  reason: z.string().trim().max(500).optional(),
});

export const registrationListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EXAM_REGISTRATION_STATUS).optional(),
  batchId: objectIdSchema.optional(),
});

/* -------------------------------- attendance ------------------------------- */

export const markExamAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: objectIdSchema,
        status: z.enum(EXAM_ATTENDANCE_STATUS),
        remarks: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1, 'At least one student must be marked')
    .max(2000),
});
export type MarkExamAttendanceInput = z.infer<typeof markExamAttendanceSchema>;

/* ---------------------------------- marks ---------------------------------- */

export const marksEntrySchema = z.object({
  studentId: objectIdSchema,
  theory: z.number().min(0).max(1000).nullable().optional(),
  practical: z.number().min(0).max(1000).nullable().optional(),
  internal: z.number().min(0).max(1000).nullable().optional(),
  graceMarks: z.number().min(0).max(50).default(0),
  remarks: z.string().trim().max(300).nullable().optional(),
});
export type MarksEntryInput = z.infer<typeof marksEntrySchema>;

export const enterMarksSchema = z.object({
  entries: z.array(marksEntrySchema).min(1, 'Enter marks for at least one student').max(2000),
  /** Submits for verification in the same call. */
  submit: z.boolean().default(false),
});
export type EnterMarksInput = z.infer<typeof enterMarksSchema>;

/** Omitting `studentIds` verifies every submitted mark for the exam. */
export const verifyMarksSchema = z.object({
  studentIds: z.array(objectIdSchema).max(2000).optional(),
});
export type VerifyMarksInput = z.infer<typeof verifyMarksSchema>;

export const correctMarksSchema = marksEntrySchema.extend({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
});
export type CorrectMarksInput = z.infer<typeof correctMarksSchema>;

export const marksListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(MARKS_ENTRY_STATUS).optional(),
  isPass: z.coerce.boolean().optional(),
  isRepeat: z.coerce.boolean().optional(),
});

/* --------------------------------- results --------------------------------- */

export const publishResultsSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  /** Withholds named students from this publication. */
  withholdStudentIds: z.array(objectIdSchema).max(2000).default([]),
});
export type PublishResultsInput = z.infer<typeof publishResultsSchema>;

export const unpublishResultsSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
});

export const recalculateResultsSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

/* -------------------------------- transcript ------------------------------- */

export const transcriptQuerySchema = z.object({
  academicYear: academicYearSchema.optional(),
  upToSemester: z.coerce.number().int().min(1).max(12).optional(),
});

export const generateTranscriptSchema = z.object({
  studentId: objectIdSchema,
  upToSemester: z.number().int().min(1).max(12).nullable().optional(),
});
export type GenerateTranscriptInput = z.infer<typeof generateTranscriptSchema>;
