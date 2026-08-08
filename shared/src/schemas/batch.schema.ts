import { z } from 'zod';

import { BATCH_STATUS } from '../constants/enums';

import {
  codeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const createBatchSchema = z
  .object({
    departmentId: objectIdSchema,
    name: z.string().trim().min(2, 'Batch name is required').max(150),
    code: codeSchema,
    admissionYear: z.number().int().min(1980).max(new Date().getFullYear() + 5),
    graduationYear: z.number().int().min(1980).max(new Date().getFullYear() + 15),
    currentSemester: z.number().int().min(1).max(12).default(1),
    section: z.string().trim().max(10).nullable().optional(),
    classAdvisorId: objectIdSchema.nullable().optional(),
    capacity: z.number().int().min(1).max(1000),
    status: z.enum(BATCH_STATUS).default('active'),
  })
  .refine((data) => data.graduationYear > data.admissionYear, {
    message: 'Graduation year must be after the admission year',
    path: ['graduationYear'],
  });
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = z.object({
  departmentId: objectIdSchema.optional(),
  name: z.string().trim().min(2).max(150).optional(),
  code: codeSchema.optional(),
  admissionYear: z.number().int().min(1980).max(new Date().getFullYear() + 5).optional(),
  graduationYear: z.number().int().min(1980).max(new Date().getFullYear() + 15).optional(),
  currentSemester: z.number().int().min(1).max(12).optional(),
  section: z.string().trim().max(10).nullable().optional(),
  classAdvisorId: objectIdSchema.nullable().optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  status: z.enum(BATCH_STATUS).optional(),
});
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

export const batchListQuerySchema = paginationQuerySchema.extend({
  departmentId: objectIdSchema.optional(),
  status: z.enum(BATCH_STATUS).optional(),
  admissionYear: z.coerce.number().int().optional(),
  graduationYear: z.coerce.number().int().optional(),
  currentSemester: z.coerce.number().int().optional(),
});

export const assignAdvisorSchema = z.object({
  classAdvisorId: objectIdSchema.nullable(),
});

export const batchStudentsSchema = z.object({
  studentIds: z.array(objectIdSchema).min(1).max(500),
});

export const promoteBatchSchema = z.object({
  confirm: z.literal(true),
});
