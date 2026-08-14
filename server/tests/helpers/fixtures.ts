import { ROLE_KEYS, type RoleKey } from '@peacefic/shared';
import type { Application } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

import { BatchModel } from '@/models/batch.model';
import { CollegeModel } from '@/models/college.model';
import { DepartmentModel } from '@/models/department.model';
import { FacultyModel } from '@/models/faculty.model';
import { RoleModel } from '@/models/role.model';
import { UserModel } from '@/models/user.model';
import { hashPassword } from '@/utils/crypto';

export interface TenantFixture {
  collegeId: string;
  departmentId: string;
  batchId: string;
  adminEmail: string;
  adminPassword: string;
  adminUserId: string;
  token: string;
}

const PASSWORD = 'CorrectHorse9';

/**
 * Builds a usable tenant directly through the models — faster and less brittle
 * than driving the registration and approval flow for every test that just
 * needs somewhere to put a student.
 */
export async function createTenant(
  app: Application,
  options: { code?: string; adminEmail?: string } = {},
): Promise<TenantFixture> {
  const code = options.code ?? 'PIT';
  const adminEmail = options.adminEmail ?? `admin.${code.toLowerCase()}@example.edu`;

  const college = await CollegeModel.create({
    name: `${code} Institute of Technology`,
    code,
    type: 'engineering',
    establishedYear: 2001,
    email: `info.${code.toLowerCase()}@example.edu`,
    phone: '+919876543210',
    address: {
      line1: '1 Campus Road',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '641004',
    },
    status: 'active',
    primaryContact: {
      name: 'Asha Rao',
      email: adminEmail,
      phone: '+919812345678',
      designation: 'Registrar',
    },
  });

  const adminRole = await RoleModel.findOne({ key: ROLE_KEYS.COLLEGE_ADMIN, collegeId: null }).exec();
  if (!adminRole) throw new Error('Reference data not seeded — call seedReferenceData() first');

  const admin = await UserModel.create({
    email: adminEmail,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Asha',
    lastName: 'Rao',
    collegeId: college._id,
    roleId: adminRole._id,
    status: 'active',
    emailVerifiedAt: new Date(),
  });

  const department = await DepartmentModel.create({
    collegeId: college._id,
    name: 'Computer Science and Engineering',
    code: 'CSE',
    status: 'active',
  });

  const batch = await BatchModel.create({
    collegeId: college._id,
    departmentId: department._id,
    name: 'CSE 2022-2026 Section A',
    code: 'CSE-22-A',
    admissionYear: 2022,
    graduationYear: 2026,
    currentSemester: 5,
    capacity: 60,
    status: 'active',
  });

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password: PASSWORD })
    .expect(200);

  return {
    collegeId: String(college._id),
    departmentId: String(department._id),
    batchId: String(batch._id),
    adminEmail,
    adminPassword: PASSWORD,
    adminUserId: String(admin._id),
    token: login.body.data.accessToken as string,
  };
}

/** Creates a signed-in user in an existing tenant, with an optional faculty record. */
export async function createStaffUser(
  app: Application,
  tenant: TenantFixture,
  options: {
    roleKey: RoleKey;
    email: string;
    employeeId?: string;
    assignedBatchIds?: string[];
    departmentId?: string;
  },
): Promise<{ token: string; userId: string; facultyId: string | null }> {
  const role = await RoleModel.findOne({ key: options.roleKey, collegeId: null }).exec();
  if (!role) throw new Error(`Role ${options.roleKey} not seeded`);

  const user = await UserModel.create({
    email: options.email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Staff',
    lastName: 'Member',
    collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
    roleId: role._id,
    status: 'active',
    emailVerifiedAt: new Date(),
  });

  let facultyId: string | null = null;

  if (options.roleKey !== ROLE_KEYS.STUDENT) {
    const faculty = await FacultyModel.create({
      collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
      userId: user._id,
      departmentId: new mongoose.Types.ObjectId(options.departmentId ?? tenant.departmentId),
      employeeId: options.employeeId ?? `EMP${Date.now() % 100000}`,
      designation: 'Assistant Professor',
      joiningDate: new Date('2019-07-15'),
      assignedBatchIds: (options.assignedBatchIds ?? []).map(
        (id) => new mongoose.Types.ObjectId(id),
      ),
      status: 'active',
    });
    facultyId = String(faculty._id);
  }

  if (options.roleKey === ROLE_KEYS.HOD) {
    await DepartmentModel.updateOne(
      { _id: options.departmentId ?? tenant.departmentId },
      { $set: { hodId: user._id } },
    ).exec();
  }

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: options.email, password: PASSWORD })
    .expect(200);

  return { token: login.body.data.accessToken as string, userId: String(user._id), facultyId };
}

/**
 * A platform administrator: the wildcard role, and **no college of its own**.
 *
 * Deliberately created without a `collegeId`, because that is what the real
 * bootstrap seeder produces and it is the condition the review routes have to
 * cope with — every tenant-scoped repository yields nothing for this account.
 */
export async function createPlatformAdmin(
  app: Application,
  email = 'platform.admin@peacefic.test',
): Promise<{ token: string; userId: string }> {
  const role = await RoleModel.findOne({ key: ROLE_KEYS.PLATFORM_ADMIN, collegeId: null }).exec();
  if (!role) throw new Error('platform_admin role not seeded');

  const user = await UserModel.create({
    email,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Platform',
    lastName: 'Administrator',
    collegeId: null,
    roleId: role._id,
    status: 'active',
    emailVerifiedAt: new Date(),
  });

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);

  return { token: login.body.data.accessToken as string, userId: String(user._id) };
}

export function studentPayload(
  tenant: TenantFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged = {
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera.iyer@example.edu',
    phone: '+919812345678',
    departmentId: tenant.departmentId,
    batchId: tenant.batchId,
    rollNumber: 'CS22B001',
    admissionDate: '2022-08-01',
    currentSemester: 5,
    gender: 'female',
    academics: { currentCgpa: 8.6, activeBacklogs: 0, totalBacklogs: 0, yearGap: 0 },
    status: 'active',
    sendInvite: false,
    ...overrides,
  } as Record<string, unknown>;

  // Derived after the merge so a test that overrides only the roll number
  // still gets a unique admission number rather than colliding.
  merged.admissionNumber ??= `ADM-${String(merged.rollNumber)}`;

  return merged;
}

export function facultyPayload(
  tenant: TenantFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi.kumar@example.edu',
    departmentId: tenant.departmentId,
    employeeId: 'EMP1042',
    designation: 'Assistant Professor',
    employmentType: 'permanent',
    type: 'faculty',
    roleKey: 'faculty',
    joiningDate: '2019-07-15',
    experienceYears: 6,
    qualifications: [],
    specializations: [],
    assignedBatchIds: [],
    status: 'active',
    sendInvite: false,
    ...overrides,
  };
}
