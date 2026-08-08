import { z } from 'zod';

import {
  ATTEMPT_STATUS,
  DIFFICULTY,
  EXAM_CATEGORY,
  EXAM_KIND,
  EXAM_STATUS,
  QUESTION_TYPE,
} from '../constants/enums';

import {
  booleanQuery,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const questionOptionSchema = z.object({
  id: z.string().trim().min(1).max(10),
  text: z.string().trim().min(1).max(2000),
  imageUrl: z.string().url().nullable().optional(),
  isCorrect: z.boolean(),
});

export const createQuestionSchema = z
  .object({
    poolId: objectIdSchema.nullable().optional(),
    type: z.enum(QUESTION_TYPE),
    category: z.string().trim().min(1).max(60),
    topic: z.string().trim().max(120).nullable().optional(),
    difficulty: z.enum(DIFFICULTY).default('medium'),
    text: z.string().trim().min(3, 'Question text is required').max(5000),
    imageUrl: z.string().url().nullable().optional(),
    marks: z.number().min(0).max(100).default(1),
    options: z.array(questionOptionSchema).max(10).default([]),
    correctAnswer: z
      .object({
        text: z.string().trim().max(2000).nullable().optional(),
        numeric: z.number().nullable().optional(),
        tolerance: z.number().min(0).nullable().optional(),
      })
      .nullable()
      .optional(),
    coding: z
      .object({
        starterCode: z
          .array(z.object({ language: z.string().max(40), code: z.string().max(20000) }))
          .max(10)
          .default([]),
        testCases: z
          .array(
            z.object({
              input: z.string().max(10000),
              expectedOutput: z.string().max(10000),
              isHidden: z.boolean().default(false),
              weight: z.number().min(0).max(100).default(1),
            }),
          )
          .max(50)
          .default([]),
        timeLimitMs: z.number().int().min(100).max(30000).default(2000),
        memoryLimitMb: z.number().int().min(16).max(1024).default(256),
      })
      .nullable()
      .optional(),
    explanation: z.string().trim().max(5000).nullable().optional(),
    tags: z.array(z.string().trim().max(40)).max(20).default([]),
  })
  .refine(
    (data) => {
      if (data.type === 'mcq_single') {
        return data.options.filter((o) => o.isCorrect).length === 1 && data.options.length >= 2;
      }
      if (data.type === 'mcq_multiple') {
        return data.options.filter((o) => o.isCorrect).length >= 1 && data.options.length >= 2;
      }
      if (data.type === 'true_false') {
        return data.options.length === 2 && data.options.filter((o) => o.isCorrect).length === 1;
      }
      if (data.type === 'numeric') {
        return data.correctAnswer?.numeric != null;
      }
      return true;
    },
    { message: 'The question is missing a valid correct answer for its type', path: ['options'] },
  );
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  category: z.string().trim().min(1).max(60).optional(),
  topic: z.string().trim().max(120).nullable().optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
  text: z.string().trim().min(3).max(5000).optional(),
  marks: z.number().min(0).max(100).optional(),
  options: z.array(questionOptionSchema).max(10).optional(),
  explanation: z.string().trim().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
});

export const questionListQuerySchema = paginationQuerySchema.extend({
  type: z.enum(QUESTION_TYPE).optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
  category: z.string().trim().max(60).optional(),
  topic: z.string().trim().max(120).optional(),
  poolId: objectIdSchema.optional(),
  tag: z.string().trim().max(40).optional(),
});

export const createExamSchema = z
  .object({
    kind: z.enum(EXAM_KIND),
    courseId: objectIdSchema.nullable().optional(),
    moduleId: objectIdSchema.nullable().optional(),
    batchIds: z.array(objectIdSchema).max(50).default([]),
    title: z.string().trim().min(3, 'Title is required').max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    category: z.enum(EXAM_CATEGORY),
    instructions: z.string().trim().max(10000).nullable().optional(),
    totalMarks: z.number().min(1).max(10000),
    passingMarks: z.number().min(0).max(10000),
    durationMinutes: z.number().int().min(1).max(600),
    negativeMarking: z
      .object({
        enabled: z.boolean().default(false),
        marksPerWrong: z.number().min(0).max(10).default(0),
      })
      .default({ enabled: false, marksPerWrong: 0 }),
    questionSelection: z.enum(['fixed', 'random_pool']).default('fixed'),
    questionIds: z.array(objectIdSchema).max(500).default([]),
    questionPool: z
      .object({
        poolId: objectIdSchema,
        count: z.number().int().min(1).max(500),
        difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
      })
      .nullable()
      .optional(),
    shuffleQuestions: z.boolean().default(true),
    shuffleOptions: z.boolean().default(true),
    availableFrom: z.coerce.date().nullable().optional(),
    availableUntil: z.coerce.date().nullable().optional(),
    maxAttempts: z.number().int().min(0).max(100).default(1),
    showResultsImmediately: z.boolean().default(true),
    showCorrectAnswers: z.enum(['never', 'after_submit', 'after_close']).default('after_submit'),
    proctoring: z
      .object({
        enabled: z.boolean().default(false),
        fullscreenRequired: z.boolean().default(false),
        tabSwitchLimit: z.number().int().min(0).max(50).default(3),
        webcamRequired: z.boolean().default(false),
        copyPasteDisabled: z.boolean().default(false),
      })
      .default({
        enabled: false,
        fullscreenRequired: false,
        tabSwitchLimit: 3,
        webcamRequired: false,
        copyPasteDisabled: false,
      }),
    status: z.enum(EXAM_STATUS).default('draft'),
  })
  .refine((data) => data.passingMarks <= data.totalMarks, {
    message: 'Passing marks cannot exceed total marks',
    path: ['passingMarks'],
  })
  .refine(
    (data) =>
      !data.availableFrom || !data.availableUntil || data.availableUntil > data.availableFrom,
    { message: 'The closing time must be after the opening time', path: ['availableUntil'] },
  )
  .refine(
    (data) =>
      data.kind !== 'examination' ||
      (Boolean(data.availableFrom) && Boolean(data.availableUntil) && data.maxAttempts === 1),
    {
      message: 'An examination needs an availability window and exactly one attempt',
      path: ['kind'],
    },
  )
  .refine(
    (data) =>
      data.questionSelection === 'random_pool'
        ? Boolean(data.questionPool)
        : data.questionIds.length > 0,
    { message: 'Add questions or configure a question pool', path: ['questionIds'] },
  );
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  instructions: z.string().trim().max(10000).nullable().optional(),
  batchIds: z.array(objectIdSchema).max(50).optional(),
  totalMarks: z.number().min(1).max(10000).optional(),
  passingMarks: z.number().min(0).max(10000).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  availableUntil: z.coerce.date().nullable().optional(),
  maxAttempts: z.number().int().min(0).max(100).optional(),
  showResultsImmediately: z.boolean().optional(),
  showCorrectAnswers: z.enum(['never', 'after_submit', 'after_close']).optional(),
  questionIds: z.array(objectIdSchema).max(500).optional(),
  status: z.enum(EXAM_STATUS).optional(),
});
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const examListQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(EXAM_KIND).optional(),
  category: z.enum(EXAM_CATEGORY).optional(),
  status: z.enum(EXAM_STATUS).optional(),
  courseId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
});

export const saveAnswerSchema = z.object({
  questionId: objectIdSchema,
  selectedOptionIds: z.array(z.string().max(10)).max(10).default([]),
  textAnswer: z.string().max(50000).nullable().optional(),
  numericAnswer: z.number().nullable().optional(),
  codeAnswer: z
    .object({ language: z.string().max(40), source: z.string().max(200000) })
    .nullable()
    .optional(),
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
  flaggedForReview: z.boolean().default(false),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const submitAttemptSchema = z.object({
  confirm: z.literal(true),
});

export const reportViolationSchema = z.object({
  type: z.enum(['tab_switch', 'fullscreen_exit', 'copy_paste', 'window_blur', 'other']),
  detail: z.string().trim().max(500).nullable().optional(),
});
export type ReportViolationInput = z.infer<typeof reportViolationSchema>;

export const gradeAttemptAnswerSchema = z.object({
  grades: z
    .array(
      z.object({
        questionId: objectIdSchema,
        marksAwarded: z.number().min(0).max(1000),
        feedback: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type GradeAttemptAnswerInput = z.infer<typeof gradeAttemptAnswerSchema>;

export const attemptListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ATTEMPT_STATUS).optional(),
  examId: objectIdSchema.optional(),
  studentId: objectIdSchema.optional(),
  flagged: booleanQuery.optional(),
});
