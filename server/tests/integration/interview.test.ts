import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { InterviewModel } from '@/models/interview.model';
import { JobApplicationModel } from '@/models/job-application.model';
import { StudentModel } from '@/models/student.model';
import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import { createStaffUser, createTenant, studentPayload, type TenantFixture } from '../helpers/fixtures';

const API = '/api/v1';

const daysFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('interview API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Unique per created student: two emails of equal length collided before. */
  let studentCounter = 0;

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    studentCounter = 0;

    // Publishing a drive is refused while no student qualifies for it, so the
    // college needs at least one before any job in these tests goes live.
    await request(app)
      .post(`${API}/students`)
      .set(auth(tenant.token))
      .send(studentPayload(tenant, { email: 'seed.student@example.edu', rollNumber: 'CS22B900' }))
      .expect(201);
  });

  /* --------------------------------- fixtures -------------------------------- */

  async function createCompany(): Promise<string> {
    const response = await request(app)
      .post(`${API}/companies`)
      .set(auth(tenant.token))
      .send({
        name: 'Acme Technologies',
        industry: 'Information Technology',
        companyType: 'product',
        locations: ['Bengaluru'],
        contacts: [],
      })
      .expect(201);

    return response.body.data.id as string;
  }

  async function createJob(companyId: string, rounds = 2): Promise<string> {
    const selectionRounds = [
      { order: 1, name: 'Online Test', type: 'aptitude', mode: 'online' },
      { order: 2, name: 'Technical Interview', type: 'technical_interview', mode: 'online' },
      { order: 3, name: 'HR Interview', type: 'hr_interview', mode: 'online' },
    ].slice(0, rounds);

    const response = await request(app)
      .post(`${API}/jobs`)
      .set(auth(tenant.token))
      .send({
        companyId,
        title: 'Software Engineer',
        description: 'Build and maintain backend services for a developer tooling platform.',
        jobType: 'full_time',
        workMode: 'hybrid',
        locations: ['Bengaluru'],
        openings: 10,
        compensation: { currency: 'INR', ctcMin: 1200000, ctcMax: 1800000 },
        eligibility: {
          departmentIds: [],
          batchIds: [],
          graduationYears: [],
          minCgpa: null,
          maxActiveBacklogs: null,
          maxTotalBacklogs: null,
          minTenthPercent: null,
          minTwelfthPercent: null,
          minDiplomaPercent: null,
          minAttendancePercent: null,
          maxYearGap: null,
          genderRestriction: 'any',
          requiredSkills: [],
          qualifications: [],
          allowPlacedStudents: false,
          customCriteria: null,
        },
        selectionRounds,
        applicationOpenAt: daysFromNow(-1),
        applicationCloseAt: daysFromNow(14),
        driveDate: daysFromNow(21),
        attachments: [],
      })
      .expect(201);

    await request(app)
      .post(`${API}/jobs/${response.body.data.id}/transition`)
      .set(auth(tenant.token))
      .send({ to: 'published' })
      .expect(200);

    return response.body.data.id as string;
  }

  async function studentLogin(email: string): Promise<string> {
    const user = await UserModel.findOne({ email }).exec();
    if (!user) throw new Error(`No user for ${email}`);

    const { hashPassword } = await import('@/utils/crypto');

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
    ).exec();

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: 'CorrectHorse9' })
      .expect(200);

    return login.body.data.accessToken as string;
  }

  /** A shortlisted candidate: the state an interview can actually be booked from. */
  async function shortlistedCandidate(
    jobId: string,
    email = 'meera.iyer@example.edu',
  ): Promise<{ applicationId: string; studentId: string; studentToken: string }> {
    const created = await request(app)
      .post(`${API}/students`)
      .set(auth(tenant.token))
      .send(studentPayload(tenant, { email, rollNumber: `CS22B${100 + (studentCounter += 1)}` }))
      .expect(201);

    const studentId = created.body.data.id as string;
    const studentToken = await studentLogin(email);

    const applied = await request(app)
      .post(`${API}/jobs/${jobId}/apply`)
      .set(auth(studentToken))
      .send({ coverLetter: null, answers: [] })
      .expect(201);

    const applicationId = applied.body.data.id as string;

    await request(app)
      .post(`${API}/applications/${applicationId}/shortlist`)
      .set(auth(tenant.token))
      .send({ roundOrder: 1 })
      .expect(200);

    return { applicationId, studentId, studentToken };
  }

  const schedulePayload = (applicationId: string, overrides: Record<string, unknown> = {}) => ({
    applicationId,
    roundOrder: 2,
    roundName: 'Technical Interview',
    type: 'technical_interview',
    mode: 'online',
    scheduledAt: daysFromNow(3),
    durationMinutes: 45,
    meetingLink: 'https://meet.example.com/abc',
    interviewers: [
      { name: 'Priya Menon', designation: 'Engineering Manager', email: 'priya@acme.example.com' },
    ],
    instructions: 'Have your ID ready.',
    ...overrides,
  });

  async function scheduleInterview(
    applicationId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app)
      .post(`${API}/interviews`)
      .set(auth(tenant.token))
      .send(schedulePayload(applicationId, overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  /* ----------------------------------- auth ---------------------------------- */

  describe('authentication', () => {
    it('refuses an unauthenticated caller', async () => {
      await request(app).get(`${API}/interviews`).expect(401);
      await request(app).post(`${API}/interviews`).send({}).expect(401);
      await request(app).get(`${API}/interviews/me`).expect(401);
    });

    it('accepts an authenticated office caller', async () => {
      await request(app).get(`${API}/interviews`).set(auth(tenant.token)).expect(200);
    });
  });

  /* -------------------------------- scheduling ------------------------------- */

  describe('scheduling', () => {
    it('schedules an interview against a shortlisted application', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);

      const response = await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload(applicationId))
        .expect(201);

      expect(response.body.data.roundOrder).toBe(2);
      expect(response.body.data.status).toBe('scheduled');
      expect(response.body.data.result.status).toBe('pending');
      expect(response.body.data.interviewers).toHaveLength(1);
      // Denormalised from the application so the student's list needs no join.
      expect(response.body.data.studentId).toBeDefined();
      expect(response.body.data.history).toHaveLength(1);
    });

    /** The database index is the real guard, not the service's check alone. */
    it('refuses a second interview for the same round', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);

      await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload(applicationId))
        .expect(409);
    });

    it('allows a second interview for a different round', async () => {
      const jobId = await createJob(await createCompany(), 3);
      const { applicationId } = await shortlistedCandidate(jobId);

      await scheduleInterview(applicationId, { roundOrder: 2 });

      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload(applicationId, { roundOrder: 3, roundName: 'HR Interview' }))
        .expect(201);

      expect(await InterviewModel.countDocuments({ applicationId })).toBe(2);
    });

    /** A drive with two rounds has no round five. */
    it('refuses a round the drive does not run', async () => {
      const jobId = await createJob(await createCompany(), 2);
      const { applicationId } = await shortlistedCandidate(jobId);

      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload(applicationId, { roundOrder: 5 }))
        .expect(422);
    });

    it('refuses a candidate who has not been shortlisted', async () => {
      const jobId = await createJob(await createCompany());
      const created = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant, { email: 'arjun.rao@example.edu', rollNumber: 'EC22B044' }))
        .expect(201);

      const token = await studentLogin('arjun.rao@example.edu');

      const applied = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ coverLetter: null, answers: [] })
        .expect(201);

      expect(created.body.data.id).toBeDefined();

      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload(applied.body.data.id as string))
        .expect(422);
    });

    it('rejects a malformed application id', async () => {
      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload('not-an-object-id'))
        .expect(400);
    });

    it('returns 404 for an application that does not exist', async () => {
      await request(app)
        .post(`${API}/interviews`)
        .set(auth(tenant.token))
        .send(schedulePayload('507f1f77bcf86cd799439011'))
        .expect(404);
    });
  });

  /* ------------------------------ bulk scheduling ----------------------------- */

  describe('bulk scheduling', () => {
    it('lays slots across panels and reports each row', async () => {
      const jobId = await createJob(await createCompany());
      const first = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const second = await shortlistedCandidate(jobId, 'two.student@example.edu');
      const third = await shortlistedCandidate(jobId, 'three.student@example.edu');

      const startAt = daysFromNow(5);

      const response = await request(app)
        .post(`${API}/interviews/bulk/schedule`)
        .set(auth(tenant.token))
        .send({
          jobPostingId: jobId,
          applicationIds: [first.applicationId, second.applicationId, third.applicationId],
          roundOrder: 2,
          roundName: 'Technical Interview',
          type: 'technical_interview',
          mode: 'online',
          startAt,
          slotDurationMinutes: 30,
          slotsPerPanel: 10,
          panels: 2,
        })
        .expect(200);

      expect(response.body.data.scheduledCount).toBe(3);
      expect(response.body.data.skippedCount).toBe(0);

      const interviews = await InterviewModel.find({ roundOrder: 2 }).sort({ scheduledAt: 1 }).exec();
      expect(interviews).toHaveLength(3);

      // Two panels: the first two share a slot, the third starts 30 minutes on.
      const times = interviews.map((entry) => entry.scheduledAt.getTime());
      expect(times[0]).toBe(times[1]);
      expect(times[2]! - times[0]!).toBe(30 * 60 * 1000);

      const panels = interviews.map((entry) => entry.panelNumber);
      expect(new Set(panels).size).toBe(2);
    });

    it('skips anyone already scheduled rather than duplicating them', async () => {
      const jobId = await createJob(await createCompany());
      const first = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const second = await shortlistedCandidate(jobId, 'two.student@example.edu');

      await scheduleInterview(first.applicationId);

      const response = await request(app)
        .post(`${API}/interviews/bulk/schedule`)
        .set(auth(tenant.token))
        .send({
          jobPostingId: jobId,
          applicationIds: [first.applicationId, second.applicationId],
          roundOrder: 2,
          roundName: 'Technical Interview',
          type: 'technical_interview',
          mode: 'online',
          startAt: daysFromNow(5),
          slotDurationMinutes: 30,
          slotsPerPanel: 10,
          panels: 1,
        })
        .expect(200);

      expect(response.body.data.scheduledCount).toBe(1);
      expect(response.body.data.skippedCount).toBe(1);

      const skipped = response.body.data.results.find(
        (row: { applicationId: string }) => row.applicationId === first.applicationId,
      );
      expect(skipped.scheduled).toBe(false);
      expect(skipped.message).toMatch(/already scheduled/i);

      expect(await InterviewModel.countDocuments({ applicationId: first.applicationId })).toBe(1);
    });

    it('skips an application belonging to another drive', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);
      const otherJobId = await createJob(companyId);

      const mine = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const other = await shortlistedCandidate(otherJobId, 'two.student@example.edu');

      const response = await request(app)
        .post(`${API}/interviews/bulk/schedule`)
        .set(auth(tenant.token))
        .send({
          jobPostingId: jobId,
          applicationIds: [mine.applicationId, other.applicationId],
          roundOrder: 2,
          roundName: 'Technical Interview',
          type: 'technical_interview',
          mode: 'online',
          startAt: daysFromNow(5),
          slotDurationMinutes: 30,
          slotsPerPanel: 10,
          panels: 1,
        })
        .expect(200);

      expect(response.body.data.scheduledCount).toBe(1);
      const skipped = response.body.data.results.find(
        (row: { applicationId: string }) => row.applicationId === other.applicationId,
      );
      expect(skipped.message).toMatch(/different drive/i);
    });
  });

  /* -------------------------------- lifecycle -------------------------------- */

  describe('lifecycle', () => {
    it('reschedules and awaits confirmation again', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/me/${interviewId}/confirm`)
        .set(auth(studentToken))
        .expect(200);

      const moved = await request(app)
        .post(`${API}/interviews/${interviewId}/reschedule`)
        .set(auth(tenant.token))
        .send({ scheduledAt: daysFromNow(6), reason: 'The panel is unavailable.' })
        .expect(200);

      expect(moved.body.data.status).toBe('rescheduled');
      // The old confirmation no longer applies to the new time.
      expect(moved.body.data.confirmedAt).toBeNull();
    });

    it('cancels with a reason', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const response = await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'The company postponed the drive.' })
        .expect(200);

      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancellationReason).toBe('The company postponed the drive.');
    });

    it('refuses a cancellation with no reason', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: '' })
        .expect(400);
    });

    it('refuses an illegal transition', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'Called off.' })
        .expect(200);

      // Cancelled is terminal. An illegal move is a 409, as elsewhere.
      await request(app)
        .post(`${API}/interviews/${interviewId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'in_progress' })
        .expect(409);
    });

    it('refuses rescheduling a cancelled interview', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'Called off.' })
        .expect(200);

      await request(app)
        .post(`${API}/interviews/${interviewId}/reschedule`)
        .set(auth(tenant.token))
        .send({ scheduledAt: daysFromNow(9), reason: 'Trying again.' })
        .expect(422);
    });

    /** The office cannot confirm on the candidate's behalf. */
    it('refuses the office the student-owned transition', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'confirmed' })
        .expect(422);
    });
  });

  /* ---------------------------------- result ---------------------------------- */

  describe('results', () => {
    it('records a result and closes the round', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const response = await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({
          status: 'cleared',
          score: 82,
          maxScore: 100,
          feedback: 'Strong on data structures.',
          strengths: ['Algorithms'],
          improvements: ['System design'],
        })
        .expect(200);

      expect(response.body.data.interview.result.status).toBe('cleared');
      expect(response.body.data.interview.result.score).toBe(82);
      expect(response.body.data.interview.status).toBe('completed');
    });

    /**
     * The whole point of the split: recording a result must not move the
     * application, because that needs `application:shortlist` or
     * `application:reject`, which the result permission does not imply.
     */
    it('does not move the application', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const before = await JobApplicationModel.findById(applicationId).exec();

      await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(200);

      const after = await JobApplicationModel.findById(applicationId).exec();
      expect(after!.status).toBe(before!.status);
      expect(after!.status).toBe('shortlisted');
    });

    it('suggests a next step without taking it', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const cleared = await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(200);

      expect(cleared.body.data.suggestedApplicationStatus).toBe('in_process');
    });

    it('suggests rejection when the candidate did not clear', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const response = await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({ status: 'rejected', strengths: [], improvements: [] })
        .expect(200);

      expect(response.body.data.suggestedApplicationStatus).toBe('rejected');

      const application = await JobApplicationModel.findById(applicationId).exec();
      expect(application!.status).toBe('shortlisted');
    });

    it('refuses a score above the maximum', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({ status: 'cleared', score: 120, maxScore: 100, strengths: [], improvements: [] })
        .expect(422);
    });

    it('refuses a result on a cancelled interview', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'Called off.' })
        .expect(200);

      await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(tenant.token))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(422);
    });
  });

  /* ------------------------------- self-service ------------------------------- */

  describe('student self-service', () => {
    it('lists only the caller’s own interviews', async () => {
      const jobId = await createJob(await createCompany());
      const mine = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const other = await shortlistedCandidate(jobId, 'two.student@example.edu');

      await scheduleInterview(mine.applicationId);
      await scheduleInterview(other.applicationId);

      const response = await request(app)
        .get(`${API}/interviews/me`)
        .set(auth(mine.studentToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(String(response.body.data[0].studentId.id ?? response.body.data[0].studentId)).toBe(
        mine.studentId,
      );
    });

    /** A 404, not a 403: a 403 would confirm the interview exists. */
    it('refuses another student’s interview with a 404', async () => {
      const jobId = await createJob(await createCompany());
      const mine = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const other = await shortlistedCandidate(jobId, 'two.student@example.edu');

      const theirs = await scheduleInterview(other.applicationId);

      await request(app)
        .get(`${API}/interviews/me/${theirs}`)
        .set(auth(mine.studentToken))
        .expect(404);

      await request(app)
        .post(`${API}/interviews/me/${theirs}/confirm`)
        .set(auth(mine.studentToken))
        .expect(404);
    });

    it('confirms a slot', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const response = await request(app)
        .post(`${API}/interviews/me/${interviewId}/confirm`)
        .set(auth(studentToken))
        .expect(200);

      expect(response.body.data.status).toBe('confirmed');
      expect(response.body.data.confirmedAt).not.toBeNull();
      expect(response.body.data.history.at(-1).actedByRole).toBe('student');
    });

    /**
     * A request is not a change: the slot stays where the office put it, and
     * only the office can move it.
     */
    it('records a reschedule request without moving the interview', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const before = await InterviewModel.findById(interviewId).exec();

      const response = await request(app)
        .post(`${API}/interviews/me/${interviewId}/request-reschedule`)
        .set(auth(studentToken))
        .send({
          reason: 'I have a university examination that morning.',
          preferredSlots: [daysFromNow(7), daysFromNow(8)],
        })
        .expect(200);

      expect(response.body.data.rescheduleRequest.reason).toMatch(/examination/);
      expect(response.body.data.rescheduleRequest.preferredSlots).toHaveLength(2);
      // Unchanged: the student asked, they did not reschedule themselves.
      expect(response.body.data.status).toBe('scheduled');

      const after = await InterviewModel.findById(interviewId).exec();
      expect(after!.scheduledAt.getTime()).toBe(before!.scheduledAt.getTime());
    });

    it('refuses a reschedule request with too short a reason', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/me/${interviewId}/request-reschedule`)
        .set(auth(studentToken))
        .send({ reason: 'busy', preferredSlots: [] })
        .expect(400);
    });

    it('refuses a request on a cancelled interview', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'Called off.' })
        .expect(200);

      await request(app)
        .post(`${API}/interviews/me/${interviewId}/request-reschedule`)
        .set(auth(studentToken))
        .send({ reason: 'I would still like to attend a slot.', preferredSlots: [] })
        .expect(422);
    });
  });

  /* ----------------------------------- RBAC ----------------------------------- */

  describe('RBAC', () => {
    it('refuses a student every office interview surface', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentToken } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app).get(`${API}/interviews`).set(auth(studentToken)).expect(403);
      await request(app)
        .post(`${API}/interviews`)
        .set(auth(studentToken))
        .send(schedulePayload(applicationId))
        .expect(403);
      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(studentToken))
        .send({ reason: 'I would rather not.' })
        .expect(403);
      await request(app)
        .post(`${API}/interviews/${interviewId}/reschedule`)
        .set(auth(studentToken))
        .send({ scheduledAt: daysFromNow(9), reason: 'Clashes.' })
        .expect(403);
      await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(studentToken))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(403);
      await request(app).get(`${API}/interviews/analytics`).set(auth(studentToken)).expect(403);
    });

    /** `interview:respond` is a student permission; the office does not hold it. */
    it('refuses the office the student response endpoints', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      await request(app)
        .post(`${API}/interviews/me/${interviewId}/confirm`)
        .set(auth(tenant.token))
        .expect(403);

      await request(app)
        .post(`${API}/interviews/me/${interviewId}/request-reschedule`)
        .set(auth(tenant.token))
        .send({ reason: 'Moving this for the candidate.', preferredSlots: [] })
        .expect(403);
    });

    /** HOD reads every interview and drives none of them. */
    it('lets a HOD read but not schedule, update or record', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const hod = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.HOD,
        email: 'hod.cse@example.edu',
      });

      await request(app).get(`${API}/interviews`).set(auth(hod.token)).expect(200);
      await request(app).get(`${API}/interviews/${interviewId}`).set(auth(hod.token)).expect(200);

      await request(app)
        .post(`${API}/interviews`)
        .set(auth(hod.token))
        .send(schedulePayload(applicationId, { roundOrder: 1 }))
        .expect(403);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(hod.token))
        .send({ reason: 'Not my call.' })
        .expect(403);

      await request(app)
        .post(`${API}/interviews/${interviewId}/result`)
        .set(auth(hod.token))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(403);
    });

    it('refuses a faculty member every interview surface', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'faculty.cse@example.edu',
      });

      await request(app).get(`${API}/interviews`).set(auth(faculty.token)).expect(403);
      await request(app).get(`${API}/interviews/${interviewId}`).set(auth(faculty.token)).expect(403);
      await request(app).get(`${API}/interviews/me`).set(auth(faculty.token)).expect(403);
    });
  });

  /* --------------------------------- tenancy ---------------------------------- */

  describe('tenancy', () => {
    it('does not expose another college’s interviews', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const other = await createTenant(app, {
        code: 'OTH',
        adminEmail: 'admin.oth@example.edu',
      });

      const list = await request(app)
        .get(`${API}/interviews`)
        .set(auth(other.token))
        .expect(200);

      expect(list.body.data).toHaveLength(0);

      // 404 rather than 403: a 403 would confirm the record exists.
      await request(app)
        .get(`${API}/interviews/${interviewId}`)
        .set(auth(other.token))
        .expect(404);

      await request(app)
        .post(`${API}/interviews/${interviewId}/cancel`)
        .set(auth(other.token))
        .send({ reason: 'Not mine to cancel.' })
        .expect(404);
    });
  });

  /* -------------------------------- analytics --------------------------------- */

  describe('analytics', () => {
    it('counts by status and by result', async () => {
      const jobId = await createJob(await createCompany());
      const first = await shortlistedCandidate(jobId, 'one.student@example.edu');
      const second = await shortlistedCandidate(jobId, 'two.student@example.edu');

      const firstInterview = await scheduleInterview(first.applicationId);
      await scheduleInterview(second.applicationId);

      await request(app)
        .post(`${API}/interviews/${firstInterview}/result`)
        .set(auth(tenant.token))
        .send({ status: 'cleared', strengths: [], improvements: [] })
        .expect(200);

      const response = await request(app)
        .get(`${API}/interviews/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(2);
      expect(response.body.data.completed).toBe(1);
      expect(response.body.data.cleared).toBe(1);
      expect(response.body.data.pendingResult).toBe(1);
    });
  });

  /* ------------------------------- malformed ids ------------------------------- */

  describe('malformed input', () => {
    /** A bad path parameter is a 400 here, matching the rest of the API. */
    it('rejects a malformed interview id', async () => {
      await request(app).get(`${API}/interviews/not-an-id`).set(auth(tenant.token)).expect(400);

      await request(app)
        .post(`${API}/interviews/not-an-id/cancel`)
        .set(auth(tenant.token))
        .send({ reason: 'Nothing to cancel.' })
        .expect(400);
    });

    it('returns 404 for an interview that does not exist', async () => {
      await request(app)
        .get(`${API}/interviews/507f1f77bcf86cd799439011`)
        .set(auth(tenant.token))
        .expect(404);
    });
  });

  /* -------------------------------- persistence -------------------------------- */

  describe('persistence', () => {
    it('keeps the student on the record so their list needs no join', async () => {
      const jobId = await createJob(await createCompany());
      const { applicationId, studentId } = await shortlistedCandidate(jobId);
      const interviewId = await scheduleInterview(applicationId);

      const stored = await InterviewModel.findById(interviewId).exec();
      expect(String(stored!.studentId)).toBe(studentId);
      expect(String(stored!.collegeId)).toBe(tenant.collegeId);

      const student = await StudentModel.findById(studentId).exec();
      expect(student).not.toBeNull();
    });
  });
});
