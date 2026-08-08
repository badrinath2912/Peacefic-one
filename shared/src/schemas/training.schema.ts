import { z } from 'zod';

import { APPROVAL_STATUS, PRIORITY, TRAINING_STATUS, TRAINING_TYPE } from '../constants/enums';

import {
  attachmentSchema,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const createTrainingRequestSchema = z
  .object({
    title: z.string().trim().min(3, 'Title is required').max(200),
    description: z.string().trim().min(20, 'Describe the requirement').max(10000),
    trainingType: z.enum(TRAINING_TYPE),
    departmentIds: z.array(objectIdSchema).max(50).default([]),
    batchIds: z.array(objectIdSchema).max(100).default([]),
    expectedParticipants: z.number().int().min(1).max(10000),
    preferredStartDate: z.coerce.date(),
    preferredEndDate: z.coerce.date(),
    durationHours: z.number().min(1).max(2000),
    mode: z.enum(['online', 'offline', 'hybrid']).default('offline'),
    topics: z.array(z.string().trim().max(160)).max(50).default([]),
    objectives: z.string().trim().max(5000).nullable().optional(),
    budget: z
      .object({
        currency: z.string().trim().length(3).default('INR'),
        amount: z.number().int().min(0),
      })
      .nullable()
      .optional(),
    attachments: z.array(attachmentSchema).max(10).default([]),
    priority: z.enum(PRIORITY).default('medium'),
    status: z.enum(['draft', 'submitted']).default('draft'),
  })
  .refine((d) => d.preferredEndDate >= d.preferredStartDate, {
    message: 'The end date must be on or after the start date',
    path: ['preferredEndDate'],
  });
export type CreateTrainingRequestInput = z.infer<typeof createTrainingRequestSchema>;

export const updateTrainingRequestSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(20).max(10000).optional(),
  trainingType: z.enum(TRAINING_TYPE).optional(),
  departmentIds: z.array(objectIdSchema).max(50).optional(),
  batchIds: z.array(objectIdSchema).max(100).optional(),
  expectedParticipants: z.number().int().min(1).max(10000).optional(),
  preferredStartDate: z.coerce.date().optional(),
  preferredEndDate: z.coerce.date().optional(),
  durationHours: z.number().min(1).max(2000).optional(),
  mode: z.enum(['online', 'offline', 'hybrid']).optional(),
  topics: z.array(z.string().trim().max(160)).max(50).optional(),
  objectives: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(PRIORITY).optional(),
});
export type UpdateTrainingRequestInput = z.infer<typeof updateTrainingRequestSchema>;

export const approveTrainingSchema = z.object({
  comments: z.string().trim().max(2000).optional(),
});

export const rejectTrainingSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(2000),
});

export const requestInfoSchema = z.object({
  questions: z.string().trim().min(10).max(2000),
});

export const assignTrainerSchema = z
  .object({
    trainerIds: z.array(objectIdSchema).min(1, 'Assign at least one trainer').max(20),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    courseId: objectIdSchema.nullable().optional(),
  })
  .refine((d) => d.scheduledEnd >= d.scheduledStart, {
    message: 'The end date must be on or after the start date',
    path: ['scheduledEnd'],
  });
export type AssignTrainerInput = z.infer<typeof assignTrainerSchema>;

export const completeTrainingSchema = z.object({
  actualParticipants: z.number().int().min(0).max(10000),
  feedbackScore: z.number().min(0).max(5).nullable().optional(),
  report: z.string().trim().max(20000).nullable().optional(),
});
export type CompleteTrainingInput = z.infer<typeof completeTrainingSchema>;

export const cancelTrainingSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

/* ----------------------------- training sessions ---------------------------- */

export const TRAINING_SESSION_STATUS = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type TrainingSessionStatus = (typeof TRAINING_SESSION_STATUS)[number];

export const TRAINING_MODE = ['online', 'offline', 'hybrid'] as const;
export type TrainingMode = (typeof TRAINING_MODE)[number];

export const createTrainingSessionSchema = z
  .object({
    /** Set when the session delivers an approved request. */
    requestId: objectIdSchema.nullable().optional(),
    title: z.string().trim().min(3, 'Title is required').max(200),
    description: z.string().trim().max(10000).nullable().optional(),
    trainingType: z.enum(TRAINING_TYPE),
    departmentIds: z.array(objectIdSchema).max(50).default([]),
    batchIds: z.array(objectIdSchema).max(100).default([]),
    trainerIds: z.array(objectIdSchema).max(20).default([]),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    capacity: z.number().int().min(1).max(10000),
    mode: z.enum(TRAINING_MODE).default('offline'),
    location: z.string().trim().max(300).nullable().optional(),
    meetingLink: z.string().url().nullable().optional(),
    learningObjectives: z.array(z.string().trim().max(300)).max(30).default([]),
    topics: z.array(z.string().trim().max(160)).max(50).default([]),
    status: z.enum(TRAINING_SESSION_STATUS).default('scheduled'),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })
  .refine((data) => data.mode === 'online' || Boolean(data.location), {
    message: 'An in-person session needs a location',
    path: ['location'],
  })
  .refine((data) => data.mode === 'offline' || Boolean(data.meetingLink), {
    message: 'An online session needs a meeting link',
    path: ['meetingLink'],
  });
export type CreateTrainingSessionInput = z.infer<typeof createTrainingSessionSchema>;

export const updateTrainingSessionSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  trainingType: z.enum(TRAINING_TYPE).optional(),
  departmentIds: z.array(objectIdSchema).max(50).optional(),
  batchIds: z.array(objectIdSchema).max(100).optional(),
  trainerIds: z.array(objectIdSchema).max(20).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().min(1).max(10000).optional(),
  mode: z.enum(TRAINING_MODE).optional(),
  location: z.string().trim().max(300).nullable().optional(),
  meetingLink: z.string().url().nullable().optional(),
  learningObjectives: z.array(z.string().trim().max(300)).max(30).optional(),
  topics: z.array(z.string().trim().max(160)).max(50).optional(),
  status: z.enum(TRAINING_SESSION_STATUS).optional(),
});
export type UpdateTrainingSessionInput = z.infer<typeof updateTrainingSessionSchema>;

export const trainingSessionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TRAINING_SESSION_STATUS).optional(),
  trainingType: z.enum(TRAINING_TYPE).optional(),
  mode: z.enum(TRAINING_MODE).optional(),
  departmentIds: objectIdSchema.optional(),
  batchIds: objectIdSchema.optional(),
  trainerIds: objectIdSchema.optional(),
  requestId: objectIdSchema.optional(),
});

export const trainingSessionExportQuerySchema = trainingSessionListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

export const calendarQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  trainerIds: objectIdSchema.optional(),
  departmentIds: objectIdSchema.optional(),
});

export const cancelTrainingSessionSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(500),
});

/* ------------------------------- enrolment --------------------------------- */

export const TRAINING_ENROLLMENT_STATUS = ['enrolled', 'attended', 'completed', 'withdrawn'] as const;
export type TrainingEnrollmentStatus = (typeof TRAINING_ENROLLMENT_STATUS)[number];

export const enrolTrainingStudentsSchema = z
  .object({
    studentIds: z.array(objectIdSchema).max(1000).default([]),
    /** Enrols every active student in these batches. */
    batchIds: z.array(objectIdSchema).max(50).default([]),
  })
  .refine((data) => data.studentIds.length > 0 || data.batchIds.length > 0, {
    message: 'Select at least one student or batch',
    path: ['studentIds'],
  });
export type EnrollStudentsInput = z.infer<typeof enrolTrainingStudentsSchema>;

export const withdrawEnrollmentSchema = z.object({
  studentIds: z.array(objectIdSchema).min(1).max(1000),
  reason: z.string().trim().max(500).optional(),
});

export const completeSessionSchema = z.object({
  /** Students who finished. Everyone else is left as enrolled. */
  completedStudentIds: z.array(objectIdSchema).max(10000).default([]),
  feedbackScore: z.number().min(0).max(5).nullable().optional(),
  report: z.string().trim().max(20000).nullable().optional(),
});
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export const trainingListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TRAINING_STATUS).optional(),
  approvalStatus: z.enum(APPROVAL_STATUS).optional(),
  trainingType: z.enum(TRAINING_TYPE).optional(),
  priority: z.enum(PRIORITY).optional(),
  departmentId: objectIdSchema.optional(),
  requestedBy: objectIdSchema.optional(),
});
