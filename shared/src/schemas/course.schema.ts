import { z } from 'zod';

import {
  CONTENT_STATUS,
  COURSE_CATEGORY,
  COURSE_LEVEL,
  LIVE_CLASS_STATUS,
  MATERIAL_TYPE,
  MEETING_PROVIDER,
} from '../constants/enums';

import {
  booleanQuery,
  codeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(200),
  code: codeSchema,
  description: z.string().trim().min(10, 'Description is required').max(5000),
  category: z.enum(COURSE_CATEGORY),
  level: z.enum(COURSE_LEVEL).default('beginner'),
  thumbnailUrl: z.string().url().nullable().optional(),
  durationHours: z.number().min(0).max(1000),
  credits: z.number().min(0).max(20).nullable().optional(),
  // The semester a course is normally taught in. Null for electives and
  // training content that is not tied to one.
  semester: z.number().int().min(1).max(12).nullable().optional(),
  instructorIds: z.array(objectIdSchema).max(20).default([]),
  departmentIds: z.array(objectIdSchema).max(50).default([]),
  batchIds: z.array(objectIdSchema).max(100).default([]),
  prerequisites: z.array(objectIdSchema).max(10).default([]),
  learningOutcomes: z.array(z.string().trim().max(300)).max(20).default([]),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  status: z.enum(CONTENT_STATUS).default('draft'),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const courseListQuerySchema = paginationQuerySchema.extend({
  category: z.enum(COURSE_CATEGORY).optional(),
  level: z.enum(COURSE_LEVEL).optional(),
  status: z.enum(CONTENT_STATUS).optional(),
  departmentId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  instructorId: objectIdSchema.optional(),
  tag: z.string().trim().max(40).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  enrolled: booleanQuery.optional(),
});

export const courseExportQuerySchema = courseListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

export const assignInstructorsSchema = z.object({
  instructorIds: z.array(objectIdSchema).max(20),
});
export type AssignInstructorsInput = z.infer<typeof assignInstructorsSchema>;

export const createModuleSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  order: z.number().int().min(1).max(500),
  durationMinutes: z.number().int().min(0).max(100000).default(0),
  isPreview: z.boolean().default(false),
  status: z.enum(['draft', 'published']).default('draft'),
});
export type CreateModuleInput = z.infer<typeof createModuleSchema>;

export const updateModuleSchema = createModuleSchema.partial();

export const reorderModulesSchema = z.object({
  order: z.array(z.object({ id: objectIdSchema, order: z.number().int().min(1) })).min(1),
});

export const createMaterialSchema = z.object({
  moduleId: objectIdSchema,
  title: z.string().trim().min(2).max(200),
  type: z.enum(MATERIAL_TYPE),
  order: z.number().int().min(1).max(500),
  content: z.object({
    url: z.string().url().nullable().optional(),
    fileKey: z.string().max(500).nullable().optional(),
    fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
    mimeType: z.string().max(120).nullable().optional(),
    durationSeconds: z.number().int().nonnegative().nullable().optional(),
    externalUrl: z.string().url().nullable().optional(),
    textContent: z.string().max(100000).nullable().optional(),
  }),
  isDownloadable: z.boolean().default(false),
  isMandatory: z.boolean().default(true),
  status: z.enum(['draft', 'published']).default('draft'),
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = createMaterialSchema.partial();

export const trackProgressSchema = z.object({
  materialId: objectIdSchema,
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
  positionSeconds: z.number().int().min(0).max(86400).optional(),
  completed: z.boolean().optional(),
});
export type TrackProgressInput = z.infer<typeof trackProgressSchema>;

export const rateCourseSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).optional().nullable(),
});

export const enrollStudentsSchema = z.object({
  studentIds: z.array(objectIdSchema).min(1).max(500).optional(),
  batchIds: z.array(objectIdSchema).min(1).max(50).optional(),
});

export const createLiveClassSchema = z
  .object({
    courseId: objectIdSchema.nullable().optional(),
    batchIds: z.array(objectIdSchema).min(1, 'Select at least one batch').max(50),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    instructorId: objectIdSchema,
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    provider: z.enum(MEETING_PROVIDER).default('jitsi'),
    createAttendanceSession: z.boolean().default(true),
  })
  .refine((data) => data.scheduledEnd > data.scheduledStart, {
    message: 'End time must be after the start time',
    path: ['scheduledEnd'],
  });
export type CreateLiveClassInput = z.infer<typeof createLiveClassSchema>;

export const updateLiveClassSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  scheduledStart: z.coerce.date().optional(),
  scheduledEnd: z.coerce.date().optional(),
  batchIds: z.array(objectIdSchema).min(1).max(50).optional(),
});

export const cancelLiveClassSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const liveClassListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(LIVE_CLASS_STATUS).optional(),
  courseId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  instructorId: objectIdSchema.optional(),
});
