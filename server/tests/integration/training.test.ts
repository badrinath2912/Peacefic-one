import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { NotificationModel } from '@/models/notification.model';
import { TrainingEnrollmentModel } from '@/models/training-enrollment.model';
import { TrainingSessionModel } from '@/models/training-session.model';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createStaffUser,
  createTenant,
  facultyPayload,
  studentPayload,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

const iso = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('training API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const requestPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Advanced Java for placements',
    description: 'A four-week intensive covering core Java, collections and concurrency.',
    trainingType: 'technical',
    departmentIds: [tenant.departmentId],
    batchIds: [tenant.batchId],
    expectedParticipants: 40,
    preferredStartDate: iso(14),
    preferredEndDate: iso(42),
    durationHours: 60,
    mode: 'offline',
    topics: ['Collections', 'Concurrency'],
    priority: 'high',
    status: 'draft',
    ...overrides,
  });

  const sessionPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Advanced Java — Batch A',
    trainingType: 'technical',
    departmentIds: [tenant.departmentId],
    batchIds: [tenant.batchId],
    trainerIds: [],
    startDate: iso(14),
    endDate: iso(20),
    capacity: 30,
    mode: 'offline',
    location: 'Lab 3',
    learningObjectives: ['Write concurrent code'],
    topics: ['Concurrency'],
    status: 'scheduled',
    ...overrides,
  });

  async function createRequest(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/training/requests`)
      .set(auth(tenant.token))
      .send(requestPayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  async function createSession(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/training/sessions`)
      .set(auth(tenant.token))
      .send(sessionPayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  /* -------------------------------- requests -------------------------------- */

  describe('requests', () => {
    it('creates a request with a human-quotable reference', async () => {
      const response = await request(app)
        .post(`${API}/training/requests`)
        .set(auth(tenant.token))
        .send(requestPayload())
        .expect(201);

      expect(response.body.data.reference).toMatch(/^TR-\d{4}-\d{4}$/);
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.approvalStatus).toBe('pending');
    });

    it('rejects an end date before the start date', async () => {
      await request(app)
        .post(`${API}/training/requests`)
        .set(auth(tenant.token))
        .send(requestPayload({ preferredStartDate: iso(30), preferredEndDate: iso(10) }))
        .expect(400);
    });

    it('walks draft → submitted → approved', async () => {
      const id = await createRequest();

      await request(app)
        .post(`${API}/training/requests/${id}/submit`)
        .set(auth(tenant.token))
        .expect(200);

      const approved = await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(tenant.token))
        .send({ comments: 'Budget confirmed.' })
        .expect(200);

      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.approvalStatus).toBe('approved');
      expect(approved.body.data.reviewedAt).not.toBeNull();
    });

    it('refuses an illegal transition', async () => {
      const id = await createRequest();

      // draft → approved skips submission entirely.
      const response = await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(tenant.token))
        .send({})
        .expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses to approve an already rejected request', async () => {
      const id = await createRequest({ status: 'submitted' });

      await request(app)
        .post(`${API}/training/requests/${id}/reject`)
        .set(auth(tenant.token))
        .send({ reason: 'No budget available this quarter.' })
        .expect(200);

      await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(tenant.token))
        .send({})
        .expect(409);
    });

    it('carries the rejection reason to the requester', async () => {
      const id = await createRequest({ status: 'submitted' });

      await request(app)
        .post(`${API}/training/requests/${id}/reject`)
        .set(auth(tenant.token))
        .send({ reason: 'The proposed dates clash with examinations.' })
        .expect(200);

      const notification = await NotificationModel.findOne({
        type: 'training.request_reviewed',
      }).exec();

      // A bare "rejected" would make the requester chase someone for the why.
      expect(notification?.message).toContain('clash with examinations');
    });

    it('blocks editing once a reviewer has acted', async () => {
      const id = await createRequest({ status: 'submitted' });

      await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await request(app)
        .patch(`${API}/training/requests/${id}`)
        .set(auth(tenant.token))
        .send({ title: 'Changed after approval' })
        .expect(422);
    });

    it('notifies the HOD when a request is submitted', async () => {
      await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.training@example.edu',
        employeeId: 'EMPHT',
      });

      const id = await createRequest();

      await request(app)
        .post(`${API}/training/requests/${id}/submit`)
        .set(auth(tenant.token))
        .expect(200);

      expect(
        await NotificationModel.countDocuments({ type: 'training.request_submitted' }),
      ).toBe(1);
    });
  });

  /* -------------------------------- sessions -------------------------------- */

  describe('sessions', () => {
    it('creates a session', async () => {
      const response = await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(sessionPayload())
        .expect(201);

      expect(response.body.data.capacity).toBe(30);
      expect(response.body.data.stats.enrolledCount).toBe(0);
    });

    it('requires a location for an in-person session', async () => {
      await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(sessionPayload({ mode: 'offline', location: null }))
        .expect(400);
    });

    it('requires a meeting link for an online session', async () => {
      await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(sessionPayload({ mode: 'online', location: null, meetingLink: null }))
        .expect(400);
    });

    it('refuses to schedule against a request that is not approved', async () => {
      const requestId = await createRequest();

      const response = await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(sessionPayload({ requestId }))
        .expect(422);

      expect(response.body.error.message).toContain('approved request');
    });

    it('links an approved request and marks it scheduled', async () => {
      const requestId = await createRequest({ status: 'submitted' });

      await request(app)
        .post(`${API}/training/requests/${requestId}/approve`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await createSession({ requestId });

      const updated = await request(app)
        .get(`${API}/training/requests/${requestId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(updated.body.data.status).toBe('scheduled');
      expect(updated.body.data.sessionIds).toHaveLength(1);
    });

    it('refuses to double-book a trainer across overlapping dates', async () => {
      const trainer = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { type: 'trainer', roleKey: 'trainer' }))
        .expect(201);

      await createSession({ trainerIds: [trainer.body.data.id] });

      const response = await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(
          sessionPayload({
            title: 'Clashing session',
            trainerIds: [trainer.body.data.id],
            startDate: iso(16),
            endDate: iso(22),
          }),
        )
        .expect(422);

      // A clash discovered on the day is far more expensive than one caught here.
      expect(response.body.error.message).toContain('already committed');
    });

    it('allows the same trainer on non-overlapping dates', async () => {
      const trainer = await request(app)
        .post(`${API}/faculty`)
        .set(auth(tenant.token))
        .send(facultyPayload(tenant, { type: 'trainer', roleKey: 'trainer' }))
        .expect(201);

      await createSession({ trainerIds: [trainer.body.data.id] });

      await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send(
          sessionPayload({
            title: 'Later session',
            trainerIds: [trainer.body.data.id],
            startDate: iso(40),
            endDate: iso(45),
          }),
        )
        .expect(201);
    });

    it('refuses a capacity below the number already enrolled', async () => {
      const sessionId = await createSession({ capacity: 5 });

      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      await request(app)
        .patch(`${API}/training/sessions/${sessionId}`)
        .set(auth(tenant.token))
        .send({ capacity: 0 })
        .expect(400);
    });
  });

  /* ------------------------------- enrolment -------------------------------- */

  describe('enrolment', () => {
    async function createStudents(count: number): Promise<string[]> {
      const ids: string[] = [];

      for (let index = 0; index < count; index += 1) {
        const created = await request(app)
          .post(`${API}/students`)
          .set(auth(tenant.token))
          .send(
            studentPayload(tenant, {
              email: `trainee${index}@example.edu`,
              rollNumber: `CS22T${String(index).padStart(3, '0')}`,
            }),
          )
          .expect(201);

        ids.push(created.body.data.id as string);
      }

      return ids;
    }

    it('enrols a whole batch and updates the count', async () => {
      await createStudents(3);
      const sessionId = await createSession();

      const response = await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      expect(response.body.data.enrolled).toBe(3);
      expect(response.body.data.seatsRemaining).toBe(27);

      const session = await TrainingSessionModel.findById(sessionId).exec();
      expect(session?.stats.enrolledCount).toBe(3);
    });

    it('skips students who are already enrolled rather than double-counting', async () => {
      const students = await createStudents(2);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      const second = await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      expect(second.body.data.enrolled).toBe(0);
      expect(second.body.data.skipped).toBe(2);

      const session = await TrainingSessionModel.findById(sessionId).exec();
      expect(session?.stats.enrolledCount).toBe(2);
    });

    it('refuses to exceed capacity', async () => {
      await createStudents(3);
      const sessionId = await createSession({ capacity: 2 });

      const response = await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(422);

      expect(response.body.error.message).toContain('2 seat(s) remain');
    });

    it('withdraws students and frees their seats', async () => {
      const students = await createStudents(2);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      const response = await request(app)
        .post(`${API}/training/sessions/${sessionId}/withdraw`)
        .set(auth(tenant.token))
        .send({ studentIds: [students[0]], reason: 'Timetable clash' })
        .expect(200);

      expect(response.body.data.withdrawn).toBe(1);

      const session = await TrainingSessionModel.findById(sessionId).exec();
      expect(session?.stats.enrolledCount).toBe(1);
      expect(session?.stats.withdrawnCount).toBe(1);
    });

    it('re-enrols a withdrawn student rather than colliding', async () => {
      const students = await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/withdraw`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      const response = await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: students })
        .expect(200);

      // Upsert, not insert: the unique index would otherwise reject this.
      expect(response.body.data.enrolled).toBe(1);
      expect(await TrainingEnrollmentModel.countDocuments({ deletedAt: null })).toBe(1);
    });

    it('notifies enrolled students', async () => {
      await createStudents(2);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      expect(await NotificationModel.countDocuments({ type: 'training.enrolled' })).toBe(2);
    });

    it('refuses enrolment into a cancelled session', async () => {
      await createStudents(1);
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'The trainer withdrew at short notice.' })
        .expect(200);

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(422);
    });
  });

  /* ------------------------- completion and lifecycle ------------------------ */

  describe('completion', () => {
    it('records completion and notifies nobody twice', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      const enrollment = await TrainingEnrollmentModel.findOne({ sessionId }).exec();

      const response = await request(app)
        .post(`${API}/training/sessions/${sessionId}/complete`)
        .set(auth(tenant.token))
        .send({
          completedStudentIds: [String(enrollment?.studentId)],
          feedbackScore: 4.5,
          report: 'Strong engagement throughout.',
        })
        .expect(200);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.stats.completedCount).toBe(1);
      expect(response.body.data.feedbackScore).toBe(4.5);
    });

    it('cancels a session and tells everyone enrolled', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'The venue became unavailable.' })
        .expect(200);

      const notification = await NotificationModel.findOne({
        type: 'training.session_cancelled',
      }).exec();

      expect(notification?.message).toContain('venue became unavailable');
      expect(notification?.priority).toBe('high');
    });

    it('refuses to delete a session with students enrolled', async () => {
      await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201);

      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(200);

      const response = await request(app)
        .delete(`${API}/training/sessions/${sessionId}`)
        .set(auth(tenant.token))
        .expect(422);

      expect(response.body.error.message).toContain('Cancel it instead');
    });
  });

  /* -------------------------- calendar and analytics ------------------------- */

  describe('calendar and analytics', () => {
    it('returns sessions overlapping the window, not just those contained by it', async () => {
      await createSession({ startDate: iso(10), endDate: iso(40) });

      const response = await request(app)
        .get(`${API}/training/calendar?from=${iso(20)}&to=${iso(25)}`)
        .set(auth(tenant.token))
        .expect(200);

      // The session spans the window without starting or ending inside it.
      expect(response.body.data).toHaveLength(1);
    });

    it('excludes cancelled sessions from the calendar', async () => {
      const sessionId = await createSession();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'No longer required this term.' })
        .expect(200);

      const response = await request(app)
        .get(`${API}/training/calendar?from=${iso(0)}&to=${iso(60)}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('summarises requests, sessions and completion', async () => {
      await createRequest({ status: 'submitted' });
      await createSession();

      const response = await request(app)
        .get(`${API}/training/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.requests.pending).toBe(1);
      expect(response.body.data.sessions.scheduled).toBe(1);
      expect(response.body.data.completion).toHaveProperty('completionRate');
    });
  });

  /* --------------------------------- export --------------------------------- */

  describe('export', () => {
    it('exports sessions as CSV', async () => {
      await createSession();

      const response = await request(app)
        .post(`${API}/training/sessions/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');

      const csv = response.text ?? String(response.body);
      expect(csv).toContain('Completion %');
      expect(csv).toContain('Advanced Java');
    });

    it('produces a real xlsx workbook', async () => {
      await createSession();

      const response = await request(app)
        .post(`${API}/training/sessions/bulk/export?format=xlsx`)
        .set(auth(tenant.token))
        .responseType('blob')
        .send({})
        .expect(200);

      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('neutralises a formula in an exported cell', async () => {
      await createSession({ title: '=cmd|calc' });

      const response = await request(app)
        .post(`${API}/training/sessions/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text ?? String(response.body)).toContain("'=cmd|calc");
    });
  });

  /* ------------------------------ permissions -------------------------------- */

  describe('permissions', () => {
    it('refuses a faculty member the approve endpoint', async () => {
      const id = await createRequest({ status: 'submitted' });

      const member = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.noapprove@example.edu',
        employeeId: 'EMPNA',
      });

      // Faculty may raise a request but must not wave one through.
      await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(member.token))
        .send({})
        .expect(403);
    });

    it('allows an HOD to approve', async () => {
      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.approve@example.edu',
        employeeId: 'EMPHA',
      });

      const id = await createRequest({ status: 'submitted' });

      await request(app)
        .post(`${API}/training/requests/${id}/approve`)
        .set(auth(hod.token))
        .send({})
        .expect(200);
    });

    it('refuses a student every training write', async () => {
      const sessionId = await createSession();

      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'student.training@example.edu',
      });

      await request(app)
        .post(`${API}/training/requests`)
        .set(auth(student.token))
        .send(requestPayload())
        .expect(403);

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(student.token))
        .send({ batchIds: [tenant.batchId] })
        .expect(403);
    });
  });

  /* -------------------------------- tenancy ---------------------------------- */

  describe('tenancy', () => {
    it('does not expose another college\'s sessions', async () => {
      await createSession();

      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/training/sessions`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('returns 404 when another tenant fetches a request by id', async () => {
      const id = await createRequest();

      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      await request(app)
        .get(`${API}/training/requests/${id}`)
        .set(auth(other.token))
        .expect(404);
    });

    it('keeps the calendar within the caller\'s tenant', async () => {
      await createSession();

      const other = await createTenant(app, {
        code: 'SEC',
        adminEmail: 'admin.sec@example.edu',
      });

      const response = await request(app)
        .get(`${API}/training/calendar?from=${iso(0)}&to=${iso(60)}`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });
});
