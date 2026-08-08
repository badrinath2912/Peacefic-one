import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { CourseModel } from '@/models/course.model';
import { DepartmentModel } from '@/models/department.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, facultyPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('course API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const coursePayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Data Structures and Algorithms',
    code: 'CS201',
    description: 'Core data structures, complexity analysis and algorithm design.',
    category: 'technical',
    level: 'intermediate',
    durationHours: 45,
    credits: 4,
    semester: 3,
    departmentIds: [tenant.departmentId],
    batchIds: [tenant.batchId],
    instructorIds: [],
    prerequisites: [],
    learningOutcomes: ['Analyse complexity', 'Implement core structures'],
    tags: ['algorithms'],
    status: 'draft',
    ...overrides,
  });

  async function createCourse(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/courses`)
      .set(auth(tenant.token))
      .send(coursePayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  describe('create', () => {
    it('creates a course with its relationships', async () => {
      const response = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send(coursePayload())
        .expect(201);

      expect(response.body.data.code).toBe('CS201');
      expect(response.body.data.semester).toBe(3);
      expect(response.body.data.departmentIds).toHaveLength(1);
      // Draft courses have no publication date.
      expect(response.body.data.publishedAt).toBeNull();
    });

    it('stamps publishedAt when created as published', async () => {
      const response = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send(coursePayload({ code: 'CS202', status: 'published' }))
        .expect(201);

      expect(response.body.data.publishedAt).not.toBeNull();
    });

    it('rejects a duplicate course code', async () => {
      await createCourse();

      const response = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send(coursePayload())
        .expect(409);

      expect(response.body.error.details[0].field).toBe('code');
    });

    it('rejects an unknown department', async () => {
      const response = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send(coursePayload({ code: 'CS203', departmentIds: ['0'.repeat(24)] }))
        .expect(400);

      expect(response.body.error.details[0].field).toBe('departmentIds');
    });

    it('rejects an inactive instructor', async () => {
      const staff = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { status: 'resigned', email: 'gone@example.edu' }))
        .expect(201);

      const response = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send(coursePayload({ code: 'CS204', instructorIds: [staff.body.data.id] }))
        .expect(400);

      expect(response.body.error.details[0].field).toBe('instructorIds');
    });
  });

  describe('update', () => {
    it('stamps publishedAt on the first transition to published only', async () => {
      const id = await createCourse();

      const published = await request(app)
        .patch(`${API}/courses/${id}`)
        .set(auth(tenant.token))
        .send({ status: 'published' })
        .expect(200);

      const firstStamp = published.body.data.publishedAt;
      expect(firstStamp).not.toBeNull();

      // Archiving then republishing must not rewrite the original date.
      await request(app)
        .patch(`${API}/courses/${id}`)
        .set(auth(tenant.token))
        .send({ status: 'archived' })
        .expect(200);

      const republished = await request(app)
        .patch(`${API}/courses/${id}`)
        .set(auth(tenant.token))
        .send({ status: 'published' })
        .expect(200);

      expect(republished.body.data.publishedAt).toBe(firstStamp);
    });

    it('refuses to make a course its own prerequisite', async () => {
      const id = await createCourse();

      const response = await request(app)
        .patch(`${API}/courses/${id}`)
        .set(auth(tenant.token))
        .send({ prerequisites: [id] })
        .expect(400);

      expect(response.body.error.details[0].field).toBe('prerequisites');
    });

    it('assigns instructors through the dedicated endpoint', async () => {
      const id = await createCourse();

      const staff = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const response = await request(app)
        .patch(`${API}/courses/${id}/instructors`)
        .set(auth(tenant.token))
        .send({ instructorIds: [staff.body.data.id] })
        .expect(200);

      expect(response.body.data.instructorIds).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('removes a course with no dependents', async () => {
      const id = await createCourse();

      await request(app).delete(`${API}/courses/${id}`).set(auth(tenant.token)).expect(200);

      expect(await CourseModel.countDocuments({ deletedAt: null })).toBe(0);
    });

    it('refuses when another course lists it as a prerequisite', async () => {
      const base = await createCourse();
      await createCourse({ code: 'CS301', prerequisites: [base] });

      const response = await request(app)
        .delete(`${API}/courses/${base}`)
        .set(auth(tenant.token))
        .expect(422);

      // Names the blocker rather than refusing flatly.
      expect(response.body.error.message).toContain('CS301');
    });

    it('skips a blocked course in a bulk delete without failing the batch', async () => {
      const base = await createCourse();
      const dependent = await createCourse({ code: 'CS301', prerequisites: [base] });

      const response = await request(app)
        .delete(`${API}/courses/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [base, dependent] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
    });
  });

  describe('profile and analytics', () => {
    it('returns the course with its instructors and dependents', async () => {
      const base = await createCourse();
      await createCourse({ code: 'CS301', prerequisites: [base] });

      const response = await request(app)
        .get(`${API}/courses/${base}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.course.code).toBe('CS201');
      expect(response.body.data.dependents).toHaveLength(1);
      expect(response.body.data.dependents[0].code).toBe('CS301');
    });

    it('summarises the catalogue', async () => {
      await createCourse();
      await createCourse({ code: 'CS302', status: 'published' });

      const response = await request(app)
        .get(`${API}/courses/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(2);
      expect(response.body.data.published).toBe(1);
      expect(response.body.data.draft).toBe(1);
    });
  });

  describe('export', () => {
    it('exports courses as CSV', async () => {
      await createCourse();

      const response = await request(app)
        .post(`${API}/courses/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');

      const csv = response.text ?? String(response.body);
      expect(csv).toContain('Prerequisites');
      expect(csv).toContain('CS201');
    });

    it('produces a real xlsx workbook', async () => {
      await createCourse();

      const response = await request(app)
        .post(`${API}/courses/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        .responseType('blob')
        .send({})
        .expect(200);

      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('neutralises a formula in an exported cell', async () => {
      await createCourse({ code: 'CS400', title: '=cmd|calc' });

      const response = await request(app)
        .post(`${API}/courses/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text ?? String(response.body)).toContain("'=cmd|calc");
    });
  });

  describe('permissions', () => {
    it('refuses a student the create endpoint', async () => {
      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.course@example.edu',
      });

      await request(app)
        .post(`${API}/courses`)
        .set(auth(student.token))
        .send(coursePayload({ code: 'CS999' }))
        .expect(403);
    });

    it('allows a student to read the catalogue', async () => {
      await createCourse({ status: 'published' });

      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.read@example.edu',
      });

      await request(app).get(`${API}/courses`).set(auth(student.token)).expect(200);
    });

    it('refuses a faculty member the delete endpoint', async () => {
      const id = await createCourse();

      const member = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.nodel@example.edu',
        employeeId: 'EMPCD',
      });

      await request(app).delete(`${API}/courses/${id}`).set(auth(member.token)).expect(403);
    });
  });

  describe('scope and tenancy', () => {
    it('does not expose another college\'s courses', async () => {
      await createCourse();

      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/courses`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('returns 404 when another tenant fetches a course by id', async () => {
      const id = await createCourse();

      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      // 404 rather than 403: a 403 would confirm the course exists.
      await request(app).get(`${API}/courses/${id}`).set(auth(other.token)).expect(404);
    });

    it('hides a course belonging only to another department from an HOD', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const foreign = await createCourse({
        code: 'ME101',
        departmentIds: [String(otherDepartment._id)],
        batchIds: [],
      });

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.course@example.edu',
        employeeId: 'EMPHC',
      });

      const list = await request(app).get(`${API}/courses`).set(auth(hod.token)).expect(200);
      const ids = (list.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).not.toContain(foreign);

      await request(app).get(`${API}/courses/${foreign}`).set(auth(hod.token)).expect(404);
    });

    it('shows a college-wide course to every department', async () => {
      const shared = await createCourse({ code: 'GEN101', departmentIds: [], batchIds: [] });

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.shared@example.edu',
        employeeId: 'EMPHS2',
      });

      const list = await request(app).get(`${API}/courses`).set(auth(hod.token)).expect(200);
      const ids = (list.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(shared);
    });
  });
});
