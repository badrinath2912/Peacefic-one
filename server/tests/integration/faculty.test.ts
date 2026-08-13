import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { AttendanceSessionModel } from '@/models/attendance-session.model';
import { BatchModel } from '@/models/batch.model';
import { CollegeModel } from '@/models/college.model';
import { DepartmentModel } from '@/models/department.model';
import { FacultyModel } from '@/models/faculty.model';
import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, facultyPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('faculty API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('create', () => {
    it('creates the user and faculty record and moves the counters', async () => {
      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      expect(response.body.data.employeeId).toBe('EMP1042');

      const [college, department, user] = await Promise.all([
        CollegeModel.findById(tenant.collegeId).exec(),
        DepartmentModel.findById(tenant.departmentId).exec(),
        UserModel.findOne({ email: 'ravi.kumar@example.edu' }).exec(),
      ]);

      expect(college?.stats.totalFaculty).toBe(1);
      expect(department?.stats.totalFaculty).toBe(1);
      expect(user?.status).toBe('pending_verification');
    });

    it('rejects a duplicate employee ID', async () => {
      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { email: 'other@example.edu' }))
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('creates a trainer as faculty with a type discriminator', async () => {
      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'trainer@example.edu',
            employeeId: 'TRN001',
            type: 'trainer',
            roleKey: 'trainer',
          }),
        )
        .expect(201);

      // Trainers are not a separate collection.
      expect(response.body.data.type).toBe('trainer');
      expect(await FacultyModel.countDocuments({ type: 'trainer' })).toBe(1);
    });

    it('rejects a batch that belongs to another department', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const otherBatch = await BatchModel.create({
        collegeId: tenant.collegeId,
        departmentId: otherDepartment._id,
        name: 'MECH 2022',
        code: 'MECH-22-A',
        admissionYear: 2022,
        graduationYear: 2026,
        capacity: 60,
        status: 'active',
      });

      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { assignedBatchIds: [String(otherBatch._id)] }))
        .expect(400);

      expect(response.body.error.message).toContain('another department');
    });
  });

  describe('a head of department reads faculty in their own department', () => {
    /**
     * Both detail reads populate `departmentId`, so the scope guard was handed
     * a Department document where it expected an id. It stringifies whatever it
     * gets, so the lookup matched nothing and the head of their own department
     * was refused their own staff.
     *
     * Nobody else could see it: `isCollegeWide()` short-circuits administrators
     * and a placement officer returns early, so an HOD is the only role that
     * reaches the comparison at all.
     */
    it('allows the detail and profile reads, and still refuses another department', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { email: 'own.dept@example.edu', employeeId: 'EMPOWN' }))
        .expect(201);

      const facultyId = created.body.data.id;

      // The fixture makes this user head of `tenant.departmentId`, which is the
      // department the faculty member above belongs to.
      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'dept.head@example.edu',
        employeeId: 'EMPHEAD',
      });

      const department = await DepartmentModel.findById(tenant.departmentId).exec();
      expect(String(department?.hodId)).toBe(String(hod.userId));

      await request(app).get(`${API}/faculty/${facultyId}`).set(auth(hod.token)).expect(200);

      await request(app)
        .get(`${API}/faculty/${facultyId}/profile`)
        .set(auth(hod.token))
        .expect(200);

      // The guard must still bite: fixing the id must not turn it into a
      // blanket allow. A head of one department cannot read another's staff.
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const outsider = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'other.dept@example.edu',
            employeeId: 'EMPOTHER',
            departmentId: String(otherDepartment._id),
          }),
        )
        .expect(201);

      await request(app)
        .get(`${API}/faculty/${outsider.body.data.id}`)
        .set(auth(hod.token))
        .expect(403);
    });
  });

  describe('privilege escalation', () => {
    it('stops an HOD assigning a role holding permissions they lack', async () => {
      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod@example.edu',
        employeeId: 'EMPHOD',
      });

      // An HOD cannot mint a college_admin: the service compares the target
      // role's permissions against the caller's own grants.
      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(hod.token))
        .send(
          facultyPayload(tenant, {
            email: 'escalate@example.edu',
            employeeId: 'EMPESC',
            roleKey: 'placement_officer',
          }),
        )
        .expect(400);

      expect(response.body.error.message).toContain('permissions you do not have');
    });
  });

  describe('batch assignment', () => {
    it('assigns batches within the department', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const response = await request(app)
        .patch(`${API}/faculty/${created.body.data.id}/batches`)
        .set(auth(tenant.token))
        .send({ assignedBatchIds: [tenant.batchId] })
        .expect(200);

      expect(response.body.data.assignedBatchIds).toHaveLength(1);
    });

    it('refuses to unassign a batch with unmarked past sessions', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { assignedBatchIds: [tenant.batchId] }))
        .expect(201);

      await AttendanceSessionModel.create({
        collegeId: tenant.collegeId,
        batchId: tenant.batchId,
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        startTime: '09:00',
        endTime: '10:00',
        type: 'lecture',
        markedByFacultyId: created.body.data.id,
        status: 'pending_marking',
      });

      // Otherwise those sessions become nobody's responsibility.
      const response = await request(app)
        .patch(`${API}/faculty/${created.body.data.id}/batches`)
        .set(auth(tenant.token))
        .send({ assignedBatchIds: [] })
        .expect(422);

      expect(response.body.error.message).toContain('unmarked session');
    });
  });

  describe('delete', () => {
    it('archives the login identity and decrements counters', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      await request(app)
        .delete(`${API}/faculty/${created.body.data.id}`)
        .set(auth(tenant.token))
        .expect(200);

      const [department, user] = await Promise.all([
        DepartmentModel.findById(tenant.departmentId).exec(),
        UserModel.findOne({ email: 'ravi.kumar@example.edu' }).exec(),
      ]);

      expect(department?.stats.totalFaculty).toBe(0);
      // The account must not still authenticate.
      expect(user?.status).toBe('archived');
    });

    it('refuses to delete someone who is still an HOD', async () => {
      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.delete@example.edu',
        employeeId: 'EMPHOD2',
      });

      const response = await request(app)
        .delete(`${API}/faculty/${hod.facultyId}`)
        .set(auth(tenant.token))
        .expect(422);

      expect(response.body.error.message).toContain('Head of');
    });
  });

  describe('reporting', () => {
    it('reports workload across assigned batches', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { assignedBatchIds: [tenant.batchId] }))
        .expect(201);

      const response = await request(app)
        .get(`${API}/faculty/${created.body.data.id}/workload`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.batchCount).toBe(1);
    });

    it('reports attendance compliance', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { assignedBatchIds: [tenant.batchId] }))
        .expect(201);

      await AttendanceSessionModel.create([
        {
          collegeId: tenant.collegeId,
          batchId: tenant.batchId,
          date: new Date(),
          startTime: '09:00',
          endTime: '10:00',
          markedByFacultyId: created.body.data.id,
          status: 'marked',
        },
        {
          collegeId: tenant.collegeId,
          batchId: tenant.batchId,
          date: new Date(),
          periodNumber: 2,
          startTime: '10:00',
          endTime: '11:00',
          markedByFacultyId: created.body.data.id,
          status: 'pending_marking',
        },
      ]);

      const response = await request(app)
        .get(`${API}/faculty/${created.body.data.id}/attendance-compliance`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.totalSessions).toBe(2);
      expect(response.body.data.markedSessions).toBe(1);
      expect(response.body.data.complianceRate).toBe(50);
    });
  });

  describe('import', () => {
    it('writes nothing on a dry run', async () => {
      const rows = [
        {
          firstName: 'Nisha',
          lastName: 'Verma',
          email: 'nisha.verma@example.edu',
          employeeId: 'EMP2001',
          departmentCode: 'CSE',
          designation: 'Associate Professor',
          joiningDate: '2018-06-01',
        },
        {
          firstName: 'Bad',
          lastName: 'Row',
          email: 'bad.row@example.edu',
          employeeId: 'EMP2002',
          departmentCode: 'NOPE',
          designation: 'Lecturer',
          joiningDate: '2018-06-01',
        },
      ];

      const response = await request(app)
        .post(`${API}/faculty/bulk/import?dryRun=true`)
        .set(auth(tenant.token))
        .send({ rows })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(await FacultyModel.countDocuments({})).toBe(0);
    });
  });

  describe('extended fields', () => {
    it('persists address, emergency contact and photo', async () => {
      const response = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            alternatePhone: '+919812345600',
            photoUrl: 'https://cdn.example.com/photo.png',
            address: {
              line1: '12 Faculty Quarters',
              city: 'Coimbatore',
              district: 'Coimbatore',
              state: 'Tamil Nadu',
              country: 'India',
              pincode: '641004',
            },
            emergencyContact: {
              name: 'Suresh Kumar',
              relation: 'Brother',
              phone: '+919812345699',
            },
          }),
        )
        .expect(201);

      // District regressed once by existing in the Zod schema but not the model.
      expect(response.body.data.address.district).toBe('Coimbatore');
      expect(response.body.data.emergencyContact.name).toBe('Suresh Kumar');
      expect(response.body.data.alternatePhone).toBe('+919812345600');
      expect(response.body.data.photoUrl).toBe('https://cdn.example.com/photo.png');
    });

    it('rejects an emergency contact missing its phone', async () => {
      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'nocontact@example.edu',
            employeeId: 'EMPNC',
            emergencyContact: { name: 'Someone', relation: 'Friend' },
          }),
        )
        .expect(400);
    });
  });

  describe('profile', () => {
    it('assembles the profile in one request', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { assignedBatchIds: [tenant.batchId] }))
        .expect(201);

      const response = await request(app)
        .get(`${API}/faculty/${created.body.data.id}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      const { data } = response.body;

      expect(data.faculty.employeeId).toBe('EMP1042');
      expect(data.account.email).toBe('ravi.kumar@example.edu');
      expect(data.workload.batchCount).toBe(1);
      expect(data.compliance).toHaveProperty('complianceRate');
      expect(Array.isArray(data.headsOf)).toBe(true);
      expect(Array.isArray(data.activity)).toBe(true);
    });

    it('never returns a password hash', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const response = await request(app)
        .get(`${API}/faculty/${created.body.data.id}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('refuses an HOD the profile of another department', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      const outsider = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'mech.profile@example.edu',
            employeeId: 'EMPMP',
            departmentId: String(otherDepartment._id),
          }),
        )
        .expect(201);

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.profile@example.edu',
        employeeId: 'EMPHODP',
      });

      await request(app)
        .get(`${API}/faculty/${outsider.body.data.id}/profile`)
        .set(auth(hod.token))
        .expect(403);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      for (const index of [1, 2]) {
        await request(app)
          .post(`${API}/faculty`)
          .set(auth(tenant.token))
          .send(
            facultyPayload(tenant, {
              email: `exp${index}@example.edu`,
              employeeId: `EMPX00${index}`,
            }),
          )
          .expect(201);
      }
    });

    it('exports the filtered set as CSV', async () => {
      const response = await request(app)
        .post(`${API}/faculty/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['x-row-count']).toBe('2');

      const csv = response.text ?? String(response.body);
      expect(csv).toContain('Employee ID');
      expect(csv).toContain('EMPX001');
    });

    it('exports only the selected rows', async () => {
      const list = await request(app).get(`${API}/faculty`).set(auth(tenant.token)).expect(200);

      const response = await request(app)
        .post(`${API}/faculty/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({ ids: [list.body.data[0].id] })
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');
    });

    it('produces a real xlsx workbook', async () => {
      const response = await request(app)
        .post(`${API}/faculty/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        .responseType('blob')
        .send({})
        .expect(200);

      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('neutralises a formula in an exported cell', async () => {
      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'formula.faculty@example.edu',
            employeeId: 'EMPFRM',
            firstName: '=cmd|calc',
          }),
        )
        .expect(201);

      const response = await request(app)
        .post(`${API}/faculty/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text ?? String(response.body)).toContain("'=cmd|calc");
    });

    it('refuses a student the faculty export', async () => {
      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.export@example.edu',
      });

      await request(app)
        .post(`${API}/faculty/bulk/export?format=csv`)
        .set(auth(student.token))
        .send({})
        .expect(403);
    });
  });

  describe('bulk delete', () => {
    it('deletes the selected staff and reports the count', async () => {
      const ids: string[] = [];

      for (const index of [1, 2]) {
        const created = await request(app)
          .post(`${API}/faculty`)
          .set(auth(tenant.token))
          .send(
            facultyPayload(tenant, {
              email: `bulkdel${index}@example.edu`,
              employeeId: `EMPBD0${index}`,
            }),
          )
          .expect(201);
        ids.push(created.body.data.id as string);
      }

      const response = await request(app)
        .delete(`${API}/faculty/bulk`)
        .set(auth(tenant.token))
        .send({ ids })
        .expect(200);

      expect(response.body.data.successCount).toBe(2);
      expect(await FacultyModel.countDocuments({ deletedAt: null })).toBe(0);
    });

    it('skips the one that still heads a department without failing the batch', async () => {
      const ordinary = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { email: 'ok@example.edu', employeeId: 'EMPOK' }))
        .expect(201);

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.bulk@example.edu',
        employeeId: 'EMPHODB',
      });

      const response = await request(app)
        .delete(`${API}/faculty/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [ordinary.body.data.id, hod.facultyId] })
        .expect(200);

      // One blocked member must not prevent the rest being removed.
      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toContain('Head of');
    });

    it('refuses a faculty member the bulk delete', async () => {
      const member = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.nodelete@example.edu',
        employeeId: 'EMPND',
      });

      await request(app)
        .delete(`${API}/faculty/bulk`)
        .set(auth(member.token))
        .send({ ids: ['0'.repeat(24)] })
        .expect(403);
    });
  });

  describe('scope and tenancy', () => {
    it('shows an HOD only their own department', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: tenant.collegeId,
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(
          facultyPayload(tenant, {
            email: 'mech@example.edu',
            employeeId: 'EMPMECH',
            departmentId: String(otherDepartment._id),
          }),
        )
        .expect(201);

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.scope@example.edu',
        employeeId: 'EMPHOD3',
      });

      const response = await request(app)
        .get(`${API}/faculty`)
        .set(auth(hod.token))
        .expect(200);

      // The HOD themselves plus the CSE member, but not the MECH member.
      const departments = new Set(
        (response.body.data as Array<{ departmentId: string }>).map((f) =>
          typeof f.departmentId === 'string' ? f.departmentId : String(f.departmentId),
        ),
      );
      expect(departments.has(String(otherDepartment._id))).toBe(false);
    });

    it('does not expose another college\'s faculty', async () => {
      await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const otherTenant = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/faculty`)
        .set(auth(otherTenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('refuses a student any access to faculty records', async () => {
      const created = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant))
        .expect(201);

      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.faculty@example.edu',
      });

      await request(app).get(`${API}/faculty`).set(auth(student.token)).expect(403);
      await request(app)
        .get(`${API}/faculty/${created.body.data.id}`)
        .set(auth(student.token))
        .expect(403);
    });
  });
});
