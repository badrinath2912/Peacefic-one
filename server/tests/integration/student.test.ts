import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { BatchModel } from '@/models/batch.model';
import { CollegeModel } from '@/models/college.model';
import { DepartmentModel } from '@/models/department.model';
import { StudentModel } from '@/models/student.model';
import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, studentPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('student API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('create', () => {
    it('creates the user and student together and moves every counter', async () => {
      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      expect(response.body.data.rollNumber).toBe('CS22B001');

      const [college, department, batch, user] = await Promise.all([
        CollegeModel.findById(tenant.collegeId).exec(),
        DepartmentModel.findById(tenant.departmentId).exec(),
        BatchModel.findById(tenant.batchId).exec(),
        UserModel.findOne({ email: 'meera.iyer@example.edu' }).exec(),
      ]);

      expect(college?.stats.totalStudents).toBe(1);
      expect(department?.stats.totalStudents).toBe(1);
      expect(batch?.stats.totalStudents).toBe(1);

      // The login identity must exist, and must not be usable before invite.
      expect(user).not.toBeNull();
      expect(user?.status).toBe('pending_verification');
    });

    it('rejects a duplicate roll number', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { email: 'other@example.edu' }))
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('rejects a batch that belongs to another department', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { departmentId: String(otherDepartment._id) }))
        .expect(422);

      expect(response.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('rejects a duplicate admission number', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(
          studentPayload(tenant, {
            email: 'other.adm@example.edu',
            rollNumber: 'CS22B777',
            admissionNumber: 'ADM-CS22B001',
          }),
        )
        .expect(409);

      expect(response.body.error.details[0].field).toBe('admissionNumber');
    });

    it('stores only the last four digits of an Aadhaar number', async () => {
      const aadhaar = '234567890124'; // valid Verhoeff checksum

      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { aadhaarNumber: aadhaar }))
        .expect(201);

      // The full number must never come back in a response.
      expect(JSON.stringify(response.body)).not.toContain(aadhaar);
      expect(response.body.data.aadhaar.last4).toBe('0124');
      // Nor should the hash, which is select:false.
      expect(response.body.data.aadhaar.hash).toBeUndefined();

      const stored = await StudentModel.findById(response.body.data.id).lean().exec();
      expect(JSON.stringify(stored)).not.toContain(aadhaar);
    });

    it('rejects an Aadhaar number that fails its checksum', async () => {
      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { aadhaarNumber: '234567890123' }))
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('detects a duplicate Aadhaar without storing the number', async () => {
      const aadhaar = '234567890124';

      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { aadhaarNumber: aadhaar }))
        .expect(201);

      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(
          studentPayload(tenant, {
            email: 'dup.aadhaar@example.edu',
            rollNumber: 'CS22B888',
            aadhaarNumber: aadhaar,
          }),
        )
        .expect(409);

      expect(response.body.error.details[0].field).toBe('aadhaarNumber');
      expect(response.body.error.message).not.toContain(aadhaar);
    });

    it('never returns a password hash', async () => {
      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });
  });

  describe('soft delete', () => {
    it('decrements counters and frees the roll number for reuse', async () => {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      await request(app)
        .delete(`${API}/students/${created.body.data.id}`)
        .set(auth(tenant.token))
        .expect(200);

      const batch = await BatchModel.findById(tenant.batchId).exec();
      expect(batch?.stats.totalStudents).toBe(0);

      // Institutions do reissue roll numbers.
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { email: 'reused@example.edu' }))
        .expect(201);
    });
  });

  describe('import', () => {
    const rows = [
      {
        firstName: 'Arjun',
        lastName: 'Nair',
        email: 'arjun.nair@example.edu',
        rollNumber: 'CS22B010',
        departmentCode: 'CSE',
        batchCode: 'CSE-22-A',
        admissionDate: '2022-08-01',
      },
      {
        firstName: 'Divya',
        lastName: 'Menon',
        email: 'divya.menon@example.edu',
        rollNumber: 'CS22B011',
        departmentCode: 'NOPE',
        batchCode: 'CSE-22-A',
        admissionDate: '2022-08-01',
      },
    ];

    it('writes nothing on a dry run and reports per-row outcomes', async () => {
      const response = await request(app)
        .post(`${API}/students/bulk/import?dryRun=true`)
        .set(auth(tenant.token))
        .send({ rows })
        .expect(200);

      expect(response.body.data.dryRun).toBe(true);
      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toContain('Unknown department code');

      expect(await StudentModel.countDocuments({})).toBe(0);
    });

    it('imports only the valid rows when confirmed', async () => {
      const response = await request(app)
        .post(`${API}/students/bulk/import?dryRun=false`)
        .set(auth(tenant.token))
        .send({ rows })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(await StudentModel.countDocuments({})).toBe(1);
    });

    it('catches duplicates within the file itself', async () => {
      const duplicated = [rows[0], { ...rows[0], email: 'different@example.edu' }];

      const response = await request(app)
        .post(`${API}/students/bulk/import?dryRun=true`)
        .set(auth(tenant.token))
        .send({ rows: duplicated })
        .expect(200);

      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toContain('Duplicate roll number');
    });
  });

  describe('profile', () => {
    it('assembles the whole profile in one request', async () => {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const response = await request(app)
        .get(`${API}/students/${created.body.data.id}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      const { data } = response.body;

      expect(data.student.rollNumber).toBe('CS22B001');
      expect(data.account.email).toBe('meera.iyer@example.edu');
      expect(data.attendance).toHaveProperty('threshold');
      expect(data.placement).toHaveProperty('isPlaced', false);
      expect(Array.isArray(data.documents)).toBe(true);
      expect(Array.isArray(data.activity)).toBe(true);
      // The creation itself is the first timeline entry.
      expect(data.activity.length).toBeGreaterThan(0);
    });

    it('never leaks the Aadhaar hash through the profile', async () => {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { aadhaarNumber: '234567890124' }))
        .expect(201);

      const response = await request(app)
        .get(`${API}/students/${created.body.data.id}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.student.aadhaar.last4).toBe('0124');
      expect(response.body.data.student.aadhaar.hash).toBeUndefined();
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      for (const index of [1, 2, 3]) {
        await request(app)
          .post(`${API}/students`)
          .set(auth(tenant.token))
          .send(
            studentPayload(tenant, {
              email: `export${index}@example.edu`,
              rollNumber: `CS22E00${index}`,
            }),
          )
          .expect(201);
      }
    });

    it('exports every filtered row as CSV', async () => {
      const response = await request(app)
        .post(`${API}/students/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['x-row-count']).toBe('3');

      const csv = response.text ?? response.body.toString();
      expect(csv).toContain('Admission Number');
      expect(csv).toContain('CS22E001');
    });

    it('exports only the selected rows when ids are given', async () => {
      const list = await request(app)
        .get(`${API}/students`)
        .set(auth(tenant.token))
        .expect(200);

      const firstId = list.body.data[0].id as string;

      const response = await request(app)
        .post(`${API}/students/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({ ids: [firstId] })
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');
    });

    it('produces a real xlsx workbook', async () => {
      const response = await request(app)
        .post(`${API}/students/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        // Supertest parses unknown mime types as text unless told to buffer.
        .responseType('blob')
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toContain('spreadsheetml');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      // XLSX is a zip: it must start with the PK signature.
      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('never includes Aadhaar in an export', async () => {
      const response = await request(app)
        .post(`${API}/students/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      const csv = response.text ?? response.body.toString();
      expect(csv.toLowerCase()).not.toContain('aadhaar');
    });

    it('neutralises a formula so the file cannot attack whoever opens it', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(
          studentPayload(tenant, {
            email: 'formula@example.edu',
            rollNumber: 'CS22E900',
            firstName: '=HYPERLINK("http://evil.test")',
          }),
        )
        .expect(201);

      const response = await request(app)
        .post(`${API}/students/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      const csv = response.text ?? response.body.toString();
      expect(csv).toContain("'=HYPERLINK");
    });

    it('refuses a student the export endpoint', async () => {
      const list = await request(app).get(`${API}/students`).set(auth(tenant.token));
      const student = await StudentModel.findById(list.body.data[0].id).exec();

      const { hashPassword } = await import('@/utils/crypto');
      await UserModel.updateOne(
        { _id: student?.userId },
        { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
      ).exec();

      const user = await UserModel.findById(student?.userId).exec();
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user?.email, password: 'CorrectHorse9' })
        .expect(200);

      await request(app)
        .post(`${API}/students/bulk/export?format=csv`)
        .set(auth(login.body.data.accessToken))
        .send({})
        .expect(403);
    });
  });

  describe('bulk actions', () => {
    it('bulk updates status across selected students', async () => {
      const ids: string[] = [];

      for (const index of [1, 2]) {
        const created = await request(app)
          .post(`${API}/students`)
          .set(auth(tenant.token))
          .send(
            studentPayload(tenant, {
              email: `bulk${index}@example.edu`,
              rollNumber: `CS22F00${index}`,
            }),
          )
          .expect(201);
        ids.push(created.body.data.id as string);
      }

      const response = await request(app)
        .patch(`${API}/students/bulk`)
        .set(auth(tenant.token))
        .send({ ids, patch: { status: 'on_leave' } })
        .expect(200);

      expect(response.body.data.successCount).toBe(2);

      const updated = await StudentModel.find({ _id: { $in: ids } }).exec();
      expect(updated.every((student) => student.status === 'on_leave')).toBe(true);
    });

    it('reports per-row outcomes rather than failing the whole batch', async () => {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { email: 'partial@example.edu', rollNumber: 'CS22G001' }))
        .expect(201);

      const response = await request(app)
        .patch(`${API}/students/bulk`)
        .set(auth(tenant.token))
        .send({
          ids: [created.body.data.id, '0'.repeat(24)],
          patch: { status: 'on_leave' },
        })
        .expect(200);

      // One good id, one that does not exist: the good one still applies.
      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
    });
  });

  describe('scope', () => {
    it('shows a faculty member only students in their assigned batches', async () => {
      const otherBatch = await BatchModel.create({
        collegeId: tenant.collegeId,
        departmentId: tenant.departmentId,
        name: 'CSE 2022-2026 Section B',
        code: 'CSE-22-B',
        admissionYear: 2022,
        graduationYear: 2026,
        capacity: 60,
        status: 'active',
      });

      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(
          studentPayload(tenant, {
            email: 'sectionb@example.edu',
            rollNumber: 'CS22B500',
            batchId: String(otherBatch._id),
          }),
        )
        .expect(201);

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.scope@example.edu',
        assignedBatchIds: [tenant.batchId],
      });

      const response = await request(app)
        .get(`${API}/students`)
        .set(auth(faculty.token))
        .expect(200);

      // Scope filters the list rather than rejecting the request.
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].rollNumber).toBe('CS22B001');
    });

    it('returns 404 when a faculty member fetches a student outside their batches', async () => {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.noscope@example.edu',
        assignedBatchIds: [],
      });

      // 404 rather than 403: a 403 would confirm the record exists.
      await request(app)
        .get(`${API}/students/${created.body.data.id}`)
        .set(auth(faculty.token))
        .expect(404);
    });
  });

  describe('student portal', () => {
    async function createStudentLogin() {
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const student = await StudentModel.findById(created.body.data.id).exec();
      const { hashPassword } = await import('@/utils/crypto');

      await UserModel.updateOne(
        { _id: student?.userId },
        { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
      ).exec();

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'meera.iyer@example.edu', password: 'CorrectHorse9' })
        .expect(200);

      return { studentId: String(student?._id), token: login.body.data.accessToken as string };
    }

    it('returns the caller\'s own profile without an id in the URL', async () => {
      const { token, studentId } = await createStudentLogin();

      const response = await request(app).get(`${API}/students/me`).set(auth(token)).expect(200);

      expect(response.body.data.id).toBe(studentId);
      expect(response.body.data.rollNumber).toBe('CS22B001');
    });

    it('lets a student update contact details', async () => {
      const { token } = await createStudentLogin();

      const response = await request(app)
        .patch(`${API}/students/me`)
        .set(auth(token))
        .send({ bloodGroup: 'O+', portfolioLinks: { github: 'https://github.com/meera' } })
        .expect(200);

      expect(response.body.data.bloodGroup).toBe('O+');
    });

    it('rejects a student trying to change institutional fields', async () => {
      const { token } = await createStudentLogin();

      // Rejected at the API, not merely disabled in the UI.
      const response = await request(app)
        .patch(`${API}/students/me`)
        .set(auth(token))
        .send({ rollNumber: 'HACKED', academics: { currentCgpa: 10 } })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const student = await StudentModel.findOne({ rollNumber: 'CS22B001' }).exec();
      expect(student).not.toBeNull();
    });

    it('refuses a student access to the student list', async () => {
      const { token } = await createStudentLogin();
      await request(app).get(`${API}/students`).set(auth(token)).expect(403);
    });

    it('refuses a student access to another student record', async () => {
      const other = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { email: 'other2@example.edu', rollNumber: 'CS22B999' }))
        .expect(201);

      const { token } = await createStudentLogin();

      // 403 rather than 404 here: a student holds no `student:read` permission
      // at all, so the middleware rejects before scope is resolved. That leaks
      // nothing — the same response comes back for a non-existent id.
      await request(app)
        .get(`${API}/students/${other.body.data.id}`)
        .set(auth(token))
        .expect(403);

      await request(app)
        .get(`${API}/students/${'0'.repeat(24)}`)
        .set(auth(token))
        .expect(403);
    });
  });

  describe('cross-tenant', () => {
    it('does not expose another college\'s students', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const otherTenant = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/students`)
        .set(auth(otherTenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });
});
