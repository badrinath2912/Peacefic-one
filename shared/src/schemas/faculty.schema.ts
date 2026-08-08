import { z } from 'zod';

import {
  EMPLOYMENT_TYPE,
  FACULTY_STATUS,
  FACULTY_TYPE,
} from '../constants/enums';

import {
  addressSchema,
  emailSchema,
  objectIdSchema,
  paginationQuerySchema,
  phoneSchema,
} from './common.schema';

export const qualificationSchema = z.object({
  degree: z.string().trim().min(1).max(80),
  specialization: z.string().trim().max(120),
  institution: z.string().trim().min(1).max(200),
  year: z.number().int().min(1900).max(new Date().getFullYear()),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(120),
  relation: z.string().trim().min(1, 'Relation is required').max(50),
  phone: phoneSchema,
});

export const createFacultySchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: emailSchema,
  phone: phoneSchema.nullable().optional(),
  alternatePhone: phoneSchema.nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  address: addressSchema.nullable().optional(),
  emergencyContact: emergencyContactSchema.nullable().optional(),
  departmentId: objectIdSchema,
  employeeId: z.string().trim().min(1, 'Employee ID is required').max(40),
  designation: z.string().trim().min(2, 'Designation is required').max(120),
  employmentType: z.enum(EMPLOYMENT_TYPE).default('permanent'),
  type: z.enum(FACULTY_TYPE).default('faculty'),
  roleKey: z.enum(['hod', 'faculty', 'trainer', 'placement_officer']).default('faculty'),
  joiningDate: z.coerce.date(),
  qualifications: z.array(qualificationSchema).max(10).default([]),
  experienceYears: z.number().min(0).max(60).default(0),
  specializations: z.array(z.string().trim().max(80)).max(20).default([]),
  assignedBatchIds: z.array(objectIdSchema).max(50).default([]),
  status: z.enum(FACULTY_STATUS).default('active'),
  sendInvite: z.boolean().default(true),
});
export type CreateFacultyInput = z.infer<typeof createFacultySchema>;

export const updateFacultySchema = createFacultySchema
  .omit({ sendInvite: true, email: true, roleKey: true })
  .partial();
export type UpdateFacultyInput = z.infer<typeof updateFacultySchema>;

export const facultyListQuerySchema = paginationQuerySchema.extend({
  departmentId: objectIdSchema.optional(),
  status: z.enum(FACULTY_STATUS).optional(),
  type: z.enum(FACULTY_TYPE).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPE).optional(),
  batchId: objectIdSchema.optional(),
});

export const assignBatchesSchema = z.object({
  assignedBatchIds: z.array(objectIdSchema).max(50),
});
export type AssignBatchesInput = z.infer<typeof assignBatchesSchema>;

export const importFacultyRowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  phone: z.string().trim().optional().nullable(),
  employeeId: z.string().trim().min(1).max(40),
  departmentCode: z.string().trim().min(1).max(20),
  designation: z.string().trim().min(1).max(120),
  employmentType: z.string().trim().optional().nullable(),
  type: z.string().trim().optional().nullable(),
  joiningDate: z.string().trim().min(1),
  experienceYears: z.coerce.number().min(0).max(60).optional().nullable(),
});
export type ImportFacultyRow = z.infer<typeof importFacultyRowSchema>;

export const facultyExportQuerySchema = facultyListQuerySchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv'),
});

export const bulkFacultyIdsSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'Select at least one staff member').max(500),
});
