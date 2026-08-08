import request from 'supertest';

import { SessionModel } from '@/models/session.model';
import { UserModel } from '@/models/user.model';

import {
  approveCollege,
  collegeRegistrationPayload,
  extractRefreshCookie,
  forceOtp,
  seedReferenceData,
  testApp,
} from '../helpers/app';

const API = '/api/v1';

describe('auth API', () => {
  const app = testApp();

  beforeEach(async () => {
    await seedReferenceData();
  });

  async function registerAndActivate(): Promise<{ email: string; password: string }> {
    const payload = collegeRegistrationPayload();
    await request(app).post(`${API}/auth/register/college`).send(payload).expect(201);
    await approveCollege(payload.admin.email);
    return { email: payload.admin.email, password: payload.admin.password };
  }

  describe('college registration', () => {
    it('creates a pending college and an unverified admin', async () => {
      const payload = collegeRegistrationPayload();

      const response = await request(app)
        .post(`${API}/auth/register/college`)
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.requestId).toBeTruthy();

      const user = await UserModel.findOne({ email: payload.admin.email }).exec();
      expect(user?.status).toBe('pending_verification');
    });

    it('never returns the password hash', async () => {
      const payload = collegeRegistrationPayload();
      const response = await request(app)
        .post(`${API}/auth/register/college`)
        .send(payload)
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain(payload.admin.password);
    });

    it('rejects a duplicate college code', async () => {
      await request(app)
        .post(`${API}/auth/register/college`)
        .send(collegeRegistrationPayload())
        .expect(201);

      const response = await request(app)
        .post(`${API}/auth/register/college`)
        .send(collegeRegistrationPayload({}, { email: 'other@example.edu' }))
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('rejects a weak password with field-level detail', async () => {
      const response = await request(app)
        .post(`${API}/auth/register/college`)
        .send(
          collegeRegistrationPayload(
            {},
            { password: 'short', confirmPassword: 'short' },
          ),
        )
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.some((d: { field: string }) =>
        d.field.includes('password'),
      )).toBe(true);
    });

    it('strips unknown keys rather than trusting them', async () => {
      const payload = collegeRegistrationPayload() as Record<string, unknown>;
      // A client must not be able to smuggle privileged fields through.
      payload.isSuperAdmin = true;
      (payload.admin as Record<string, unknown>).roleKey = 'platform_admin';

      await request(app).post(`${API}/auth/register/college`).send(payload).expect(201);

      const user = await UserModel.findOne({ email: 'asha.rao@example.edu' })
        .populate<{ roleId: { key: string } }>('roleId')
        .exec();

      expect(user?.roleId.key).toBe('college_admin');
    });
  });

  describe('email verification', () => {
    it('moves the account to pending approval on a correct code', async () => {
      const payload = collegeRegistrationPayload();
      await request(app).post(`${API}/auth/register/college`).send(payload).expect(201);
      await forceOtp(payload.admin.email, 'email_verification', '123456');

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: payload.admin.email, otp: '123456' })
        .expect(200);

      const user = await UserModel.findOne({ email: payload.admin.email }).exec();
      expect(user?.emailVerifiedAt).not.toBeNull();
      expect(user?.status).toBe('pending_approval');
    });

    it('rejects an incorrect code', async () => {
      const payload = collegeRegistrationPayload();
      await request(app).post(`${API}/auth/register/college`).send(payload).expect(201);
      await forceOtp(payload.admin.email, 'email_verification', '123456');

      await request(app)
        .post(`${API}/auth/verify-email`)
        .send({ email: payload.admin.email, otp: '999999' })
        .expect(400);
    });
  });

  describe('login', () => {
    it('issues an access token and sets an httpOnly refresh cookie', async () => {
      const { email, password } = await registerAndActivate();

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200);

      expect(response.body.data.accessToken).toBeTruthy();
      expect(response.body.data.user.roleKey).toBe('college_admin');
      expect(response.body.data.user.permissions).toContain('student:create');

      // The refresh token must never appear in a response body.
      expect(response.body.data.refreshToken).toBeUndefined();

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('SameSite=Strict');
      expect(refreshCookie).toContain('Path=/api/v1/auth');
    });

    it('gives the same error for an unknown email and a wrong password', async () => {
      const { email } = await registerAndActivate();

      const wrongPassword = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'WrongPassword9' })
        .expect(401);

      const unknownEmail = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'nobody@example.edu', password: 'WrongPassword9' })
        .expect(401);

      // Distinguishing these would be a user-enumeration oracle.
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('locks the account after five failed attempts', async () => {
      const { email } = await registerAndActivate();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app)
          .post(`${API}/auth/login`)
          .send({ email, password: 'WrongPassword9' })
          .expect(401);
      }

      const locked = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'WrongPassword9' })
        .expect(403);

      expect(locked.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('refuses login while the college is still pending approval', async () => {
      const payload = collegeRegistrationPayload();
      await request(app).post(`${API}/auth/register/college`).send(payload).expect(201);
      await UserModel.updateOne(
        { email: payload.admin.email },
        { $set: { status: 'active', emailVerifiedAt: new Date() } },
      ).exec();

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: payload.admin.email, password: payload.admin.password })
        .expect(403);

      expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('refresh rotation', () => {
    it('rotates the refresh token and revokes the previous one', async () => {
      const { email, password } = await registerAndActivate();

      const login = await request(app).post(`${API}/auth/login`).send({ email, password });
      const firstCookie = extractRefreshCookie(
        login.headers['set-cookie'] as unknown as string[],
      );
      expect(firstCookie).toBeTruthy();

      const refreshed = await request(app)
        .post(`${API}/auth/refresh`)
        .set('Cookie', firstCookie as string)
        .expect(200);

      expect(refreshed.body.data.accessToken).toBeTruthy();

      const secondCookie = extractRefreshCookie(
        refreshed.headers['set-cookie'] as unknown as string[],
      );
      expect(secondCookie).not.toBe(firstCookie);
    });

    it('revokes the whole family when a rotated token is replayed', async () => {
      const { email, password } = await registerAndActivate();

      const login = await request(app).post(`${API}/auth/login`).send({ email, password });
      const firstCookie = extractRefreshCookie(
        login.headers['set-cookie'] as unknown as string[],
      ) as string;

      await request(app).post(`${API}/auth/refresh`).set('Cookie', firstCookie).expect(200);

      // Replaying the already-rotated token is indistinguishable from theft.
      await request(app).post(`${API}/auth/refresh`).set('Cookie', firstCookie).expect(401);

      const user = await UserModel.findOne({ email }).exec();
      const sessions = await SessionModel.find({ userId: user?._id }).exec();

      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
      expect(sessions.some((s) => s.revokedReason === 'reuse_detected')).toBe(true);
    });
  });

  describe('protected routes', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).get(`${API}/departments`).expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('accepts a valid access token', async () => {
      const { email, password } = await registerAndActivate();
      const login = await request(app).post(`${API}/auth/login`).send({ email, password });
      const token = login.body.data.accessToken as string;

      const response = await request(app)
        .get(`${API}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.pagination).toBeDefined();
    });

    it('returns the signed-in profile from the session endpoint', async () => {
      const { email, password } = await registerAndActivate();
      const login = await request(app).post(`${API}/auth/login`).send({ email, password });

      const response = await request(app)
        .get(`${API}/auth/session`)
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);

      expect(response.body.data.user.email).toBe(email);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });
  });

  describe('forgot password', () => {
    it('responds identically for a known and an unknown address', async () => {
      const { email } = await registerAndActivate();

      const known = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email })
        .expect(200);

      const unknown = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'nobody@example.edu' })
        .expect(200);

      expect(known.body.data.message).toBe(unknown.body.data.message);
    });
  });
});
