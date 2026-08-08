import { z } from 'zod';

import { COLLEGE_STATUS, COLLEGE_TYPE, GRADING_SCALE } from '../constants/enums';

import {
  addressSchema,
  codeSchema,
  emailSchema,
  paginationQuerySchema,
  percentageSchema,
  phoneSchema,
} from './common.schema';

export const collegeSettingsSchema = z.object({
  allowStudentSelfRegistration: z.boolean().default(false),
  attendanceThresholdPercent: percentageSchema.default(75),
  gradingScale: z.enum(GRADING_SCALE).default('gpa_10'),
  certificateSignatory: z
    .object({
      name: z.string().trim().max(120),
      designation: z.string().trim().max(120),
      signatureUrl: z.string().url().nullable().optional(),
    })
    .optional(),
});

export const updateCollegeSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  type: z.enum(COLLEGE_TYPE).optional(),
  affiliatedTo: z.string().trim().max(200).nullable().optional(),
  accreditation: z.array(z.string().trim().max(50)).max(20).optional(),
  establishedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  logoUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
  academicYearStartMonth: z.number().int().min(1).max(12).optional(),
  primaryContact: z
    .object({
      name: z.string().trim().min(1).max(120),
      email: emailSchema,
      phone: phoneSchema,
      designation: z.string().trim().min(1).max(120),
    })
    .optional(),
});
export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;

export const updateCollegeSettingsSchema = collegeSettingsSchema.partial();
export type UpdateCollegeSettingsInput = z.infer<typeof updateCollegeSettingsSchema>;

export const collegeListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(COLLEGE_STATUS).optional(),
  type: z.enum(COLLEGE_TYPE).optional(),
});

export const approveCollegeSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});

export const rejectCollegeSchema = z.object({
  reason: z.string().trim().min(10, 'Please give a reason of at least 10 characters').max(1000),
});

export const suspendCollegeSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export const createCollegeCodeSchema = z.object({ code: codeSchema });
