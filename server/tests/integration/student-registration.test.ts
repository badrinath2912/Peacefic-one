import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { CollegeModel } from '@/models/college.model';
import { StudentModel } from '@/models/student.model';
import { StudentRegistrationModel } from '@/models/student-registration.model';
import { UserModel } from '@/models/user.model';

import { forceOtp, seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';
const PASSWORD = 'CorrectHorse9';

/**
 * Student self-registration and College Admin approval, end to end over HTTP.
 *
 * The whole flow was live-verified when it was built but had no automated
 * coverage, which made every one of its guarantees a claim rather than a fact.
 * These tests go through the real routes, middleware, services and repositories
 * — nothing under test is mocked or called directly.
 *
 * The load-bearing guarantees, and why each matters:
 *
 *   - the college comes from the **join code**, never the request, so a code
 *     cannot create an account under another institution;
 *   - a `Student` is created **only at approval**, because it needs a department,
 *     batch, admission number and date that an applicant cannot know;
 *   - verification and approval are **two separate gates**, and passing the first
 *     does not open the second;
 *   - the applicant's password survives approval untouched — they chose it at
 *     registration and are waiting to use it.
 */
describe('student self-registration and approval API', () => {
  const app = testApp();

  let collegeA: TenantFixture;
  let collegeB: TenantFixture;
  let joinCodeA: string;
  let joinCodeB: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Turns a tenant into one that accepts self-registration. */
  const enableSelfRegistration = async (collegeId: string, joinCode: string) => {
    await CollegeModel.updateOne(
      { _id: collegeId },
      { $set: { 'settings.joinCode': joinCode, 'settings.allowStudentSelfRegistration': true } },
    ).exec();
  };

  const registrationPayload = (overrides: Record<string, unknown> = {}) => ({
    joinCode: joinCodeA,
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera.iyer@example.edu',
    phone: '+919812345670',
    rollNumber: 'CS22B900',
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides,
  });

  const register = (overrides: Record<string, unknown> = {}) =>
    request(app).post(`${API}/auth/register/student`).send(registrationPayload(overrides));

  /** Registers and verifies, leaving the applicant at `pending_approval`. */
  const registerAndVerify = async (overrides: Record<string, unknown> = {}) => {
    const payload = registrationPayload(overrides);
    await request(app).post(`${API}/auth/register/student`).send(payload).expect(201);
    await forceOtp(String(payload.email), 'email_verification', '123456');
    await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ email: payload.email, otp: '123456' })
      .expect(200);

    const registration = await StudentRegistrationModel.findOne({
      email: String(payload.email).toLowerCase(),
    }).exec();

    return { payload, registrationId: String(registration?._id) };
  };

  const approvalBody = (tenant: TenantFixture, overrides: Record<string, unknown> = {}) => ({
    departmentId: tenant.departmentId,
    batchId: tenant.batchId,
    admissionNumber: 'ADM-CS22B900',
    admissionDate: '2022-08-01',
    ...overrides,
  });

  beforeEach(async () => {
    await seedReferenceData();
    collegeA = await createTenant(app, { code: 'AAA', adminEmail: 'admin.aaa@example.edu' });
    collegeB = await createTenant(app, { code: 'BBB', adminEmail: 'admin.bbb@example.edu' });

    joinCodeA = 'JOINAAA1';
    joinCodeB = 'JOINBBB1';
    await enableSelfRegistration(collegeA.collegeId, joinCodeA);
    await enableSelfRegistration(collegeB.collegeId, joinCodeB);
  });

  /* ========================= 1. self-registration ========================== */

  describe('registration', () => {
    it('accepts a valid join code and returns no secrets', async () => {
      const response = await register().expect(201);

      expect(response.body.data.email).toBe('meera.iyer@example.edu');
      expect(JSON.stringify(response.body)).not.toMatch(/password|passwordHash|joinCode/i);
    });

    it('rejects an unknown join code', async () => {
      const response = await register({ joinCode: 'NOTREAL1' }).expect(400);
      expect(response.body.error.details[0].field).toBe('joinCode');
    });

    /**
     * The defect this guards against: a code issued by one institution creating
     * an account inside another.
     */
    it('binds the account to the college that owns the join code', async () => {
      await register({ joinCode: joinCodeB }).expect(201);

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec();
      expect(String(user?.collegeId)).toBe(collegeB.collegeId);
      expect(String(user?.collegeId)).not.toBe(collegeA.collegeId);
    });

    it('refuses a college that has self-registration switched off', async () => {
      await CollegeModel.updateOne(
        { _id: collegeA.collegeId },
        { $set: { 'settings.allowStudentSelfRegistration': false } },
      ).exec();

      const response = await register().expect(400);
      // Same message as an unknown code: distinguishing them would let anyone
      // probe which institutions have registration open.
      expect(response.body.error.details[0].field).toBe('joinCode');
    });

    it('refuses a college that is not active', async () => {
      await CollegeModel.updateOne(
        { _id: collegeA.collegeId },
        { $set: { status: 'suspended' } },
      ).exec();

      await register().expect(400);
    });

    it('rejects a duplicate email', async () => {
      await register().expect(201);
      await register({ rollNumber: 'CS22B901' }).expect(409);
    });

    it('rejects a roll number already awaiting approval in the same college', async () => {
      await register().expect(201);
      await register({ email: 'other@example.edu' }).expect(409);
    });

    /** The same roll number in a different institution is not a conflict. */
    it('allows the same roll number in a different college', async () => {
      await register().expect(201);
      await register({ joinCode: joinCodeB, email: 'other@example.edu' }).expect(201);
    });

    it.each([
      ['email', { email: 'not-an-email' }],
      ['password', { password: 'short', confirmPassword: 'short' }],
      ['mismatched confirmation', { confirmPassword: 'DifferentPass9' }],
      ['missing roll number', { rollNumber: '' }],
    ])('rejects an invalid %s', async (_label, override) => {
      await register(override).expect(400);
    });

    it('creates a pending user and registration, and no Student', async () => {
      await register().expect(201);

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec();
      const registration = await StudentRegistrationModel.findOne({
        email: 'meera.iyer@example.edu',
      }).exec();

      expect(user?.status).toBe('pending_verification');
      expect(registration?.approvalStatus).toBe('pending');
      // The point of the design: no half-built Student exists at any stage.
      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('stores no password material on the registration record', async () => {
      await register().expect(201);

      const raw = await StudentRegistrationModel.collection.findOne({
        email: 'meera.iyer@example.edu',
      });

      expect(raw).toBeTruthy();
      expect(raw).not.toHaveProperty('password');
      expect(raw).not.toHaveProperty('passwordHash');
    });

    /* ------------------------- mass assignment ------------------------- */

    it('ignores client-supplied privileged fields', async () => {
      const platformRole = await UserModel.db
        .collection('roles')
        .findOne({ key: ROLE_KEYS.PLATFORM_ADMIN, collegeId: null });

      await register({
        collegeId: collegeB.collegeId,
        roleId: String(platformRole?._id),
        status: 'active',
        approvalStatus: 'approved',
        permissions: ['*:*'],
        extraPermissions: ['*:*'],
        emailVerifiedAt: new Date().toISOString(),
        mustChangePassword: false,
        passwordHash: 'injected',
      }).expect(201);

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();
      const registration = await StudentRegistrationModel.findOne({
        email: 'meera.iyer@example.edu',
      }).exec();
      const studentRole = await UserModel.db
        .collection('roles')
        .findOne({ key: ROLE_KEYS.STUDENT, collegeId: null });

      // Every one of these is server-controlled, whatever the client sent.
      expect(String(user?.collegeId)).toBe(collegeA.collegeId);
      expect(String(user?.roleId)).toBe(String(studentRole?._id));
      expect(user?.status).toBe('pending_verification');
      expect(user?.emailVerifiedAt).toBeNull();
      expect(user?.extraPermissions).toEqual([]);
      expect(user?.passwordHash).not.toBe('injected');
      expect(registration?.approvalStatus).toBe('pending');
    });
  });

  /* ========================== 2. email verification ======================== */

  describe('email verification', () => {
    it('moves a verified applicant to pending_approval, not active', async () => {
      await register().expect(201);
      await forceOtp('meera.iyer@example.edu', 'email_verification', '123456');

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: 'meera.iyer@example.edu', otp: '123456' })
        .expect(200);

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec();
      expect(user?.status).toBe('pending_approval');
      expect(user?.emailVerifiedAt).toBeTruthy();
      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('rejects an incorrect code', async () => {
      await register().expect(201);
      await forceOtp('meera.iyer@example.edu', 'email_verification', '123456');

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: 'meera.iyer@example.edu', otp: '999999' })
        .expect(400);
    });

    it('rejects a code that has already been consumed', async () => {
      await register().expect(201);
      await forceOtp('meera.iyer@example.edu', 'email_verification', '123456');

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: 'meera.iyer@example.edu', otp: '123456' })
        .expect(200);

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: 'meera.iyer@example.edu', otp: '123456' })
        .expect(400);
    });

    /** The two gates are independent: clearing one must not clear the other. */
    it('refuses login before verification and again before approval', async () => {
      await register().expect(201);

      const beforeVerify = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'meera.iyer@example.edu', password: PASSWORD })
        .expect(403);
      expect(String(beforeVerify.body.error.message)).toMatch(/verify your email/i);

      await forceOtp('meera.iyer@example.edu', 'email_verification', '123456');
      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: 'meera.iyer@example.edu', otp: '123456' })
        .expect(200);

      const afterVerify = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'meera.iyer@example.edu', password: PASSWORD })
        .expect(403);
      expect(String(afterVerify.body.error.message)).toMatch(/under review/i);
    });
  });

  /* ========================= 3. the pending queue ========================== */

  describe('pending registrations', () => {
    it('lists the reviewing college’s own pending registrations', async () => {
      await registerAndVerify();

      const response = await request(app)
        .get(`${API}/students/registrations?approvalStatus=pending`)
        .set(auth(collegeA.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].rollNumber).toBe('CS22B900');
    });

    /** The isolation guarantee, asserted from the other side of the boundary. */
    it('hides another college’s registrations entirely', async () => {
      await registerAndVerify();

      const response = await request(app)
        .get(`${API}/students/registrations?approvalStatus=pending`)
        .set(auth(collegeB.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('refuses the queue to a student', async () => {
      const student = await createStaffUser(app, collegeA, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.aaa@example.edu',
      });

      await request(app)
        .get(`${API}/students/registrations`)
        .set(auth(student.token))
        .expect(403);
    });

    it('refuses the queue to an unauthenticated caller', async () => {
      await request(app).get(`${API}/students/registrations`).expect(401);
    });

    it('ignores a collegeId supplied by the client', async () => {
      await registerAndVerify();

      const response = await request(app)
        .get(`${API}/students/registrations?approvalStatus=pending&collegeId=${collegeA.collegeId}`)
        .set(auth(collegeB.token))
        .expect(200);

      // College B asked for College A's tenant and still sees nothing.
      expect(response.body.data).toHaveLength(0);
    });
  });

  /* ============================== 4. approval ============================= */

  describe('approval', () => {
    it('creates the Student, links the account and lets them sign in', async () => {
      const { registrationId } = await registerAndVerify();

      const response = await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA))
        .expect(201);

      expect(response.body.data.rollNumber).toBe('CS22B900');

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec();
      const student = await StudentModel.findOne({ rollNumber: 'CS22B900' }).exec();
      const registration = await StudentRegistrationModel.findById(registrationId).exec();

      expect(user?.status).toBe('active');
      expect(String(student?.userId)).toBe(String(user?._id));
      expect(String(student?.departmentId)).toBe(collegeA.departmentId);
      expect(String(student?.batchId)).toBe(collegeA.batchId);
      expect(student?.admissionNumber).toBe('ADM-CS22B900');
      expect(student?.admissionDate).toBeTruthy();
      expect(registration?.approvalStatus).toBe('approved');
      expect(String(registration?.studentId)).toBe(String(student?._id));
      expect(registration?.reviewedBy).toBeTruthy();

      await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'meera.iyer@example.edu', password: PASSWORD })
        .expect(200);
    });

    /**
     * The applicant chose this password at registration and has been waiting to
     * use it. Approval must not replace it with an invite placeholder.
     */
    it('leaves the applicant’s password untouched', async () => {
      const { registrationId } = await registerAndVerify();

      const before = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA))
        .expect(201);

      const after = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();

      expect(after?.passwordHash).toBe(before?.passwordHash);
    });

    it.each([
      ['departmentId', 'departmentId'],
      ['batchId', 'batchId'],
      ['admissionNumber', 'admissionNumber'],
      ['admissionDate', 'admissionDate'],
    ])('requires %s', async (_label, field) => {
      const { registrationId } = await registerAndVerify();
      const body = approvalBody(collegeA) as Record<string, unknown>;
      delete body[field];

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(body)
        .expect(400);
    });

    it('refuses a batch that belongs to another department', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA, { batchId: collegeB.batchId }))
        .expect((response) => {
          // Either refused as cross-tenant or as a department mismatch; the
          // requirement is only that it never succeeds.
          expect(response.status).toBeGreaterThanOrEqual(400);
        });

      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('refuses a department from another tenant', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA, { departmentId: collegeB.departmentId }))
        .expect((response) => expect(response.status).toBeGreaterThanOrEqual(400));

      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('rejects a duplicate admission number', async () => {
      const first = await registerAndVerify();
      await request(app)
        .post(`${API}/students/registrations/${first.registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA))
        .expect(201);

      const second = await registerAndVerify({
        email: 'second@example.edu',
        rollNumber: 'CS22B901',
      });

      await request(app)
        .post(`${API}/students/registrations/${second.registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA, { rollNumber: 'CS22B901' }))
        .expect(409);
    });

    it('refuses to approve the same registration twice', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA))
        .expect(201);

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA, { admissionNumber: 'ADM-OTHER' }))
        .expect(422);

      expect(await StudentModel.countDocuments({})).toBe(1);
    });

    it('refuses to approve a registration that was already rejected', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeA.token))
        .send({ reason: 'Roll number does not match our records.' })
        .expect(200);

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send(approvalBody(collegeA))
        .expect(422);

      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    /** The isolation guarantee on a write, not just a read. */
    it('cannot approve another college’s registration', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeB.token))
        .send(approvalBody(collegeB))
        .expect(404);

      const registration = await StudentRegistrationModel.findById(registrationId).exec();
      expect(registration?.approvalStatus).toBe('pending');
      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('refuses approval to a student', async () => {
      const { registrationId } = await registerAndVerify();
      const student = await createStaffUser(app, collegeA, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.aaa@example.edu',
      });

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(student.token))
        .send(approvalBody(collegeA))
        .expect(403);
    });

    it('ignores privileged fields sent alongside a legitimate approval', async () => {
      const { registrationId } = await registerAndVerify();
      const platformRole = await UserModel.db
        .collection('roles')
        .findOne({ key: ROLE_KEYS.PLATFORM_ADMIN, collegeId: null });

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/approve`)
        .set(auth(collegeA.token))
        .send({
          ...approvalBody(collegeA),
          roleId: String(platformRole?._id),
          collegeId: collegeB.collegeId,
          permissions: ['*:*'],
          extraPermissions: ['*:*'],
          passwordHash: 'injected',
          status: 'suspended',
        })
        .expect(201);

      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();
      const studentRole = await UserModel.db
        .collection('roles')
        .findOne({ key: ROLE_KEYS.STUDENT, collegeId: null });

      expect(String(user?.roleId)).toBe(String(studentRole?._id));
      expect(String(user?.collegeId)).toBe(collegeA.collegeId);
      expect(user?.extraPermissions).toEqual([]);
      expect(user?.passwordHash).not.toBe('injected');
      expect(user?.status).toBe('active');
    });
  });

  /* ============================= 5. rejection ============================= */

  describe('rejection', () => {
    it('rejects with a reason and creates no Student', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeA.token))
        .send({ reason: 'Could not verify the roll number.' })
        .expect(200);

      const registration = await StudentRegistrationModel.findById(registrationId).exec();
      const user = await UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec();

      expect(registration?.approvalStatus).toBe('rejected');
      expect(registration?.rejectionReason).toBe('Could not verify the roll number.');
      expect(await StudentModel.countDocuments({})).toBe(0);
      // Archived rather than deleted: the email stays claimed and the decision
      // stays auditable, and login refuses `archived`.
      expect(user?.status).toBe('archived');
    });

    it('requires a substantive reason', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeA.token))
        .send({ reason: 'no' })
        .expect(400);
    });

    it('leaves a rejected applicant unable to sign in', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeA.token))
        .send({ reason: 'Could not verify the roll number.' })
        .expect(200);

      await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'meera.iyer@example.edu', password: PASSWORD })
        .expect(403);
    });

    it('does not change the applicant’s password', async () => {
      const { registrationId } = await registerAndVerify();
      const before = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeA.token))
        .send({ reason: 'Could not verify the roll number.' })
        .expect(200);

      const after = await UserModel.findOne({ email: 'meera.iyer@example.edu' })
        .select('+passwordHash')
        .exec();

      expect(after?.passwordHash).toBe(before?.passwordHash);
    });

    it('cannot reject another college’s registration', async () => {
      const { registrationId } = await registerAndVerify();

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(collegeB.token))
        .send({ reason: 'Trying to reject a rival institution.' })
        .expect(404);

      const registration = await StudentRegistrationModel.findById(registrationId).exec();
      expect(registration?.approvalStatus).toBe('pending');
    });

    it('refuses rejection to a student', async () => {
      const { registrationId } = await registerAndVerify();
      const student = await createStaffUser(app, collegeA, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.aaa@example.edu',
      });

      await request(app)
        .post(`${API}/students/registrations/${registrationId}/reject`)
        .set(auth(student.token))
        .send({ reason: 'Trying to reject myself out of spite.' })
        .expect(403);
    });
  });

  /* ============================ 6. authorization =========================== */

  describe('authorization', () => {
    /** `student:approve` is held by `hod` as well as `college_admin`. */
    it('allows a head of department to review', async () => {
      await registerAndVerify();
      const hod = await createStaffUser(app, collegeA, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.aaa@example.edu',
      });

      await request(app)
        .get(`${API}/students/registrations?approvalStatus=pending`)
        .set(auth(hod.token))
        .expect(200);
    });

    it('refuses review to a placement officer, who does not hold the permission', async () => {
      const officer = await createStaffUser(app, collegeA, {
        roleKey: ROLE_KEYS.PLACEMENT_OFFICER,
        email: 'po.aaa@example.edu',
      });

      await request(app)
        .get(`${API}/students/registrations`)
        .set(auth(officer.token))
        .expect(403);
    });
  });
});
