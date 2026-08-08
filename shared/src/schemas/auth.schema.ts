import { z } from 'zod';

import { COLLEGE_TYPE, THEME } from '../constants/enums';
import { REGEX } from '../constants/regex';

import {
  addressSchema,
  emailSchema,
  objectIdSchema,
  otpSchema,
  passwordSchema,
  phoneSchema,
} from './common.schema';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
  rememberMe: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerCollegeSchema = z
  .object({
    college: z.object({
      name: z.string().trim().min(3, 'College name is required').max(200),
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(REGEX.code, 'Use 2-20 uppercase letters or digits'),
      type: z.enum(COLLEGE_TYPE),
      affiliatedTo: z.string().trim().max(200).optional().nullable(),
      establishedYear: z
        .number()
        .int()
        .min(1800)
        .max(new Date().getFullYear()),
      website: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
      email: emailSchema,
      phone: phoneSchema,
      address: addressSchema,
    }),
    admin: z.object({
      firstName: z.string().trim().min(1, 'First name is required').max(80),
      lastName: z.string().trim().min(1, 'Last name is required').max(80),
      email: emailSchema,
      phone: phoneSchema,
      designation: z.string().trim().min(2, 'Designation is required').max(120),
      password: passwordSchema,
      confirmPassword: z.string(),
    }),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to continue' }),
    }),
  })
  .refine((data) => data.admin.password === data.admin.confirmPassword, {
    message: 'Passwords do not match',
    path: ['admin', 'confirmPassword'],
  });
export type RegisterCollegeInput = z.infer<typeof registerCollegeSchema>;

export const registerStudentSchema = z
  .object({
    joinCode: z.string().trim().min(6, 'Join code is required').max(32),
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().min(1, 'Last name is required').max(80),
    email: emailSchema,
    phone: phoneSchema,
    rollNumber: z.string().trim().min(1, 'Roll number is required').max(40),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;

export const verifyEmailSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['email_verification', 'password_reset']),
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Reset token is required'),
    otp: otpSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'The new password must differ from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const acceptInviteSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updatePreferencesSchema = z.object({
  theme: z.enum(THEME).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: phoneSchema.optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const revokeSessionSchema = z.object({ id: objectIdSchema });
