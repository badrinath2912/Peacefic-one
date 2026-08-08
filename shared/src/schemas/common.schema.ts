import { z } from 'zod';

import { REGEX } from '../constants/regex';

export const objectIdSchema = z
  .string()
  .regex(REGEX.objectId, 'Must be a valid identifier');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .regex(REGEX.email, 'Must be a valid email address');

export const phoneSchema = z
  .string()
  .trim()
  .regex(REGEX.phoneE164, 'Must be a valid phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const otpSchema = z.string().regex(REGEX.otp, 'OTP must be 6 digits');

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(REGEX.code, 'Use 2-20 uppercase letters, digits, hyphens or underscores');

export const time24Schema = z.string().regex(REGEX.time24, 'Must be HH:mm');

export const academicYearSchema = z
  .string()
  .regex(REGEX.academicYear, 'Must be in the form 2025-2026');

export const isoDateSchema = z.coerce.date();

export const percentageSchema = z.number().min(0).max(100);

/**
 * Query strings carry booleans as text, and `z.coerce.boolean()` is wrong for
 * them: it applies `Boolean(value)`, so the string "false" becomes `true`.
 * Always use this for a boolean that arrives in a query string.
 */
export const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const addressSchema = z.object({
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1, 'City is required').max(100),
  district: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().min(1, 'State is required').max(100),
  country: z.string().trim().min(1, 'Country is required').max(100).default('India'),
  pincode: z.string().trim().regex(REGEX.pincode, 'Must be a valid postal code'),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const attachmentSchema = z.object({
  url: z.string().url(),
  fileName: z.string().min(1).max(255),
  fileKey: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(120),
});

export type AttachmentInput = z.infer<typeof attachmentSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  fields: z.string().trim().max(500).optional(),
  include: z.string().trim().max(500).optional(),
  cursor: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const idParamSchema = z.object({ id: objectIdSchema });

export const bulkIdsSchema = z.object({
  ids: z.array(objectIdSchema).min(1, 'Select at least one item').max(500),
});

export function makeBulkUpdateSchema<T extends z.ZodTypeAny>(patch: T) {
  return z.object({
    ids: z.array(objectIdSchema).min(1).max(500),
    patch,
  });
}

export const softDeleteResponseSchema = z.object({
  id: objectIdSchema,
  deletedAt: z.string(),
});
