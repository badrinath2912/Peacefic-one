import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import { AttendanceRecordModel } from '@/models/attendance-record.model';
import { AttendanceSummaryModel } from '@/models/attendance-summary.model';
import { CollegeModel } from '@/models/college.model';
import { DepartmentModel } from '@/models/department.model';
import { NotificationModel } from '@/models/notification.model';
import { StudentModel } from '@/models/student.model';
import { UserModel } from '@/models/user.model';
import { hashPassword } from '@/utils/crypto';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, studentPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

describe('attendance API', () => {
  const app = testApp();
  let tenant: TenantFixture;
  let marker: { token: string; userId: string; facultyId: string | null };

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    // Attendance is recorded by whoever runs the session. The college admin
    // oversees it and keeps override_lock, but no longer marks or corrects —
    // so write calls below authenticate as a faculty member.
    marker = await createStaffUser(app, tenant, {
      roleKey: ROLE_KEYS.FACULTY,
      email: 'attendance.marker@example.edu',
      // Faculty are scoped to their assigned batches by the scope guard, so a
      // marker with none would be refused the batch rather than the permission.
      assignedBatchIds: [tenant.batchId],
    });
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const yesterday = (): string =>
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function createStudents(count: number): Promise<string[]> {
    const ids: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const response = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(
          studentPayload(tenant, {
            email: `student${index}@example.edu`,
            rollNumber: `CS22B${String(index).padStart(3, '0')}`,
          }),
        )
        .expect(201);

      ids.push(response.body.data.id as string);
    }

    return ids;
  }

  async function createSession(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/attendance/sessions`)
      .set(auth(marker.token))
      .send({
        batchId: tenant.batchId,
        date: yesterday(),
        startTime: '09:00',
        endTime: '10:00',
        type: 'lecture',
        topic: 'Data Structures',
        ...overrides,
      })
      .expect(201);

    return response.body.data.id as string;
  }

  describe('sessions', () => {
    it('creates a session for a past date', async () => {
      const sessionId = await createSession();
      expect(sessionId).toBeTruthy();

      const response = await request(app)
        .get(`${API}/attendance/sessions/${sessionId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.status).toBe('pending_marking');
    });

    it('refuses a session dated in the future', async () => {
      const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const response = await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: tomorrow,
          startTime: '09:00',
          endTime: '10:00',
        })
        .expect(422);

      expect(response.body.error.message).toContain('future date');
    });

    it('refuses a duplicate session for the same batch, date and period', async () => {
      await createSession({ periodNumber: 1 });

      const response = await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          periodNumber: 1,
          startTime: '09:00',
          endTime: '10:00',
        })
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('returns a marking sheet listing the whole roster', async () => {
      await createStudents(3);
      const sessionId = await createSession();

      const response = await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.roster).toHaveLength(3);
      expect(response.body.data.roster[0].status).toBeNull();
    });
  });

  describe('marking', () => {
    it('marks the whole roster in one request and updates session stats', async () => {
      const students = await createStudents(4);
      const sessionId = await createSession();

      const response = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[1], status: 'present' },
            { studentId: students[2], status: 'absent' },
            { studentId: students[3], status: 'late' },
          ],
        })
        .expect(200);

      expect(response.body.data.stats.presentCount).toBe(2);
      expect(response.body.data.stats.absentCount).toBe(1);
      expect(response.body.data.stats.lateCount).toBe(1);
      // present + late + on_duty count as attended.
      expect(response.body.data.stats.percentage).toBe(75);

      expect(await AttendanceRecordModel.countDocuments({})).toBe(4);
    });

    it('is idempotent — re-marking replaces rather than duplicates', async () => {
      const students = await createStudents(2);
      const sessionId = await createSession();

      const body = {
        entries: [
          { studentId: students[0], status: 'present' },
          { studentId: students[1], status: 'absent' },
        ],
      };

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send(body)
        .expect(200);

      const corrected = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[1], status: 'present' },
          ],
        })
        .expect(200);

      expect(await AttendanceRecordModel.countDocuments({})).toBe(2);
      expect(corrected.body.data.stats.presentCount).toBe(2);
    });

    it('rejects a student who is not enrolled in the batch', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      const outsider = await StudentModel.findOne({ rollNumber: 'CS22B000' }).exec();

      const response = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: String(outsider?._id ?? '').replace(/.$/, '0'), status: 'present' },
          ],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate entries for the same student', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      const response = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[0], status: 'absent' },
          ],
        })
        .expect(400);

      expect(response.body.error.details[0].message).toContain('Duplicate');
    });

    it('writes attendance summaries as part of marking', async () => {
      const students = await createStudents(2);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[1], status: 'absent' },
          ],
        })
        .expect(200);

      // Summaries are the read path for every attendance figure in the product.
      const summaries = await AttendanceSummaryModel.find({ period: 'overall' }).exec();
      expect(summaries).toHaveLength(2);

      const absentee = summaries.find((s) => s.percentage === 0);
      expect(absentee?.isBelowThreshold).toBe(true);
    });
  });

  describe('threshold warnings', () => {
    it('notifies a student who falls below the college threshold', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'absent' }] })
        .expect(200);

      const notifications = await NotificationModel.find({
        type: 'attendance.below_threshold',
      }).exec();

      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.priority).toBe('high');
    });

    it('does not notify a student who is above the threshold', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(200);

      expect(
        await NotificationModel.countDocuments({ type: 'attendance.below_threshold' }),
      ).toBe(0);
    });

    it('honours a college-specific threshold', async () => {
      await CollegeModel.updateOne(
        { _id: tenant.collegeId },
        { $set: { 'settings.attendanceThresholdPercent': 40 } },
      ).exec();

      const students = await createStudents(1);
      const first = await createSession({ periodNumber: 1 });
      const second = await createSession({ periodNumber: 2 });

      await request(app)
        .post(`${API}/attendance/sessions/${first}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(200);

      await request(app)
        .post(`${API}/attendance/sessions/${second}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'absent' }] })
        .expect(200);

      // 50% clears a 40% threshold.
      expect(
        await NotificationModel.countDocuments({ type: 'attendance.below_threshold' }),
      ).toBe(0);
    });
  });

  describe('locking', () => {
    it('blocks marking a locked session', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [{ studentId: students[0], status: 'present' }],
          lockAfterMarking: true,
        })
        .expect(200);

      const response = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'absent' }] })
        .expect(422);

      expect(response.body.error.message).toContain('locked');
    });

    it('records a correction in the modification history', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'absent' }] })
        .expect(200);

      const record = await AttendanceRecordModel.findOne({ studentId: students[0] }).exec();

      const response = await request(app)
        .patch(`${API}/attendance/sessions/${sessionId}/records/${record?._id}`)
        .set(auth(marker.token))
        .send({ status: 'present', reason: 'Student produced a medical certificate' })
        .expect(200);

      expect(response.body.data.status).toBe('present');
      expect(response.body.data.modifiedHistory).toHaveLength(1);
      expect(response.body.data.modifiedHistory[0].from).toBe('absent');
    });

    it('lets an admin unlock, and records the reason', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [{ studentId: students[0], status: 'present' }],
          lockAfterMarking: true,
        })
        .expect(200);

      const response = await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/unlock`)
        .set(auth(tenant.token))
        .send({ reason: 'Correcting a data entry error reported by the department' })
        .expect(200);

      expect(response.body.data.isLocked).toBe(false);
    });

    it('refuses a faculty member the unlock permission', async () => {
      const sessionId = await createSession();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.lock@example.edu',
        employeeId: 'EMPLOCK',
        assignedBatchIds: [tenant.batchId],
      });

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/unlock`)
        .set(auth(faculty.token))
        .send({ reason: 'I would like to change this please' })
        .expect(403);
    });
  });

  describe('context discriminator', () => {
    it('defaults to class attendance', async () => {
      const sessionId = await createSession();

      const response = await request(app)
        .get(`${API}/attendance/sessions/${sessionId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.context).toBe('class');
      expect(response.body.data.contextId).toBeNull();
    });

    it('records a training session against its owning training', async () => {
      const trainingId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          startTime: '14:00',
          endTime: '16:00',
          type: 'training',
          context: 'training',
          contextId: trainingId,
        })
        .expect(201);

      expect(response.body.data.context).toBe('training');
      expect(response.body.data.contextId).toBe(trainingId);
    });

    it('lets a class and a training share a batch, date and period', async () => {
      await createSession({ periodNumber: 1 });

      // Without context in the unique index this would be a duplicate.
      await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          periodNumber: 1,
          startTime: '14:00',
          endTime: '16:00',
          type: 'workshop',
          context: 'workshop',
        })
        .expect(201);
    });

    it('still refuses a duplicate within the same context', async () => {
      await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          periodNumber: 2,
          startTime: '09:00',
          endTime: '10:00',
          context: 'seminar',
        })
        .expect(201);

      await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          periodNumber: 2,
          startTime: '09:00',
          endTime: '10:00',
          context: 'seminar',
        })
        .expect(409);
    });

    it('filters the session list by context', async () => {
      await createSession({ periodNumber: 1 });

      await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          periodNumber: 1,
          startTime: '14:00',
          endTime: '16:00',
          type: 'training',
          context: 'training',
        })
        .expect(201);

      const trainingOnly = await request(app)
        .get(`${API}/attendance/sessions?context=training`)
        .set(auth(tenant.token))
        .expect(200);

      expect(trainingOnly.body.data).toHaveLength(1);
      expect(trainingOnly.body.data[0].context).toBe('training');
    });

    it('marks training attendance through the same endpoint as class attendance', async () => {
      const students = await createStudents(2);

      const created = await request(app)
        .post(`${API}/attendance/sessions`)
        .set(auth(marker.token))
        .send({
          batchId: tenant.batchId,
          date: yesterday(),
          startTime: '14:00',
          endTime: '16:00',
          type: 'training',
          context: 'training',
        })
        .expect(201);

      // One set of marking rules, whatever the context.
      const marked = await request(app)
        .post(`${API}/attendance/sessions/${created.body.data.id}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[1], status: 'absent' },
          ],
        })
        .expect(200);

      expect(marked.body.data.stats.percentage).toBe(50);
    });
  });

  describe('scope', () => {
    it('refuses a faculty member marking a batch they do not teach', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.noscope2@example.edu',
        employeeId: 'EMPNS',
        assignedBatchIds: [],
      });

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(faculty.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(403);
    });

    it('allows a faculty member to mark their own batch', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.scope2@example.edu',
        employeeId: 'EMPS',
        assignedBatchIds: [tenant.batchId],
      });

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(faculty.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(200);
    });
  });

  describe('reports', () => {
    it('reports batch attendance sorted worst-first', async () => {
      const students = await createStudents(3);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'present' },
            { studentId: students[1], status: 'absent' },
            { studentId: students[2], status: 'present' },
          ],
        })
        .expect(200);

      const response = await request(app)
        .get(`${API}/attendance/reports/batch/${tenant.batchId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.students[0].percentage).toBe(0);
      expect(response.body.data.defaulterCount).toBe(1);
      expect(response.body.data.overallPercentage).toBeCloseTo(66.7, 0);
    });

    it('lists defaulters with the sessions needed to recover', async () => {
      const students = await createStudents(2);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({
          entries: [
            { studentId: students[0], status: 'absent' },
            { studentId: students[1], status: 'present' },
          ],
        })
        .expect(200);

      const response = await request(app)
        .get(`${API}/attendance/reports/defaulters`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.count).toBe(1);
      // From 0/1 to 75% needs 3 more attended sessions.
      expect(response.body.data.students[0].sessionsNeededForThreshold).toBe(3);
    });
  });

  describe('student portal', () => {
    async function studentLogin(studentId: string): Promise<string> {
      const student = await StudentModel.findById(studentId).exec();

      await UserModel.updateOne(
        { _id: student?.userId },
        { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
      ).exec();

      const user = await UserModel.findById(student?.userId).exec();

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user?.email, password: 'CorrectHorse9' })
        .expect(200);

      return login.body.data.accessToken as string;
    }

    it('returns the caller\'s own attendance without an id in the URL', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(200);

      const token = await studentLogin(students[0] as string);

      const response = await request(app)
        .get(`${API}/attendance/me`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data.percentage).toBe(100);
      expect(response.body.data.sessions).toHaveLength(1);
      expect(response.body.data.sessionsNeededForThreshold).toBe(0);
    });

    it('refuses a student every staff-facing attendance surface', async () => {
      const students = await createStudents(1);
      const token = await studentLogin(students[0] as string);

      // These name other students, so `attendance:read_own` must not reach them.
      await request(app)
        .get(`${API}/attendance/reports/batch/${tenant.batchId}`)
        .set(auth(token))
        .expect(403);

      await request(app)
        .get(`${API}/attendance/reports/defaulters`)
        .set(auth(token))
        .expect(403);

      await request(app).get(`${API}/attendance/sessions`).set(auth(token)).expect(403);

      await request(app)
        .get(`${API}/attendance/students/${students[0]}`)
        .set(auth(token))
        .expect(403);
    });

    it('refuses a student marking attendance', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();
      const token = await studentLogin(students[0] as string);

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(403);
    });
  });

  describe('tenancy', () => {
    it('does not expose another college\'s sessions', async () => {
      await createSession();

      const otherTenant = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/attendance/sessions`)
        .set(auth(otherTenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  /* ============================ authorization ============================= */
  /**
   * The split this suite now encodes: **reading is not marking**.
   *
   * `attendance:mark` was narrowed to the people who actually run sessions —
   * faculty and trainers. A college administrator and a head of department keep
   * `attendance:read`/`read_all` for oversight, and the administrator keeps
   * `attendance:override_lock` as a correction path.
   *
   * The sheet endpoint was gated on `mark`, which made read-only roles blind to
   * a register they are explicitly allowed to review. These tests hold both
   * halves of the line: read is permitted, marking is not.
   */
  describe('read and write are separately authorized', () => {
    it('lets a college administrator read a sheet without marking rights', async () => {
      await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(tenant.token))
        .expect(200);
    });

    it('lets a head of department read a sheet', async () => {
      await createStudents(1);
      const sessionId = await createSession();

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.attendance@example.edu',
      });

      /**
       * HOD scope resolves through `departmentRepository.findByHod(userId)`,
       * which matches on `Department.hodId` — not on the faculty record's
       * `departmentId`, and not on `assignedBatchIds`. If this assertion fails
       * the fixture never linked the department, and the 403 is a test-setup
       * fault; if it passes, the break is downstream in the repository filter
       * or the scope guard.
       */
      const department = await DepartmentModel.findById(tenant.departmentId).exec();
      expect(String(department?.hodId)).toBe(String(hod.userId));

      await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(hod.token))
        .expect(200);
    });

    /**
     * The other half of the same guarantee: restoring HOD access must not have
     * widened it. A head of one department has no business reading a register
     * for a batch in another.
     */
    it('refuses a head of department a batch outside their own department', async () => {
      const otherDepartment = await DepartmentModel.create({
        collegeId: new mongoose.Types.ObjectId(tenant.collegeId),
        name: 'Mechanical Engineering',
        code: 'MECH',
        status: 'active',
      });

      // Heads the *other* department, not the one owning the session's batch.
      const outsideHod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.mech@example.edu',
        departmentId: String(otherDepartment._id),
      });

      await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(outsideHod.token))
        .expect(403);
    });

    /** The defect this guards: reading must not imply marking. */
    it('refuses a college administrator the ability to mark', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(403);

      expect(await AttendanceRecordModel.countDocuments({})).toBe(0);
    });

    it('lets faculty holding attendance:mark mark the register', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(marker.token))
        .send({ entries: [{ studentId: students[0], status: 'present' }] })
        .expect(200);
    });

    it('refuses a student both the sheet and the register', async () => {
      await createStudents(1);
      const sessionId = await createSession();

      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.attendance@example.edu',
      });

      await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(student.token))
        .expect(403);

      await request(app)
        .post(`${API}/attendance/sessions/${sessionId}/mark`)
        .set(auth(student.token))
        .send({ entries: [] })
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      const sessionId = await createSession();

      await request(app).get(`${API}/attendance/sessions/${sessionId}/sheet`).expect(401);
    });

    /**
     * The literal string `new` reaches this route only when the client has no
     * static `/new` segment — which is exactly the bug that produced a 400 in
     * the college portal. It must never be read as an identifier.
     */
    it('rejects a non-ObjectId session id rather than treating it as one', async () => {
      await request(app)
        .get(`${API}/attendance/sessions/new/sheet`)
        .set(auth(tenant.token))
        .expect(400);
    });

    it('answers 404 for a well-formed id that does not exist', async () => {
      await request(app)
        .get(`${API}/attendance/sessions/60f0000000000000000000aa/sheet`)
        .set(auth(tenant.token))
        .expect(404);
    });

    /** Another college's session is invisible, not merely forbidden. */
    it('hides a session belonging to another college', async () => {
      const sessionId = await createSession();
      const other = await createTenant(app, { code: 'ZZZ', adminEmail: 'admin.zzz@example.edu' });

      await request(app)
        .get(`${API}/attendance/sessions/${sessionId}/sheet`)
        .set(auth(other.token))
        .expect(404);
    });
  });
});
