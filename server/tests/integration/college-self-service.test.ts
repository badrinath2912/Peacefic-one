import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { CollegeModel } from '@/models/college.model';
import { RoleModel } from '@/models/role.model';
import { UserModel } from '@/models/user.model';
import { hashPassword } from '@/utils/crypto';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createPlatformAdmin,
  createStaffUser,
  createTenant,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

/**
 * `GET /colleges/me`, `PATCH /colleges/me`, `PATCH /colleges/me/settings`.
 *
 * `CollegeRepository` is `tenantScoped: false` — a college *is* the tenant, so
 * there is no column to scope by. Isolation comes entirely from the service
 * reading the id off the request context, and no route accepts a college id.
 * These tests exist mainly to hold that line.
 */
describe('college self-service API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  /** `joinCode` is `select: false`, so it must be asked for explicitly. */
  const storedFor = async (collegeId: string) =>
    CollegeModel.findById(collegeId).select('+settings.joinCode').exec();

  /* ==================================== read ================================= */

  describe('reading', () => {
    it('returns the caller\'s own college', async () => {
      const response = await request(app)
        .get(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.code).toBe('PIT');
      expect(response.body.data.name).toBe('PIT Institute of Technology');
      expect(response.body.data.settings.attendanceThresholdPercent).toBe(75);
    });

    /**
     * Every role holds `college:read` — a student needs to see the attendance
     * threshold that governs them.
     */
    it('allows every standard role to read it', async () => {
      for (const roleKey of [ROLE_KEYS.HOD, ROLE_KEYS.FACULTY, ROLE_KEYS.PLACEMENT_OFFICER]) {
        const staff = await createStaffUser(app, tenant, {
          roleKey,
          email: `${roleKey}.college@example.edu`,
        });

        await request(app).get(`${API}/colleges/me`).set(auth(staff.token)).expect(200);
      }
    });

    /** The join code is an open door into the tenant if it ever leaks. */
    it('never returns the join code', async () => {
      await CollegeModel.updateOne(
        { _id: tenant.collegeId },
        { $set: { 'settings.joinCode': 'SECRET-JOIN-CODE' } },
      ).exec();

      const response = await request(app)
        .get(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('SECRET-JOIN-CODE');
      expect(response.body.data.settings.joinCode).toBeUndefined();
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app).get(`${API}/colleges/me`).expect(401);
    });

    /** Two tenants, two answers — with no id in the request either way. */
    it('gives each tenant only its own record', async () => {
      const other = await createTenant(app, { code: 'KCT', adminEmail: 'admin.kct@example.edu' });

      const ours = await request(app).get(`${API}/colleges/me`).set(auth(tenant.token)).expect(200);
      const theirs = await request(app).get(`${API}/colleges/me`).set(auth(other.token)).expect(200);

      expect(ours.body.data.code).toBe('PIT');
      expect(theirs.body.data.code).toBe('KCT');
    });
  });

  /* =================================== profile =============================== */

  describe('profile', () => {
    it('updates permitted fields', async () => {
      const response = await request(app)
        .patch(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .send({ name: 'PIT Institute', website: 'https://pit.example.edu', timezone: 'Asia/Kolkata' })
        .expect(200);

      expect(response.body.data.name).toBe('PIT Institute');

      const stored = await storedFor(tenant.collegeId);
      expect(stored?.name).toBe('PIT Institute');
      expect(stored?.website).toBe('https://pit.example.edu');
    });

    it('leaves unspecified fields unchanged', async () => {
      const before = await storedFor(tenant.collegeId);

      await request(app)
        .patch(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .send({ name: 'Renamed Institute' })
        .expect(200);

      const after = await storedFor(tenant.collegeId);
      expect(after?.name).toBe('Renamed Institute');
      expect(after?.email).toBe(before?.email);
      expect(after?.phone).toBe(before?.phone);
      expect(after?.address.city).toBe(before?.address.city);
    });

    /**
     * `code` is the tenant's identity and fixed at registration; `status`,
     * `approvedBy` and `stats` are maintained by the platform and by counters.
     * The validator strips them and the service copies fields one at a time.
     */
    it('cannot modify protected fields', async () => {
      const before = await storedFor(tenant.collegeId);

      await request(app)
        .patch(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .send({
          name: 'Legitimate Rename',
          code: 'HACKED',
          status: 'suspended',
          approvedBy: null,
          approvedAt: null,
          rejectionReason: 'nope',
          stats: { totalStudents: 9999, totalFaculty: 0, totalDepartments: 0, totalBatches: 0 },
          settings: { attendanceThresholdPercent: 1, joinCode: 'INJECTED' },
        })
        .expect(200);

      const after = await storedFor(tenant.collegeId);

      expect(after?.name).toBe('Legitimate Rename');
      expect(after?.code).toBe('PIT');
      expect(after?.status).toBe(before?.status);
      expect(after?.stats.totalStudents).toBe(before?.stats.totalStudents);
      expect(after?.settings.attendanceThresholdPercent).toBe(75);
      expect(after?.settings.joinCode).toBe(before?.settings.joinCode ?? null);
    });

    it('rejects invalid profile data', async () => {
      for (const body of [
        { name: 'ab' },
        { email: 'not-an-email' },
        { website: 'not-a-url' },
        { academicYearStartMonth: 13 },
        { establishedYear: 1500 },
      ]) {
        await request(app)
          .patch(`${API}/colleges/me`)
          .set(auth(tenant.token))
          .send(body)
          .expect(400);
      }
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app).patch(`${API}/colleges/me`).send({ name: 'Nope' }).expect(401);
    });

    /** `college:update` is held by college_admin alone. */
    it('refuses a role without college:update', async () => {
      for (const roleKey of [ROLE_KEYS.HOD, ROLE_KEYS.FACULTY, ROLE_KEYS.PLACEMENT_OFFICER]) {
        const staff = await createStaffUser(app, tenant, {
          roleKey,
          email: `${roleKey}.update@example.edu`,
        });

        await request(app)
          .patch(`${API}/colleges/me`)
          .set(auth(staff.token))
          .send({ name: 'Not allowed' })
          .expect(403);
      }
    });

    it('cannot reach another tenant', async () => {
      const other = await createTenant(app, { code: 'KCT', adminEmail: 'admin.kct@example.edu' });

      await request(app)
        .patch(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .send({ name: 'Changed By PIT' })
        .expect(200);

      const theirs = await storedFor(other.collegeId);
      expect(theirs?.name).toBe('KCT Institute of Technology');
    });
  });

  /* =================================== settings ============================== */

  describe('settings', () => {
    it('updates settings', async () => {
      const response = await request(app)
        .patch(`${API}/colleges/me/settings`)
        .set(auth(tenant.token))
        .send({ attendanceThresholdPercent: 85, gradingScale: 'percentage' })
        .expect(200);

      expect(response.body.data.settings.attendanceThresholdPercent).toBe(85);
      expect(response.body.data.settings.gradingScale).toBe('percentage');
    });

    /**
     * Written with dot notation, so the settings not mentioned survive — and
     * so does `joinCode`, which shares the sub-document but is absent from the
     * schema entirely.
     */
    it('leaves unspecified settings and the join code unchanged', async () => {
      await CollegeModel.updateOne(
        { _id: tenant.collegeId },
        { $set: { 'settings.joinCode': 'KEEP-ME', 'settings.allowStudentSelfRegistration': true } },
      ).exec();

      await request(app)
        .patch(`${API}/colleges/me/settings`)
        .set(auth(tenant.token))
        .send({ attendanceThresholdPercent: 60 })
        .expect(200);

      const stored = await storedFor(tenant.collegeId);
      expect(stored?.settings.attendanceThresholdPercent).toBe(60);
      expect(stored?.settings.allowStudentSelfRegistration).toBe(true);
      expect(stored?.settings.gradingScale).toBe('gpa_10');
      expect(stored?.settings.joinCode).toBe('KEEP-ME');
    });

    /** The schema omits `joinCode`, so the validator strips it before arrival. */
    it('cannot set the join code', async () => {
      await CollegeModel.updateOne(
        { _id: tenant.collegeId },
        { $set: { 'settings.joinCode': 'ORIGINAL' } },
      ).exec();

      await request(app)
        .patch(`${API}/colleges/me/settings`)
        .set(auth(tenant.token))
        .send({ attendanceThresholdPercent: 70, joinCode: 'ATTACKER-CHOSEN' })
        .expect(200);

      const stored = await storedFor(tenant.collegeId);
      expect(stored?.settings.joinCode).toBe('ORIGINAL');
    });

    it('rejects invalid settings', async () => {
      for (const body of [
        { attendanceThresholdPercent: 150 },
        { attendanceThresholdPercent: -1 },
        { gradingScale: 'stars' },
        { allowStudentSelfRegistration: 'yes' },
      ]) {
        await request(app)
          .patch(`${API}/colleges/me/settings`)
          .set(auth(tenant.token))
          .send(body)
          .expect(400);
      }
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app)
        .patch(`${API}/colleges/me/settings`)
        .send({ attendanceThresholdPercent: 50 })
        .expect(401);
    });

    /** `college:settings` is held by college_admin alone. */
    it('refuses a role without college:settings', async () => {
      for (const roleKey of [ROLE_KEYS.HOD, ROLE_KEYS.FACULTY]) {
        const staff = await createStaffUser(app, tenant, {
          roleKey,
          email: `${roleKey}.settings@example.edu`,
        });

        await request(app)
          .patch(`${API}/colleges/me/settings`)
          .set(auth(staff.token))
          .send({ attendanceThresholdPercent: 50 })
          .expect(403);
      }
    });

    it('cannot reach another tenant', async () => {
      const other = await createTenant(app, { code: 'KCT', adminEmail: 'admin.kct@example.edu' });

      await request(app)
        .patch(`${API}/colleges/me/settings`)
        .set(auth(tenant.token))
        .send({ attendanceThresholdPercent: 55 })
        .expect(200);

      const theirs = await storedFor(other.collegeId);
      expect(theirs?.settings.attendanceThresholdPercent).toBe(75);
    });

    /**
     * The threshold is read live by `attendance.service`, so a change here
     * re-decides who counts as a defaulter.
     */
    it('is the value attendance actually reads', async () => {
      await request(app)
        .patch(`${API}/colleges/me/settings`)
        .set(auth(tenant.token))
        .send({ attendanceThresholdPercent: 90 })
        .expect(200);

      const response = await request(app)
        .get(`${API}/colleges/me`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.settings.attendanceThresholdPercent).toBe(90);
    });
  });
});

/**
 * `GET /colleges`, `POST /colleges/:id/approve`, `POST /colleges/:id/reject`.
 *
 * These close the loop that public registration opened: a college is created
 * `pending`, and `assertAccountUsable` refuses login while it stays that way.
 * Before these routes existed, no account anywhere could change that, so every
 * registration was a dead end.
 *
 * The boundary is `college:approve` alone — flagged dangerous in the catalogue,
 * held by `platform_admin`'s wildcard and by no other role. `CollegeRepository`
 * is `tenantScoped: false`, so nothing else narrows these reads.
 */
describe('college platform review API', () => {
  const app = testApp();
  let tenant: TenantFixture;
  let platform: { token: string; userId: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const PENDING_PASSWORD = 'CorrectHorse9';

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    platform = await createPlatformAdmin(app);
  });

  /** A registration awaiting review, whose admin is otherwise ready to sign in. */
  const createPendingCollege = async (code = 'NEWC') => {
    const adminEmail = `admin.${code.toLowerCase()}@example.edu`;

    const college = await CollegeModel.create({
      name: `${code} College of Engineering`,
      code,
      type: 'engineering',
      establishedYear: 2010,
      email: `info.${code.toLowerCase()}@example.edu`,
      phone: '+919876543211',
      address: {
        line1: '2 Campus Road',
        city: 'Madurai',
        state: 'Tamil Nadu',
        country: 'India',
        pincode: '625001',
      },
      status: 'pending',
      primaryContact: {
        name: 'Ravi Kumar',
        email: adminEmail,
        phone: '+919812345679',
        designation: 'Principal',
      },
    });

    const role = await RoleModel.findOne({ key: ROLE_KEYS.COLLEGE_ADMIN, collegeId: null }).exec();

    // Email already verified, so the only thing blocking this admin is the
    // college's pending status — which is exactly what approval changes.
    await UserModel.create({
      email: adminEmail,
      passwordHash: await hashPassword(PENDING_PASSWORD),
      firstName: 'Ravi',
      lastName: 'Kumar',
      collegeId: college._id,
      roleId: role?._id,
      status: 'active',
      emailVerifiedAt: new Date(),
    });

    return { collegeId: String(college._id), adminEmail };
  };

  const login = (email: string) =>
    request(app).post(`${API}/auth/login`).send({ email, password: PENDING_PASSWORD });

  /* ================================= listing ================================= */

  it('lists every institution for a platform administrator', async () => {
    await createPendingCollege();

    const response = await request(app)
      .get(`${API}/colleges`)
      .set(auth(platform.token))
      .expect(200);

    const codes = (response.body.data as Array<{ code: string }>).map((row) => row.code);
    expect(codes).toEqual(expect.arrayContaining(['PIT', 'NEWC']));
  });

  it('filters the list by status', async () => {
    await createPendingCollege();

    const response = await request(app)
      .get(`${API}/colleges?status=pending`)
      .set(auth(platform.token))
      .expect(200);

    const rows = response.body.data as Array<{ code: string; status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('NEWC');
  });

  it('never returns the join code in the review list', async () => {
    const response = await request(app)
      .get(`${API}/colleges`)
      .set(auth(platform.token))
      .expect(200);

    for (const row of response.body.data as Array<{ settings?: { joinCode?: unknown } }>) {
      expect(row.settings?.joinCode).toBeUndefined();
    }
  });

  it('refuses the list to a college administrator', async () => {
    await request(app).get(`${API}/colleges`).set(auth(tenant.token)).expect(403);
  });

  it('refuses the list to an unauthenticated caller', async () => {
    await request(app).get(`${API}/colleges`).expect(401);
  });

  /* ================================ approving ================================ */

  it('approves a pending registration and records who approved it', async () => {
    const pending = await createPendingCollege();

    const response = await request(app)
      .post(`${API}/colleges/${pending.collegeId}/approve`)
      .set(auth(platform.token))
      .send({ notes: 'Verified against the AICTE listing.' })
      .expect(200);

    expect(response.body.data.status).toBe('active');

    const stored = await CollegeModel.findById(pending.collegeId).exec();
    expect(stored?.status).toBe('active');
    expect(String(stored?.approvedBy)).toBe(platform.userId);
    expect(stored?.approvedAt).toBeTruthy();
  });

  /**
   * The point of the whole feature: before approval the administrator cannot
   * sign in, and after it they can.
   */
  it('turns a blocked registration into a usable account', async () => {
    const pending = await createPendingCollege();

    const blocked = await login(pending.adminEmail);
    expect(blocked.status).toBe(403);
    expect(String(blocked.body.error.message)).toMatch(/awaiting approval/i);

    await request(app)
      .post(`${API}/colleges/${pending.collegeId}/approve`)
      .set(auth(platform.token))
      .send({})
      .expect(200);

    const allowed = await login(pending.adminEmail).expect(200);
    expect(allowed.body.data.accessToken).toBeTruthy();
  });

  it('refuses to approve a registration that is not pending', async () => {
    // `tenant` is already active.
    await request(app)
      .post(`${API}/colleges/${tenant.collegeId}/approve`)
      .set(auth(platform.token))
      .send({})
      .expect(422);
  });

  /* ================================ rejecting ================================ */

  it('rejects a registration and stores the reason', async () => {
    const pending = await createPendingCollege();

    const response = await request(app)
      .post(`${API}/colleges/${pending.collegeId}/reject`)
      .set(auth(platform.token))
      .send({ reason: 'Could not verify the affiliation certificate.' })
      .expect(200);

    expect(response.body.data.status).toBe('rejected');

    const stored = await CollegeModel.findById(pending.collegeId).exec();
    expect(stored?.rejectionReason).toBe('Could not verify the affiliation certificate.');
  });

  it('leaves a rejected institution unable to sign in', async () => {
    const pending = await createPendingCollege();

    await request(app)
      .post(`${API}/colleges/${pending.collegeId}/reject`)
      .set(auth(platform.token))
      .send({ reason: 'Could not verify the affiliation certificate.' })
      .expect(200);

    const response = await login(pending.adminEmail);
    expect(response.status).toBe(403);
    expect(String(response.body.error.message)).toMatch(/not approved/i);
  });

  // 400, not 422: this is the schema refusing the body, whereas refusing to
  // approve an already-active college is a business rule and answers 422.
  it('requires a substantive reason to reject', async () => {
    const pending = await createPendingCollege();

    await request(app)
      .post(`${API}/colleges/${pending.collegeId}/reject`)
      .set(auth(platform.token))
      .send({ reason: 'no' })
      .expect(400);
  });

  /* =============================== authorization ============================= */

  /**
   * The defect this guards against: a college administrator reaching another
   * institution. They hold `college:read`, `college:update` and
   * `college:settings`, but never `college:approve`.
   */
  it('refuses approval and rejection to a college administrator', async () => {
    const pending = await createPendingCollege();

    await request(app)
      .post(`${API}/colleges/${pending.collegeId}/approve`)
      .set(auth(tenant.token))
      .send({})
      .expect(403);

    await request(app)
      .post(`${API}/colleges/${pending.collegeId}/reject`)
      .set(auth(tenant.token))
      .send({ reason: 'Trying to reject a rival institution.' })
      .expect(403);

    const stored = await CollegeModel.findById(pending.collegeId).exec();
    expect(stored?.status).toBe('pending');
  });

  it('leaves the self-service routes working for the college administrator', async () => {
    // Adding the platform routes must not disturb the existing `/me` surface.
    await request(app).get(`${API}/colleges/me`).set(auth(tenant.token)).expect(200);
  });
});
