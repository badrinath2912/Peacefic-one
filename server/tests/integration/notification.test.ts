import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import { NotificationModel } from '@/models/notification.model';
import { RoleModel } from '@/models/role.model';
import { UserModel } from '@/models/user.model';
import { hashPassword } from '@/utils/crypto';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('notification API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  /* --------------------------------- fixtures -------------------------------- */

  /**
   * Written straight through the model. `NotificationService.notify` is the
   * real write path but takes a recipient list and has no HTTP surface, so
   * seeding directly is both simpler and lets a test pin an exact category or
   * read state.
   */
  async function writeNotification(
    userId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return NotificationModel.create({
      collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
      userId: new mongoose.Types.ObjectId(userId),
      type: 'placement.offer_made',
      category: 'placement',
      priority: 'normal',
      title: 'You have an offer',
      message: 'Zoho has made you an offer.',
      actionUrl: '/student/applications',
      actionLabel: 'View',
      entity: null,
      channels: { inApp: true, email: false, push: false },
      deliveryStatus: { inApp: 'delivered', email: 'skipped', push: 'skipped' },
      readAt: null,
      archivedAt: null,
      ...overrides,
    });
  }

  /** A signed-in user on a custom role holding everything but `notification:read`. */
  async function userWithoutNotificationRead(): Promise<string> {
    const role = await RoleModel.create({
      key: 'limited_clerk',
      name: 'Limited Clerk',
      permissions: ['student:read', 'college:read'],
      scope: 'college',
      isSystem: false,
      collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
    });

    const email = 'clerk.pit@example.edu';

    await UserModel.create({
      email,
      passwordHash: await hashPassword('CorrectHorse9'),
      firstName: 'Limited',
      lastName: 'Clerk',
      collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
      roleId: role._id,
      status: 'active',
      emailVerifiedAt: new Date(),
    });

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: 'CorrectHorse9' })
      .expect(200);

    return login.body.data.accessToken as string;
  }

  /* ------------------------------- authentication ---------------------------- */

  describe('authentication', () => {
    it('refuses an unauthenticated caller on every route', async () => {
      const id = new mongoose.Types.ObjectId().toString();

      await request(app).get(`${API}/notifications`).expect(401);
      await request(app).get(`${API}/notifications/unread-count`).expect(401);
      await request(app).patch(`${API}/notifications/read-all`).expect(401);
      await request(app).patch(`${API}/notifications/${id}/read`).expect(401);
      await request(app).delete(`${API}/notifications/${id}`).expect(401);
    });
  });

  /* ------------------------------- authorization ----------------------------- */

  describe('authorization', () => {
    /** All six seeded roles hold `notification:read`. */
    it('allows every standard role to read its own inbox', async () => {
      await request(app).get(`${API}/notifications`).set(auth(tenant.token)).expect(200);

      for (const roleKey of [ROLE_KEYS.HOD, ROLE_KEYS.FACULTY, ROLE_KEYS.PLACEMENT_OFFICER]) {
        const staff = await createStaffUser(app, tenant, {
          roleKey,
          email: `${roleKey}.notify@example.edu`,
        });

        await request(app).get(`${API}/notifications`).set(auth(staff.token)).expect(200);
      }
    });

    it('refuses a caller whose role lacks notification:read', async () => {
      const token = await userWithoutNotificationRead();
      const id = new mongoose.Types.ObjectId().toString();

      await request(app).get(`${API}/notifications`).set(auth(token)).expect(403);
      await request(app).get(`${API}/notifications/unread-count`).set(auth(token)).expect(403);
      await request(app).patch(`${API}/notifications/read-all`).set(auth(token)).expect(403);
      await request(app).patch(`${API}/notifications/${id}/read`).set(auth(token)).expect(403);
      await request(app).delete(`${API}/notifications/${id}`).set(auth(token)).expect(403);
    });
  });

  /* ---------------------------------- listing -------------------------------- */

  describe('listing', () => {
    it('returns the caller\'s own notifications', async () => {
      await writeNotification(tenant.adminUserId);

      const response = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('You have an offer');
      expect(response.body.data[0].category).toBe('placement');
      expect(response.body.data[0].readAt).toBeNull();
    });

    /** The ownership boundary: one inbox per user, resolved from the token. */
    it('never returns another user\'s notifications', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.inbox@example.edu',
      });

      await writeNotification(other.userId, { title: 'Not for the admin' });
      await writeNotification(tenant.adminUserId, { title: 'For the admin' });

      const response = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('For the admin');
    });

    /**
     * `NotificationRepository` is not tenant-scoped — ownership is by `userId`,
     * not by college — so this pins that the userId filter alone keeps a
     * different college's rows out.
     */
    it('never returns a notification belonging to another college', async () => {
      const otherTenant = await createTenant(app, {
        code: 'KCT',
        adminEmail: 'admin.kct@example.edu',
      });

      await NotificationModel.create({
        collegeId: new mongoose.Types.ObjectId(otherTenant.collegeId),
        userId: new mongoose.Types.ObjectId(otherTenant.adminUserId),
        type: 'academic.result_published',
        category: 'academic',
        title: 'Other college notification',
        message: 'Should never be visible across tenants.',
      });

      await writeNotification(tenant.adminUserId, { title: 'Ours' });

      const ours = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(ours.body.data).toHaveLength(1);
      expect(ours.body.data[0].title).toBe('Ours');

      const theirs = await request(app)
        .get(`${API}/notifications`)
        .set(auth(otherTenant.token))
        .expect(200);

      expect(theirs.body.data).toHaveLength(1);
      expect(theirs.body.data[0].title).toBe('Other college notification');
    });

    it('sorts newest first', async () => {
      await writeNotification(tenant.adminUserId, {
        title: 'Older',
        createdAt: new Date('2026-01-01'),
      });
      await writeNotification(tenant.adminUserId, {
        title: 'Newer',
        createdAt: new Date('2026-06-01'),
      });

      const response = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.map((row: { title: string }) => row.title)).toEqual([
        'Newer',
        'Older',
      ]);
    });

    it('paginates', async () => {
      for (let index = 0; index < 5; index += 1) {
        await writeNotification(tenant.adminUserId, { title: `Item ${index}` });
      }

      const response = await request(app)
        .get(`${API}/notifications?page=1&limit=2`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.pagination.totalItems).toBe(5);
      expect(response.body.meta.pagination.hasNextPage).toBe(true);
    });

    it('filters by category', async () => {
      await writeNotification(tenant.adminUserId, { category: 'placement', title: 'Placement' });
      await writeNotification(tenant.adminUserId, { category: 'academic', title: 'Academic' });

      const response = await request(app)
        .get(`${API}/notifications?category=academic`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Academic');
    });

    it('filters to unread only', async () => {
      await writeNotification(tenant.adminUserId, { title: 'Unread' });
      await writeNotification(tenant.adminUserId, { title: 'Read', readAt: new Date() });

      const response = await request(app)
        .get(`${API}/notifications?unread=true`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Unread');
    });

    it('excludes archived notifications', async () => {
      await writeNotification(tenant.adminUserId, { title: 'Visible' });
      await writeNotification(tenant.adminUserId, {
        title: 'Archived',
        archivedAt: new Date(),
      });

      const response = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Visible');
    });

    it('returns an empty page rather than an error for a fresh inbox', async () => {
      const response = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.pagination.totalItems).toBe(0);
    });
  });

  /* --------------------------------- unread ---------------------------------- */

  describe('unread count', () => {
    it('counts only unread, unarchived notifications for the caller', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.count@example.edu',
      });

      await writeNotification(tenant.adminUserId);
      await writeNotification(tenant.adminUserId);
      await writeNotification(tenant.adminUserId, { readAt: new Date() });
      await writeNotification(tenant.adminUserId, { archivedAt: new Date() });
      await writeNotification(other.userId);

      const response = await request(app)
        .get(`${API}/notifications/unread-count`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(2);
    });

    it('is zero for a fresh inbox', async () => {
      const response = await request(app)
        .get(`${API}/notifications/unread-count`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(0);
    });
  });

  /* ------------------------------- marking read ------------------------------ */

  describe('marking read', () => {
    it('marks one read and answers with the remaining count', async () => {
      const first = await writeNotification(tenant.adminUserId);
      await writeNotification(tenant.adminUserId);

      const response = await request(app)
        .patch(`${API}/notifications/${String(first._id)}/read`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(1);

      const stored = await NotificationModel.findById(first._id).exec();
      expect(stored?.readAt).not.toBeNull();
    });

    it('is idempotent', async () => {
      const notification = await writeNotification(tenant.adminUserId);
      const url = `${API}/notifications/${String(notification._id)}/read`;

      await request(app).patch(url).set(auth(tenant.token)).expect(200);

      const second = await request(app).patch(url).set(auth(tenant.token)).expect(200);
      expect(second.body.data.unread).toBe(0);
    });

    /**
     * Deliberately not a 404. The repository's update filter carries the
     * caller's `userId`, so another user's row is never matched — and answering
     * 404 versus 200 would confirm whether a given id exists.
     */
    it('leaves another user\'s notification untouched without disclosing it', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.mark@example.edu',
      });

      const theirs = await writeNotification(other.userId);

      const response = await request(app)
        .patch(`${API}/notifications/${String(theirs._id)}/read`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(0);

      const stored = await NotificationModel.findById(theirs._id).exec();
      expect(stored?.readAt).toBeNull();
    });

    it('answers the same way for an id that does not exist', async () => {
      await writeNotification(tenant.adminUserId);

      const response = await request(app)
        .patch(`${API}/notifications/${new mongoose.Types.ObjectId().toString()}/read`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(1);
    });

    it('rejects a malformed id', async () => {
      const response = await request(app)
        .patch(`${API}/notifications/not-an-object-id/read`)
        .set(auth(tenant.token))
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('marking all read', () => {
    it('marks every unread notification and reports both counts', async () => {
      await writeNotification(tenant.adminUserId);
      await writeNotification(tenant.adminUserId);
      await writeNotification(tenant.adminUserId, { readAt: new Date() });

      const response = await request(app)
        .patch(`${API}/notifications/read-all`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.updated).toBe(2);
      expect(response.body.data.unread).toBe(0);
    });

    it('touches nobody else\'s inbox', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.markall@example.edu',
      });

      const theirs = await writeNotification(other.userId);
      await writeNotification(tenant.adminUserId);

      await request(app).patch(`${API}/notifications/read-all`).set(auth(tenant.token)).expect(200);

      const stored = await NotificationModel.findById(theirs._id).exec();
      expect(stored?.readAt).toBeNull();
    });

    it('reports nothing updated for a fresh inbox', async () => {
      const response = await request(app)
        .patch(`${API}/notifications/read-all`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.updated).toBe(0);
    });
  });

  /* -------------------------------- archiving -------------------------------- */

  describe('archiving', () => {
    it('archives one and drops it from the list', async () => {
      const notification = await writeNotification(tenant.adminUserId);

      const response = await request(app)
        .delete(`${API}/notifications/${String(notification._id)}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.unread).toBe(0);

      const list = await request(app)
        .get(`${API}/notifications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(list.body.data).toEqual([]);

      // Archived, not deleted: the row is still there with a timestamp.
      const stored = await NotificationModel.findById(notification._id).exec();
      expect(stored).not.toBeNull();
      expect(stored?.archivedAt).not.toBeNull();
    });

    it('leaves another user\'s notification untouched', async () => {
      const other = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.archive@example.edu',
      });

      const theirs = await writeNotification(other.userId);

      await request(app)
        .delete(`${API}/notifications/${String(theirs._id)}`)
        .set(auth(tenant.token))
        .expect(200);

      const stored = await NotificationModel.findById(theirs._id).exec();
      expect(stored?.archivedAt).toBeNull();
    });

    it('rejects a malformed id', async () => {
      await request(app)
        .delete(`${API}/notifications/not-an-object-id`)
        .set(auth(tenant.token))
        .expect(400);
    });
  });

  /* ------------------------------ invalid requests ---------------------------- */

  describe('invalid requests', () => {
    it('rejects an unknown category', async () => {
      const response = await request(app)
        .get(`${API}/notifications?category=not-a-category`)
        .set(auth(tenant.token))
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a limit beyond the maximum', async () => {
      await request(app)
        .get(`${API}/notifications?limit=500`)
        .set(auth(tenant.token))
        .expect(400);
    });

    /**
     * `priority` and `sort` are not declared on the route schema because
     * `findForUser` cannot honour them. The validator strips unknown keys, so
     * they are accepted and ignored rather than rejected — this pins that they
     * genuinely have no effect, so nobody mistakes one for a working filter.
     */
    it('ignores filters the repository does not apply', async () => {
      await writeNotification(tenant.adminUserId, { priority: 'low', title: 'Low' });
      await writeNotification(tenant.adminUserId, { priority: 'urgent', title: 'Urgent' });

      const response = await request(app)
        .get(`${API}/notifications?priority=urgent&sort=title`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });
  });

  /* --------------------------------- no sending ------------------------------- */

  /**
   * `notification:send`, `announcement:create` and `announcement:publish` remain
   * unenforced: `NotificationService.notify` performs no check that its
   * recipients belong to the caller's college, so no send route was exposed.
   */
  describe('sending', () => {
    it('exposes no write endpoint', async () => {
      await request(app)
        .post(`${API}/notifications`)
        .set(auth(tenant.token))
        .send({ title: 'Nope', message: 'Nope', category: 'system', userIds: [] })
        .expect(404);
    });
  });
});
