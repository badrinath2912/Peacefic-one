import { z } from 'zod';

import {
  ASSIGNMENT_STATUS,
  SUBMISSION_STATUS,
  SUBMISSION_TYPE,
} from '../constants/enums';

import {
  attachmentSchema,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const createAssignmentSchema = z
  .object({
    courseId: objectIdSchema.nullable().optional(),
    moduleId: objectIdSchema.nullable().optional(),
    batchIds: z.array(objectIdSchema).min(1, 'Select at least one batch').max(50),
    title: z.string().trim().min(3, 'Title is required').max(200),
    description: z.string().trim().min(10, 'Description is required').max(10000),
    instructions: z.string().trim().max(10000).nullable().optional(),
    attachments: z.array(attachmentSchema).max(10).default([]),
    maxScore: z.number().min(1).max(1000),
    passingScore: z.number().min(0).max(1000),
    weightage: z.number().min(0).max(100).nullable().optional(),
    submissionType: z.enum(SUBMISSION_TYPE).default('file'),
    allowedFileTypes: z.array(z.string().trim().max(20)).max(20).default([]),
    maxFileSizeMb: z.number().int().min(1).max(200).default(25),
    maxAttempts: z.number().int().min(1).max(10).default(1),
    assignedAt: z.coerce.date(),
    dueAt: z.coerce.date(),
    lateSubmissionAllowed: z.boolean().default(false),
    latePenaltyPercent: z.number().min(0).max(100).default(0),
    lateCutoffAt: z.coerce.date().nullable().optional(),
    status: z.enum(ASSIGNMENT_STATUS).default('draft'),
  })
  .refine((data) => data.dueAt > data.assignedAt, {
    message: 'Due date must be after the assigned date',
    path: ['dueAt'],
  })
  .refine((data) => data.passingScore <= data.maxScore, {
    message: 'Passing score cannot exceed the maximum score',
    path: ['passingScore'],
  })
  .refine(
    (data) => !data.lateSubmissionAllowed || !data.lateCutoffAt || data.lateCutoffAt > data.dueAt,
    { message: 'Late cutoff must be after the due date', path: ['lateCutoffAt'] },
  );
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(10).max(10000).optional(),
  instructions: z.string().trim().max(10000).nullable().optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  maxScore: z.number().min(1).max(1000).optional(),
  passingScore: z.number().min(0).max(1000).optional(),
  weightage: z.number().min(0).max(100).nullable().optional(),
  batchIds: z.array(objectIdSchema).min(1).max(50).optional(),
  dueAt: z.coerce.date().optional(),
  lateSubmissionAllowed: z.boolean().optional(),
  latePenaltyPercent: z.number().min(0).max(100).optional(),
  lateCutoffAt: z.coerce.date().nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  status: z.enum(ASSIGNMENT_STATUS).optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const submitAssignmentSchema = z
  .object({
    text: z.string().trim().max(50000).nullable().optional(),
    link: z.string().url().nullable().optional(),
    files: z.array(attachmentSchema).max(10).default([]),
    code: z
      .object({
        language: z.string().trim().min(1).max(40),
        source: z.string().max(200000),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      Boolean(data.text?.trim()) ||
      Boolean(data.link) ||
      data.files.length > 0 ||
      Boolean(data.code?.source?.trim()),
    { message: 'A submission cannot be empty' },
  );
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

export const gradeSubmissionSchema = z.object({
  score: z.number().min(0).max(1000),
  feedback: z.string().trim().max(5000).nullable().optional(),
  rubricScores: z
    .array(
      z.object({
        criterion: z.string().trim().min(1).max(120),
        score: z.number().min(0),
        maxScore: z.number().min(0),
      }),
    )
    .max(20)
    .default([]),
  requestResubmission: z.boolean().default(false),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

export const assignmentListQuerySchema = paginationQuerySchema.extend({
  courseId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  status: z.enum(ASSIGNMENT_STATUS).optional(),
  createdByFacultyId: objectIdSchema.optional(),
});

export const studentAssignmentListQuerySchema = paginationQuerySchema.extend({
  courseId: objectIdSchema.optional(),
  state: z.enum(['pending', 'submitted', 'graded', 'overdue']).optional(),
});

export const submissionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(SUBMISSION_STATUS).optional(),
  studentId: objectIdSchema.optional(),
});
