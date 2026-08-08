import { z } from 'zod';

import { GENDER, SKILL_LEVEL, STUDENT_STATUS } from '../constants/enums';

import {
  addressSchema,
  booleanQuery,
  emailSchema,
  objectIdSchema,
  paginationQuerySchema,
  percentageSchema,
  phoneSchema,
} from './common.schema';

export const guardianSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relation: z.string().trim().min(1).max(50),
  phone: phoneSchema,
  email: emailSchema.nullable().optional(),
});

/**
 * Aadhaar is accepted from the form but never stored in full — see
 * `StudentDocument.aadhaar`, which keeps only the last four digits plus a hash.
 * The checksum below is the Verhoeff algorithm UIDAI actually uses, so a
 * mistyped number is caught here rather than becoming a permanent bad record.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaar(value: string): boolean {
  const digits = value.replace(/\s|-/g, '');
  if (!/^[2-9]\d{11}$/.test(digits)) return false;

  let checksum = 0;
  const reversed = digits.split('').reverse().map(Number);

  for (const [index, digit] of reversed.entries()) {
    checksum = VERHOEFF_D[checksum]![VERHOEFF_P[index % 8]![digit]!]!;
  }

  return checksum === 0;
}

export const aadhaarSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s|-/g, ''))
  .refine((value) => isValidAadhaar(value), 'That is not a valid Aadhaar number');

export const studentSkillSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.enum(SKILL_LEVEL),
});

export const studentAcademicsSchema = z.object({
  tenthPercent: percentageSchema.nullable().optional(),
  twelfthPercent: percentageSchema.nullable().optional(),
  diplomaPercent: percentageSchema.nullable().optional(),
  currentCgpa: z.number().min(0).max(10).nullable().optional(),
  activeBacklogs: z.number().int().min(0).max(100).default(0),
  totalBacklogs: z.number().int().min(0).max(100).default(0),
  yearGap: z.number().int().min(0).max(20).default(0),
});

export const portfolioLinksSchema = z.object({
  github: z.string().url().nullable().optional(),
  linkedin: z.string().url().nullable().optional(),
  portfolio: z.string().url().nullable().optional(),
  other: z.array(z.string().url()).max(5).default([]),
});

export const createStudentSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: emailSchema,
  phone: phoneSchema.nullable().optional(),
  alternatePhone: phoneSchema.nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  // Distinct from rollNumber: the admission number is issued at enrolment and
  // never changes, while a roll number can be reassigned per semester.
  admissionNumber: z.string().trim().min(1, 'Admission number is required').max(40),
  aadhaarNumber: aadhaarSchema.nullable().optional(),
  // The academic programme ("B.E. Computer Science"), not an LMS course —
  // `Course` in this system means training content.
  programme: z.string().trim().max(120).nullable().optional(),
  section: z.string().trim().max(10).nullable().optional(),
  departmentId: objectIdSchema,
  batchId: objectIdSchema,
  rollNumber: z.string().trim().min(1, 'Roll number is required').max(40),
  registerNumber: z.string().trim().max(40).nullable().optional(),
  admissionDate: z.coerce.date(),
  currentSemester: z.number().int().min(1).max(12).default(1),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.enum(GENDER).nullable().optional(),
  bloodGroup: z.string().trim().max(5).nullable().optional(),
  category: z.string().trim().max(30).nullable().optional(),
  address: addressSchema.nullable().optional(),
  guardian: guardianSchema.nullable().optional(),
  academics: studentAcademicsSchema.optional(),
  skills: z.array(studentSkillSchema).max(50).optional(),
  portfolioLinks: portfolioLinksSchema.optional(),
  status: z.enum(STUDENT_STATUS).default('active'),
  sendInvite: z.boolean().default(true),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema
  .omit({ sendInvite: true, email: true })
  .partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

/**
 * Fields a student may change on their own profile. Everything else is an
 * institutional record.
 *
 * `.strict()` is a deliberate exception to the strip-unknown-keys default:
 * stripping is the right safety behaviour on admin endpoints, but here it
 * would answer 200 to a student who tried to edit their own CGPA and leave
 * them thinking it worked. An explicit rejection is the honest answer.
 */
export const updateOwnStudentProfileSchema = z
  .object({
    phone: phoneSchema.nullable().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    gender: z.enum(GENDER).nullable().optional(),
    bloodGroup: z.string().trim().max(5).nullable().optional(),
    address: addressSchema.nullable().optional(),
    guardian: guardianSchema.nullable().optional(),
    skills: z.array(studentSkillSchema).max(50).optional(),
    portfolioLinks: portfolioLinksSchema.optional(),
  })
  .strict('That field is maintained by your institution and cannot be changed here.');
export type UpdateOwnStudentProfileInput = z.infer<typeof updateOwnStudentProfileSchema>;

export const studentListQuerySchema = paginationQuerySchema.extend({
  departmentId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  status: z.enum(STUDENT_STATUS).optional(),
  currentSemester: z.coerce.number().int().min(1).max(12).optional(),
  gender: z.enum(GENDER).optional(),
  admissionYear: z.coerce.number().int().optional(),
  isPlaced: booleanQuery.optional(),
  isEligible: booleanQuery.optional(),
  minCgpa: z.coerce.number().min(0).max(10).optional(),
  maxCgpa: z.coerce.number().min(0).max(10).optional(),
  maxBacklogs: z.coerce.number().int().min(0).optional(),
  skill: z.string().trim().max(60).optional(),
});
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

export const bulkUpdateStudentsSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
  patch: z.object({
    batchId: objectIdSchema.optional(),
    departmentId: objectIdSchema.optional(),
    currentSemester: z.number().int().min(1).max(12).optional(),
    status: z.enum(STUDENT_STATUS).optional(),
  }),
});
export type BulkUpdateStudentsInput = z.infer<typeof bulkUpdateStudentsSchema>;

export const importStudentRowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  phone: z.string().trim().optional().nullable(),
  rollNumber: z.string().trim().min(1).max(40),
  registerNumber: z.string().trim().max(40).optional().nullable(),
  // Optional in the file: colleges that do not track it separately fall back
  // to the roll number rather than being blocked at import.
  admissionNumber: z.string().trim().max(40).optional().nullable(),
  departmentCode: z.string().trim().min(1).max(20),
  batchCode: z.string().trim().min(1).max(20),
  admissionDate: z.string().trim().min(1),
  currentSemester: z.coerce.number().int().min(1).max(12).optional(),
  dateOfBirth: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  tenthPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  twelfthPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  currentCgpa: z.coerce.number().min(0).max(10).optional().nullable(),
  guardianName: z.string().trim().optional().nullable(),
  guardianPhone: z.string().trim().optional().nullable(),
});
export type ImportStudentRow = z.infer<typeof importStudentRowSchema>;

export const importStudentsQuerySchema = z.object({
  dryRun: booleanQuery.default(true),
});
