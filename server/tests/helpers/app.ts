import type { RegisterCollegeInput } from '@peacefic/shared';
import type { Application } from 'express';

import { createApp } from '@/app';
import { runSeed } from '@/database/seeders';
import { CollegeModel } from '@/models/college.model';
import { OtpModel } from '@/models/otp.model';
import { UserModel } from '@/models/user.model';

let cachedApp: Application | null = null;

export function testApp(): Application {
  cachedApp ??= createApp();
  return cachedApp;
}

export async function seedReferenceData(): Promise<void> {
  await runSeed();
}

export function collegeRegistrationPayload(
  overrides: Partial<RegisterCollegeInput['college']> = {},
  adminOverrides: Partial<RegisterCollegeInput['admin']> = {},
): RegisterCollegeInput {
  return {
    college: {
      name: 'Peacefic Institute of Technology',
      code: 'PIT',
      type: 'engineering',
      affiliatedTo: 'Anna University',
      establishedYear: 2001,
      website: 'https://example.edu',
      email: 'info@example.edu',
      phone: '+919876543210',
      address: {
        line1: '1 Campus Road',
        line2: null,
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        country: 'India',
        pincode: '641004',
      },
      ...overrides,
    },
    admin: {
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha.rao@example.edu',
      phone: '+919812345678',
      designation: 'Registrar',
      password: 'CorrectHorse9',
      confirmPassword: 'CorrectHorse9',
      ...adminOverrides,
    },
    acceptTerms: true,
  } as RegisterCollegeInput;
}

/**
 * Pulls the plaintext OTP is impossible by design (it is hashed at rest), so
 * tests read the record and re-issue a known code instead.
 */
export async function forceOtp(identifier: string, purpose: string, code = '123456'): Promise<void> {
  const bcrypt = await import('bcryptjs');
  await OtpModel.updateOne(
    { identifier: identifier.toLowerCase(), purpose, consumedAt: null },
    { $set: { codeHash: await bcrypt.hash(code, 10), attempts: 0 } },
  ).exec();
}

/** Moves a registered college and its admin into the post-approval state. */
export async function approveCollege(adminEmail: string): Promise<void> {
  const user = await UserModel.findOne({ email: adminEmail.toLowerCase() }).exec();
  if (!user) throw new Error(`No user for ${adminEmail}`);

  await CollegeModel.updateOne(
    { _id: user.collegeId },
    { $set: { status: 'active', approvedAt: new Date() } },
  ).exec();

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { status: 'active', emailVerifiedAt: new Date() } },
  ).exec();
}

export function extractRefreshCookie(setCookie: string[] | undefined): string | null {
  if (!setCookie) return null;
  const cookie = setCookie.find((c) => c.startsWith('refreshToken='));
  return cookie ? (cookie.split(';')[0] ?? null) : null;
}
