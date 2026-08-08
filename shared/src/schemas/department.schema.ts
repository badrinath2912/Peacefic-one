import { z } from 'zod';

import { DEPARTMENT_STATUS } from '../constants/enums';

import { codeSchema, objectIdSchema, paginationQuerySchema } from './common.schema';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required').max(150),
  code: codeSchema,
  hodId: objectIdSchema.nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  establishedYear: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear())
    .nullable()
    .optional(),
  status: z.enum(DEPARTMENT_STATUS).default('active'),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const departmentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DEPARTMENT_STATUS).optional(),
  hodId: objectIdSchema.optional(),
});

export const assignHodSchema = z.object({
  hodId: objectIdSchema.nullable(),
});
export type AssignHodInput = z.infer<typeof assignHodSchema>;
