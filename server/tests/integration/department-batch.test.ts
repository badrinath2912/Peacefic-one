import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { BatchModel } from '@/models/batch.model';
import { DepartmentModel } from '@/models/department.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createPlatformAdmin, createStaffUser, createTenant, studentPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('department and batch API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /* ------------------------------- departments ------------------------------ */

  describe('department export', () => {
    it('exports departments as CSV with their counts', async () => {
      const response = await request(app)
        .post(`${API}/departments/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['x-row-count']).toBe('1');

      const csv = response.text ?? String(response.body);
      expect(csv).toContain('Head of Department');
      expect(csv).toContain('CSE');
    });

    it('produces a real xlsx workbook', async () => {
      const response = await request(app)
        .post(`${API}/departments/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        .responseType('blob')
        .send({})
        .expect(200);

      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('neutralises a formula in an exported cell', async () => {
      await request(app)
        .post(`${API}/departments`)
        .set(auth(tenant.token))
        .send({ name: '=HYPERLINK("http://evil.test")', code: 'EVIL', status: 'active' })
        .expect(201);

      const response = await request(app)
        .post(`${API}/departments/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text ?? String(response.body)).toContain("'=HYPERLINK");
    });

    it('exports only the selected rows', async () => {
      await request(app)
        .post(`${API}/departments`)
        .set(auth(tenant.token))
        .send({ name: 'Mechanical', code: 'MECH', status: 'active' })
        .expect(201);

      const list = await request(app)
        .get(`${API}/departments`)
        .set(auth(tenant.token))
        .expect(200);

      const response = await request(app)
        .post(`${API}/departments/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({ ids: [list.body.data[0].id] })
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');
    });

    it('refuses a student the department export', async () => {
      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.dept@example.edu',
      });

      await request(app)
        .post(`${API}/departments/bulk/export?format=csv`)
        .set(auth(student.token))
        .send({})
        .expect(403);
    });
  });

  describe('department bulk delete', () => {
    it('removes empty departments', async () => {
      const created = await request(app)
        .post(`${API}/departments`)
        .set(auth(tenant.token))
        .send({ name: 'Civil', code: 'CIVIL', status: 'active' })
        .expect(201);

      const response = await request(app)
        .delete(`${API}/departments/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [created.body.data.id] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
    });

    it('skips a department that still holds a batch, without failing the batch', async () => {
      const empty = await request(app)
        .post(`${API}/departments`)
        .set(auth(tenant.token))
        .send({ name: 'Civil', code: 'CIVIL', status: 'active' })
        .expect(201);

      // The seeded CSE department already owns a batch.
      const response = await request(app)
        .delete(`${API}/departments/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [empty.body.data.id, tenant.departmentId] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toMatch(/batch/i);
    });

    it('refuses a faculty member the bulk delete', async () => {
      const member = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.deptdel@example.edu',
        employeeId: 'EMPDD',
      });

      await request(app)
        .delete(`${API}/departments/bulk`)
        .set(auth(member.token))
        .send({ ids: [tenant.departmentId] })
        .expect(403);
    });
  });

  /* --------------------------------- batches -------------------------------- */

  describe('batch export', () => {
    it('exports batches with capacity and utilisation', async () => {
      const response = await request(app)
        .post(`${API}/batches/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');

      const csv = response.text ?? String(response.body);
      expect(csv).toContain('Current Strength');
      expect(csv).toContain('Utilisation %');
      expect(csv).toContain('CSE-22-A');
    });

    it('produces a real xlsx workbook', async () => {
      const response = await request(app)
        .post(`${API}/batches/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        .responseType('blob')
        .send({})
        .expect(200);

      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('refuses a student the batch export', async () => {
      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.batch@example.edu',
      });

      await request(app)
        .post(`${API}/batches/bulk/export?format=csv`)
        .set(auth(student.token))
        .send({})
        .expect(403);
    });
  });

  describe('batch bulk delete', () => {
    it('removes an empty batch', async () => {
      const created = await request(app)
        .post(`${API}/batches`)
        .set(auth(tenant.token))
        .send({
          departmentId: tenant.departmentId,
          name: 'CSE 2023 Section B',
          code: 'CSE-23-B',
          admissionYear: 2023,
          graduationYear: 2027,
          capacity: 60,
          currentSemester: 1,
          status: 'active',
        })
        .expect(201);

      const response = await request(app)
        .delete(`${API}/batches/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [created.body.data.id] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
    });

    it('skips a batch that still has enrolled students', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const empty = await request(app)
        .post(`${API}/batches`)
        .set(auth(tenant.token))
        .send({
          departmentId: tenant.departmentId,
          name: 'CSE 2023 Section C',
          code: 'CSE-23-C',
          admissionYear: 2023,
          graduationYear: 2027,
          capacity: 60,
          currentSemester: 1,
          status: 'active',
        })
        .expect(201);

      const response = await request(app)
        .delete(`${API}/batches/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [empty.body.data.id, tenant.batchId] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toMatch(/student/i);
    });
  });

  /* -------------------------------- tenancy --------------------------------- */

  describe('tenancy', () => {
    it('does not expose another college\'s departments or batches', async () => {
      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const departments = await request(app)
        .post(`${API}/departments/bulk/export?format=csv`)
        .set(auth(other.token))
        .send({})
        .expect(200);

      // Its own seeded department only — never the first tenant's.
      expect(departments.headers['x-row-count']).toBe('1');
      expect(departments.text ?? '').not.toContain(tenant.departmentId);
    });

    it('refuses to delete another tenant\'s department', async () => {
      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .delete(`${API}/departments/bulk`)
        .set(auth(other.token))
        .send({ ids: [tenant.departmentId] })
        .expect(200);

      // Reported as a failure rather than silently crossing the boundary.
      expect(response.body.data.successCount).toBe(0);
      expect(await DepartmentModel.countDocuments({ deletedAt: null })).toBe(2);
    });
  });

  /* --------------------------------- scope ---------------------------------- */

  describe('scope', () => {
    it('shows an HOD only their own department', async () => {
      const other = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.scope.dept@example.edu',
        employeeId: 'EMPHSD',
      });

      const response = await request(app)
        .get(`${API}/departments`)
        .set(auth(hod.token))
        .expect(200);

      const ids = (response.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).not.toContain(String(other._id));
    });

    it('shows a faculty member only batches they are assigned', async () => {
      const otherBatch = await BatchModel.create({
        collegeId: tenant.collegeId,
        departmentId: tenant.departmentId,
        name: 'CSE 2022 Section Z',
        code: 'CSE-22-Z',
        admissionYear: 2022,
        graduationYear: 2026,
        capacity: 60,
        status: 'active',
      });

      const member = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.batchscope@example.edu',
        employeeId: 'EMPBS',
        assignedBatchIds: [tenant.batchId],
      });

      const response = await request(app)
        .get(`${API}/batches`)
        .set(auth(member.token))
        .expect(200);

      const ids = (response.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(tenant.batchId);
      expect(ids).not.toContain(String(otherBatch._id));
    });
  });

  describe('platform administrator on a tenant-scoped route', () => {
    /**
     * A platform administrator holds `*:*`, so every permission check passes —
     * but they have no college of their own, and these routes read through
     * tenant-scoped repositories. That combination reached
     * `BaseRepository.scope()` with no tenant context and threw, surfacing as
     * a 500 for an ordinary authenticated caller.
     *
     * The refusal is deliberate: cross-tenant reads belong on the platform
     * endpoints built for them, not on a college's own routes.
     */
    it('is refused rather than failing internally', async () => {
      const platform = await createPlatformAdmin(app);

      await request(app)
        .get(API + '/departments')
        .set(auth(platform.token))
        .expect(403);

      await request(app)
        .get(API + '/batches')
        .set(auth(platform.token))
        .expect(403);
    });
  });
});
