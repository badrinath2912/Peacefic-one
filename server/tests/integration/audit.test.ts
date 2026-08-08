import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import { ActivityLogModel } from '@/models/activity-log.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('audit API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  /* --------------------------------- fixtures -------------------------------- */

  /**
   * Written straight through the model rather than by provoking real actions,
   * so a test can pin an exact category, severity or timestamp. `append` is the
   * only write path the repository exposes, and this uses the same one.
   */
  async function writeEntry(overrides: Record<string, unknown> = {}) {
    return ActivityLogModel.create({
      collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
      userId: new mongoose.Types.ObjectId(tenant.adminUserId),
      userEmail: 'admin.pit@example.edu',
      userRole: 'college_admin',
      action: 'student.created',
      category: 'data',
      severity: 'info',
      entity: { type: 'Student', id: new mongoose.Types.ObjectId(), label: 'Meera Iyer' },
      changes: null,
      metadata: null,
      ip: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-test',
      outcome: 'success',
      errorMessage: null,
      ...overrides,
    });
  }

  /* ----------------------------------- read ---------------------------------- */

  describe('reading', () => {
    it('lists the log for a caller holding audit:read', async () => {
      await writeEntry();

      const response = await request(app)
        .get(`${API}/audit`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      const entry = response.body.data.find(
        (row: { action: string }) => row.action === 'student.created',
      );

      expect(entry).toBeDefined();
      expect(entry.category).toBe('data');
      expect(entry.severity).toBe('info');
      expect(entry.outcome).toBe('success');
      expect(entry.entity.type).toBe('Student');
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app).get(`${API}/audit`).expect(401);
    });

    /** Only college_admin holds `audit:read`. */
    it('refuses every role that does not hold audit:read', async () => {
      for (const roleKey of [ROLE_KEYS.HOD, ROLE_KEYS.FACULTY, ROLE_KEYS.PLACEMENT_OFFICER]) {
        const staff = await createStaffUser(app, tenant, {
          roleKey,
          email: `${roleKey}.audit@example.edu`,
        });

        await request(app).get(`${API}/audit`).set(auth(staff.token)).expect(403);
      }
    });

    it('sorts newest first by default', async () => {
      await writeEntry({ action: 'first.action', createdAt: new Date('2026-01-01T00:00:00Z') });
      await writeEntry({ action: 'second.action', createdAt: new Date('2026-02-01T00:00:00Z') });

      const response = await request(app)
        .get(`${API}/audit`)
        .set(auth(tenant.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions.indexOf('second.action')).toBeLessThan(actions.indexOf('first.action'));
    });

    it('paginates', async () => {
      for (let index = 0; index < 5; index += 1) {
        await writeEntry({ action: `paged.action.${index}` });
      }

      const response = await request(app)
        .get(`${API}/audit?page=1&limit=2`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.pagination.page).toBe(1);
      expect(response.body.meta.pagination.limit).toBe(2);
      expect(response.body.meta.pagination.totalItems).toBeGreaterThanOrEqual(5);
    });

    /** `maxLimit` is 100 on the repository; the schema refuses more. */
    it('refuses a limit above the maximum', async () => {
      await request(app).get(`${API}/audit?limit=500`).set(auth(tenant.token)).expect(400);
    });
  });

  /* --------------------------------- searching -------------------------------- */

  describe('search', () => {
    it('searches by action', async () => {
      await writeEntry({ action: 'placement.offered' });
      await writeEntry({ action: 'student.created' });

      const response = await request(app)
        .get(`${API}/audit?search=placement.offered`)
        .set(auth(tenant.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).toContain('placement.offered');
      expect(actions).not.toContain('student.created');
    });

    it('searches by user email', async () => {
      await writeEntry({ userEmail: 'someone.else@example.edu', action: 'other.action' });

      const response = await request(app)
        .get(`${API}/audit?search=someone.else@example.edu`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      for (const row of response.body.data) {
        expect(row.userEmail).toBe('someone.else@example.edu');
      }
    });
  });

  /* --------------------------------- filtering -------------------------------- */

  describe('filters', () => {
    it('filters by category', async () => {
      await writeEntry({ action: 'auth.login', category: 'auth' });
      await writeEntry({ action: 'student.created', category: 'data' });

      const response = await request(app)
        .get(`${API}/audit?category=auth`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      for (const row of response.body.data) expect(row.category).toBe('auth');
    });

    it('filters by severity', async () => {
      await writeEntry({ action: 'college.suspended', severity: 'critical' });

      const response = await request(app)
        .get(`${API}/audit?severity=critical`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      for (const row of response.body.data) expect(row.severity).toBe('critical');
    });

    it('filters by outcome', async () => {
      await writeEntry({ action: 'auth.login_failed', outcome: 'failure' });

      const response = await request(app)
        .get(`${API}/audit?outcome=failure`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      for (const row of response.body.data) expect(row.outcome).toBe('failure');
    });

    it('filters by action', async () => {
      await writeEntry({ action: 'batch.promoted' });
      await writeEntry({ action: 'student.created' });

      const response = await request(app)
        .get(`${API}/audit?action=batch.promoted`)
        .set(auth(tenant.token))
        .expect(200);

      for (const row of response.body.data) expect(row.action).toBe('batch.promoted');
    });

    /**
     * Dotted filterable fields cannot be reached over HTTP:
     * `express-mongo-sanitize({ replaceWith: '_' })` rewrites `entity.type` to
     * `entity_type` before any route sees it, so the key never matches a
     * filterable field. Pinned here so the limitation stays visible rather than
     * being rediscovered as a bug.
     */
    it('ignores a dotted filter key, which the sanitiser rewrites', async () => {
      await writeEntry({ entity: { type: 'Company', id: null, label: 'Acme' } });
      await writeEntry({ action: 'unrelated.action' });

      const response = await request(app)
        .get(`${API}/audit?entity.type=Company`)
        .set(auth(tenant.token))
        .expect(200);

      // Unfiltered — which is why the UI offers no entity filter.
      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).toContain('unrelated.action');
    });

    it('filters by user', async () => {
      const otherUser = new mongoose.Types.ObjectId();
      await writeEntry({ userId: otherUser, action: 'someone.elses.action' });

      const response = await request(app)
        .get(`${API}/audit?userId=${String(otherUser)}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action).toBe('someone.elses.action');
    });

    /**
     * The date range uses `from`/`to`, not the repository's operator syntax:
     * Express parses `createdAt[gte]` into a nested object that
     * `buildFilterFromQuery` never matches, so it would be silently ignored.
     */
    it('filters from a date', async () => {
      await writeEntry({ action: 'old.action', createdAt: new Date('2025-01-01T00:00:00Z') });
      await writeEntry({ action: 'new.action', createdAt: new Date('2026-06-01T00:00:00Z') });

      const response = await request(app)
        .get(`${API}/audit?from=2026-01-01T00:00:00.000Z`)
        .set(auth(tenant.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).toContain('new.action');
      expect(actions).not.toContain('old.action');
    });

    it('filters to a date', async () => {
      await writeEntry({ action: 'old.action', createdAt: new Date('2025-01-01T00:00:00Z') });
      await writeEntry({ action: 'new.action', createdAt: new Date('2026-06-01T00:00:00Z') });

      const response = await request(app)
        .get(`${API}/audit?to=2025-06-01T00:00:00.000Z`)
        .set(auth(tenant.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).toContain('old.action');
      expect(actions).not.toContain('new.action');
    });

    it('filters between two dates', async () => {
      await writeEntry({ action: 'too.old', createdAt: new Date('2024-01-01T00:00:00Z') });
      await writeEntry({ action: 'in.range', createdAt: new Date('2025-06-01T00:00:00Z') });
      await writeEntry({ action: 'too.new', createdAt: new Date('2026-06-01T00:00:00Z') });

      const response = await request(app)
        .get(`${API}/audit?from=2025-01-01T00:00:00.000Z&to=2025-12-31T00:00:00.000Z`)
        .set(auth(tenant.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).toContain('in.range');
      expect(actions).not.toContain('too.old');
      expect(actions).not.toContain('too.new');
    });

    it('rejects a category outside the enum', async () => {
      await request(app)
        .get(`${API}/audit?category=not-a-category`)
        .set(auth(tenant.token))
        .expect(400);
    });
  });

  /* --------------------------------- tenancy ---------------------------------- */

  describe('tenancy', () => {
    it('does not expose another college’s audit records', async () => {
      await writeEntry({ action: 'ours.only' });

      const other = await createTenant(app, {
        code: 'OTH',
        adminEmail: 'admin.oth@example.edu',
      });

      const response = await request(app)
        .get(`${API}/audit`)
        .set(auth(other.token))
        .expect(200);

      const actions = response.body.data.map((row: { action: string }) => row.action);
      expect(actions).not.toContain('ours.only');

      for (const row of response.body.data) {
        expect(String(row.collegeId)).not.toBe(tenant.collegeId);
      }
    });

    /** A filter narrows within the tenant; it never widens across tenants. */
    it('does not let a filter reach across colleges', async () => {
      await writeEntry({ action: 'ours.only', createdAt: new Date('2026-03-01T00:00:00Z') });

      const other = await createTenant(app, {
        code: 'OTH',
        adminEmail: 'admin.oth@example.edu',
      });

      const response = await request(app)
        .get(`${API}/audit?action=ours.only&from=2026-01-01T00:00:00.000Z`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  /* --------------------------------- exporting -------------------------------- */

  describe('export', () => {
    it('exports for a caller holding audit:export', async () => {
      await writeEntry();

      const response = await request(app)
        .post(`${API}/audit/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.headers['content-disposition']).toContain('audit-log');
      expect(Number(response.headers['x-row-count'])).toBeGreaterThan(0);
    });

    it('refuses a role that does not hold audit:export', async () => {
      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.export@example.edu',
      });

      await request(app)
        .post(`${API}/audit/bulk/export`)
        .set(auth(hod.token))
        .expect(403);
    });

    /**
     * The other college has audit rows of its own — signing in writes one — so
     * the assertion is that ours are absent, not that theirs are.
     */
    it('exports only the caller’s own college', async () => {
      await writeEntry({ action: 'ours.only' });

      const other = await createTenant(app, {
        code: 'OTH',
        adminEmail: 'admin.oth@example.edu',
      });

      const response = await request(app)
        .post(`${API}/audit/bulk/export?format=csv`)
        .set(auth(other.token))
        .expect(200);

      expect(response.text).not.toContain('ours.only');
      expect(response.text).not.toContain('admin.pit@example.edu');
    });

    it('applies the same filters as the list', async () => {
      await writeEntry({ action: 'directory.searched', category: 'auth' });
      await writeEntry({ action: 'student.created', category: 'data' });

      const listed = await request(app)
        .get(`${API}/audit?category=auth&limit=100`)
        .set(auth(tenant.token))
        .expect(200);

      const exported = await request(app)
        .post(`${API}/audit/bulk/export?format=csv&category=auth`)
        .set(auth(tenant.token))
        .expect(200);

      // The export covers exactly the rows the same filter lists.
      expect(Number(exported.headers['x-row-count'])).toBe(listed.body.data.length);
      expect(exported.text).toContain('directory.searched');
      expect(exported.text).not.toContain('student.created');
    });
  });

  /* ------------------------------- append-only -------------------------------- */

  describe('append-only', () => {
    /** The model rejects mutation; no HTTP verb should exist to attempt it. */
    it('exposes no write, update or delete endpoint', async () => {
      await request(app)
        .post(`${API}/audit`)
        .set(auth(tenant.token))
        .send({ action: 'forged.action' })
        .expect(404);

      const entry = await writeEntry();

      await request(app)
        .patch(`${API}/audit/${String(entry._id)}`)
        .set(auth(tenant.token))
        .send({ action: 'rewritten' })
        .expect(404);

      await request(app)
        .delete(`${API}/audit/${String(entry._id)}`)
        .set(auth(tenant.token))
        .expect(404);
    });

    it('still rejects mutation at the model', async () => {
      const entry = await writeEntry();

      await expect(
        ActivityLogModel.updateOne({ _id: entry._id }, { $set: { action: 'rewritten' } }).exec(),
      ).rejects.toThrow(/append-only/i);
    });
  });

  /* --------------------------------- redaction -------------------------------- */

  describe('redaction', () => {
    /**
     * `AuditService` replaces sensitive values before they are stored, so a
     * password never reaches the collection and the read path has nothing to
     * leak. This proves the stored-and-served shape, not just the writer.
     */
    it('serves a redacted value rather than a secret', async () => {
      const { auditService } = await import('@/container');

      await auditService.log({
        action: 'user.password_changed',
        category: 'security',
        changes: [{ field: 'password', from: 'OldSecret1', to: 'NewSecret1' }],
        metadata: { token: 'a-real-token', note: 'kept' },
        collegeId: tenant.collegeId,
        userId: tenant.adminUserId,
      });

      const response = await request(app)
        .get(`${API}/audit?action=user.password_changed`)
        .set(auth(tenant.token))
        .expect(200);

      const entry = response.body.data[0];
      expect(entry).toBeDefined();

      expect(entry.changes[0].from).toBe('[redacted]');
      expect(entry.changes[0].to).toBe('[redacted]');
      expect(entry.metadata.token).toBe('[redacted]');
      expect(entry.metadata.note).toBe('kept');

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('OldSecret1');
      expect(serialised).not.toContain('NewSecret1');
      expect(serialised).not.toContain('a-real-token');
    });
  });
});
