import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

/**
 * `PATCH /auth/profile` and `PATCH /auth/preferences`.
 *
 * Both resolve the user from the token and take no id parameter, so the
 * security question is not "can A name B" — there is no field in which to name
 * anyone. These tests pin that the routes touch exactly one account, ignore
 * everything the schema does not declare, and leave unmentioned fields alone.
 */
describe('self-service profile and preferences', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const storedFor = async (userId: string) =>
    UserModel.findById(userId).select('+preferences').exec();

  /* ================================ preferences ============================== */

  describe('preferences', () => {
    it('updates the caller\'s own preferences', async () => {
      const response = await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ theme: 'dark', locale: 'ta-IN' })
        .expect(200);

      expect(response.body.data.user.preferences.theme).toBe('dark');
      expect(response.body.data.user.preferences.locale).toBe('ta-IN');

      const stored = await storedFor(tenant.adminUserId);
      expect(stored?.preferences.theme).toBe('dark');
      expect(stored?.preferences.locale).toBe('ta-IN');
    });

    /** Dot-notation writes, so the three not mentioned keep their values. */
    it('leaves unspecified preferences unchanged', async () => {
      await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ theme: 'dark', locale: 'ta-IN', emailNotifications: false, pushNotifications: false })
        .expect(200);

      await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ theme: 'light' })
        .expect(200);

      const stored = await storedFor(tenant.adminUserId);
      expect(stored?.preferences.theme).toBe('light');
      expect(stored?.preferences.locale).toBe('ta-IN');
      expect(stored?.preferences.emailNotifications).toBe(false);
      expect(stored?.preferences.pushNotifications).toBe(false);
    });

    it('rejects a theme outside the enum', async () => {
      const response = await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ theme: 'neon' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-boolean notification flag', async () => {
      await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ emailNotifications: 'yes' })
        .expect(400);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app).patch(`${API}/auth/preferences`).send({ theme: 'dark' }).expect(401);
    });

    /** One token, one account: another user's settings are never touched. */
    it('does not alter another user\'s preferences', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.prefs@example.edu',
      });

      await request(app)
        .patch(`${API}/auth/preferences`)
        .set(auth(tenant.token))
        .send({ theme: 'dark', emailNotifications: false })
        .expect(200);

      const theirs = await storedFor(other.userId);
      expect(theirs?.preferences.theme).toBe('system');
      expect(theirs?.preferences.emailNotifications).toBe(true);
    });
  });

  /* ================================== profile ================================ */

  describe('profile', () => {
    it('updates the caller\'s own profile', async () => {
      const response = await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ firstName: 'Asha', lastName: 'Ramesh', phone: '+919812345670' })
        .expect(200);

      expect(response.body.data.user.firstName).toBe('Asha');
      expect(response.body.data.user.lastName).toBe('Ramesh');
      // Derived server-side, which is why the whole session user comes back.
      expect(response.body.data.user.fullName).toBe('Asha Ramesh');

      const stored = await storedFor(tenant.adminUserId);
      expect(stored?.firstName).toBe('Asha');
      expect(stored?.phone).toBe('+919812345670');
    });

    it('leaves unspecified fields unchanged', async () => {
      const before = await storedFor(tenant.adminUserId);

      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ firstName: 'Renamed' })
        .expect(200);

      const after = await storedFor(tenant.adminUserId);
      expect(after?.firstName).toBe('Renamed');
      expect(after?.lastName).toBe(before?.lastName);
      expect(after?.email).toBe(before?.email);
    });

    it('accepts clearing the optional fields', async () => {
      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ phone: null, avatarUrl: null })
        .expect(200);

      const stored = await storedFor(tenant.adminUserId);
      expect(stored?.phone).toBeNull();
      expect(stored?.avatarUrl).toBeNull();
    });

    it('rejects an empty name and a malformed phone or avatar', async () => {
      for (const body of [
        { firstName: '' },
        { phone: 'not-a-number' },
        { avatarUrl: 'not-a-url' },
      ]) {
        await request(app)
          .patch(`${API}/auth/profile`)
          .set(auth(tenant.token))
          .send(body)
          .expect(400);
      }
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app).patch(`${API}/auth/profile`).send({ firstName: 'Nope' }).expect(401);
    });

    /**
     * The validator strips undeclared keys, and the service copies fields one
     * at a time — so privilege and account state are unreachable from here even
     * though the request is accepted.
     */
    it('cannot modify protected account fields', async () => {
      const before = await storedFor(tenant.adminUserId);

      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({
          firstName: 'Asha',
          roleId: new mongoose.Types.ObjectId().toString(),
          collegeId: new mongoose.Types.ObjectId().toString(),
          status: 'suspended',
          mustChangePassword: true,
          emailVerifiedAt: null,
          passwordHash: 'injected',
          extraPermissions: ['*:*'],
          email: 'attacker@example.edu',
        })
        .expect(200);

      const after = await storedFor(tenant.adminUserId);

      expect(after?.firstName).toBe('Asha');
      expect(String(after?.roleId)).toBe(String(before?.roleId));
      expect(String(after?.collegeId)).toBe(String(before?.collegeId));
      expect(after?.status).toBe(before?.status);
      expect(after?.mustChangePassword).toBe(false);
      expect(after?.email).toBe(before?.email);
      expect(after?.extraPermissions).toEqual(before?.extraPermissions);
    });

    it('never returns the password hash', async () => {
      const response = await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ firstName: 'Asha' })
        .expect(200);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('previousPasswordHashes');
    });

    it('does not alter another user\'s profile', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.profile@example.edu',
      });

      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ firstName: 'Changed' })
        .expect(200);

      const theirs = await storedFor(other.userId);
      expect(theirs?.firstName).toBe('Staff');
    });

    /** A second tenant's administrator is untouched by the first tenant's edit. */
    it('preserves tenant isolation', async () => {
      const otherTenant = await createTenant(app, {
        code: 'KCT',
        adminEmail: 'admin.kct@example.edu',
      });

      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(tenant.token))
        .send({ firstName: 'Changed', lastName: 'Here' })
        .expect(200);

      const theirs = await storedFor(otherTenant.adminUserId);
      expect(theirs?.firstName).toBe('Asha');
      expect(theirs?.lastName).toBe('Rao');

      // And their own edit only reaches their own record.
      await request(app)
        .patch(`${API}/auth/profile`)
        .set(auth(otherTenant.token))
        .send({ firstName: 'Theirs' })
        .expect(200);

      const ours = await storedFor(tenant.adminUserId);
      expect(ours?.firstName).toBe('Changed');
    });
  });
});
