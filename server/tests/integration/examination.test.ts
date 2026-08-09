import { ROLE_KEYS } from '@peacefic/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import { ExamModel } from '@/models/exam.model';
import { MarksEntryModel } from '@/models/marks-entry.model';
import { StudentModel } from '@/models/student.model';
import { TrainingEnrollmentModel } from '@/models/training-enrollment.model';
import { TrainingSessionModel } from '@/models/training-session.model';
import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createStaffUser,
  createTenant,
  studentPayload,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

const iso = (daysFromNow: number): string =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();

/** A ten-point scale covering 0-100 without gaps or overlaps. */
const BANDS = [
  { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true },
  { letter: 'A', minPercent: 70, maxPercent: 89.99, gradePoint: 9, isPass: true },
  { letter: 'B', minPercent: 55, maxPercent: 69.99, gradePoint: 7, isPass: true },
  { letter: 'P', minPercent: 40, maxPercent: 54.99, gradePoint: 5, isPass: true },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false },
];

describe('examination API', () => {
  const app = testApp();
  let tenant: TenantFixture;
  let courseId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    courseId = await createCourse();
  });

  /* --------------------------------- helpers -------------------------------- */

  async function createCourse(code = 'CS201'): Promise<string> {
    const response = await request(app)
      .post(`${API}/courses`)
      .set(auth(tenant.token))
      .send({
        title: 'Data Structures and Algorithms',
        code,
        description: 'Core data structures, complexity analysis and algorithm design.',
        category: 'technical',
        level: 'intermediate',
        durationHours: 45,
        credits: 4,
        semester: 5,
        departmentIds: [tenant.departmentId],
        batchIds: [tenant.batchId],
        instructorIds: [],
        prerequisites: [],
        learningOutcomes: ['Analyse complexity'],
        tags: [],
        status: 'published',
      })
      .expect(201);

    return response.body.data.id as string;
  }

  const scalePayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Ten point scale',
    code: 'TEN',
    bands: BANDS,
    policy: {
      passingPercent: 40,
      maxGraceMarks: 0,
      maxGracePerSemester: 0,
      attendanceBonusEnabled: false,
      attendanceBonusThreshold: 90,
      attendanceBonusMarks: 0,
      repeatPolicy: 'best_attempt',
      countFailedCredits: true,
      gpaDecimalPlaces: 2,
    },
    isDefault: true,
    status: 'active',
    ...overrides,
  });

  const examPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'DSA Semester Examination',
    code: 'DSA-SEM5',
    examType: 'semester',
    courseId,
    departmentId: tenant.departmentId,
    batchIds: [tenant.batchId],
    semester: 5,
    academicYear: '2025-2026',
    maxMarks: { theory: 60, practical: 20, internal: 20 },
    credits: 4,
    scheduledAt: iso(7),
    durationMinutes: 180,
    venue: 'Hall A',
    ...overrides,
  });

  async function createScale(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/examinations/grade-scales`)
      .set(auth(tenant.token))
      .send(scalePayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  async function createExam(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/examinations`)
      .set(auth(tenant.token))
      .send(examPayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  async function createStudent(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/students`)
      .set(auth(tenant.token))
      .send(studentPayload(tenant, overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  async function transition(examId: string, to: string, expected = 200) {
    return request(app)
      .post(`${API}/examinations/${examId}/transition`)
      .set(auth(tenant.token))
      .send({ to })
      .expect(expected);
  }

  /** Drives an exam all the way to `marks_entered` with one student. */
  async function examWithVerifiedMarks(
    marks: { theory: number; practical: number; internal: number } = {
      theory: 45,
      practical: 16,
      internal: 18,
    },
  ): Promise<{ examId: string; studentId: string }> {
    await createScale();
    const examId = await createExam();
    const studentId = await createStudent();

    await request(app)
      .post(`${API}/examinations/${examId}/registrations`)
      .set(auth(tenant.token))
      .send({ studentIds: [studentId], batchIds: [] })
      .expect(201);

    await transition(examId, 'scheduled');
    await transition(examId, 'published');

    await request(app)
      .post(`${API}/examinations/${examId}/attendance`)
      .set(auth(tenant.token))
      .send({ entries: [{ studentId, status: 'present' }] })
      .expect(200);

    await transition(examId, 'completed');

    await request(app)
      .post(`${API}/examinations/${examId}/marks`)
      .set(auth(tenant.token))
      .send({ entries: [{ studentId, ...marks, graceMarks: 0 }], submit: true })
      .expect(200);

    await request(app)
      .post(`${API}/examinations/${examId}/marks/verify`)
      .set(auth(tenant.token))
      .send({})
      .expect(200);

    await transition(examId, 'marks_entered');

    return { examId, studentId };
  }

  /* ------------------------------- grade scales ------------------------------ */

  describe('grade scales', () => {
    it('creates a scale and marks it the college default', async () => {
      const response = await request(app)
        .post(`${API}/examinations/grade-scales`)
        .set(auth(tenant.token))
        .send(scalePayload())
        .expect(201);

      expect(response.body.data.code).toBe('TEN');
      expect(response.body.data.isDefault).toBe(true);
      expect(response.body.data.bands).toHaveLength(5);
    });

    it('rejects a scale whose bands overlap', async () => {
      await request(app)
        .post(`${API}/examinations/grade-scales`)
        .set(auth(tenant.token))
        .send(
          scalePayload({
            code: 'BAD',
            bands: [
              { letter: 'A', minPercent: 50, maxPercent: 100, gradePoint: 9, isPass: true },
              { letter: 'F', minPercent: 0, maxPercent: 60, gradePoint: 0, isPass: false },
            ],
          }),
        )
        .expect(400);
    });

    it('rejects a duplicate code within the same college', async () => {
      await createScale();

      await request(app)
        .post(`${API}/examinations/grade-scales`)
        .set(auth(tenant.token))
        .send(scalePayload({ name: 'Another', isDefault: false }))
        .expect(409);
    });

    /** Only one default can exist, so promoting a second demotes the first. */
    it('demotes the previous default when a new one is set', async () => {
      const first = await createScale();
      const second = await createScale({ code: 'FOUR', name: 'Four point', isDefault: true });

      const [firstAfter, secondAfter] = await Promise.all([
        request(app)
          .get(`${API}/examinations/grade-scales/${first}`)
          .set(auth(tenant.token))
          .expect(200),
        request(app)
          .get(`${API}/examinations/grade-scales/${second}`)
          .set(auth(tenant.token))
          .expect(200),
      ]);

      expect(firstAfter.body.data.isDefault).toBe(false);
      expect(secondAfter.body.data.isDefault).toBe(true);
    });

    it('refuses to delete the default scale', async () => {
      const id = await createScale();

      const response = await request(app)
        .delete(`${API}/examinations/grade-scales/${id}`)
        .set(auth(tenant.token))
        .expect(422);

      expect(response.body.error.message).toMatch(/default scale cannot be deleted/i);
    });

    /**
     * Revising the bands after publication would silently change a student's
     * letter grade, so the scale is frozen once it has graded a published exam.
     */
    it('refuses to revise a scale that has already graded published results', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const scales = await request(app)
        .get(`${API}/examinations/grade-scales`)
        .set(auth(tenant.token))
        .expect(200);

      const scaleId = scales.body.data[0].id as string;

      // The exam resolved the default scale by name at publish time.
      await ExamModel.updateOne({ _id: examId }, { $set: { gradeScaleId: scaleId } }).exec();

      const response = await request(app)
        .patch(`${API}/examinations/grade-scales/${scaleId}`)
        .set(auth(tenant.token))
        .send({ bands: BANDS })
        .expect(422);

      expect(response.body.error.message).toMatch(/already graded published results/i);
    });
  });

  /* ---------------------------------- exams ---------------------------------- */

  describe('exams', () => {
    it('creates an exam and derives its total from the components', async () => {
      await createScale();

      const response = await request(app)
        .post(`${API}/examinations`)
        .set(auth(tenant.token))
        .send(examPayload())
        .expect(201);

      expect(response.body.data.totalMarks).toBe(100);
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.currentResultVersion).toBe(0);
    });

    it('rejects an exam carrying no marks in any component', async () => {
      await request(app)
        .post(`${API}/examinations`)
        .set(auth(tenant.token))
        .send(examPayload({ code: 'ZERO', maxMarks: { theory: 0, practical: 0, internal: 0 } }))
        .expect(400);
    });

    it('rejects a duplicate exam code within the college', async () => {
      await createExam();

      await request(app)
        .post(`${API}/examinations`)
        .set(auth(tenant.token))
        .send(examPayload())
        .expect(409);
    });

    it('deletes a draft exam but not a scheduled one', async () => {
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .delete(`${API}/examinations/${examId}`)
        .set(auth(tenant.token))
        .expect(200);

      const second = await createExam({ code: 'DSA-SEM6' });

      await request(app)
        .post(`${API}/examinations/${second}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(second, 'scheduled');

      await request(app)
        .delete(`${API}/examinations/${second}`)
        .set(auth(tenant.token))
        .expect(422);
    });

    it('refuses to change the marks scheme once marks exist', async () => {
      const { examId } = await examWithVerifiedMarks();

      const response = await request(app)
        .patch(`${API}/examinations/${examId}`)
        .set(auth(tenant.token))
        .send({ maxMarks: { theory: 70, practical: 20, internal: 10 } })
        .expect(422);

      expect(response.body.error.message).toMatch(/can no longer be edited/i);
    });
  });

  /* -------------------------------- lifecycle -------------------------------- */

  describe('lifecycle', () => {
    it('walks the full sequence from draft to archived', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const archived = await transition(examId, 'archived');
      expect(archived.body.data.status).toBe('archived');
    });

    it('rejects a transition that skips a state', async () => {
      await createScale();
      const examId = await createExam();

      const response = await transition(examId, 'completed', 409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses to schedule an exam that has no date', async () => {
      await createScale();
      const examId = await createExam({ code: 'NODATE', scheduledAt: null });

      const response = await transition(examId, 'scheduled', 422);
      expect(response.body.error.message).toMatch(/needs a date and time/i);
    });

    it('refuses to publish an exam nobody is registered for', async () => {
      await createScale();
      const examId = await createExam();

      await transition(examId, 'scheduled');

      const response = await transition(examId, 'published', 422);
      expect(response.body.error.message).toMatch(/register at least one student/i);
    });

    it('refuses to reach marks_entered while a student who appeared has no verified mark', async () => {
      await createScale();
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'present' }] })
        .expect(200);

      await transition(examId, 'completed');

      const response = await transition(examId, 'marks_entered', 422);
      expect(response.body.error.message).toMatch(/no verified mark/i);
    });

    it('directs a direct move to results_published at the publish operation', async () => {
      const { examId } = await examWithVerifiedMarks();

      const response = await transition(examId, 'results_published', 422);
      expect(response.body.error.message).toMatch(/publish-results operation/i);
    });

    it('treats archived as terminal', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      await transition(examId, 'archived');
      await transition(examId, 'marks_entered', 409);
    });
  });

  /* ------------------------------- registration ------------------------------ */

  describe('registration', () => {
    it('registers a whole batch and issues hall ticket numbers', async () => {
      const examId = await createExam();
      await createStudent();
      await createStudent({ rollNumber: 'CS22B002', email: 'two@example.edu' });

      const response = await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [], batchIds: [tenant.batchId] })
        .expect(201);

      expect(response.body.data.registered).toBe(2);

      const registrations = await request(app)
        .get(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .expect(200);

      const numbers = registrations.body.data.map(
        (row: { hallTicketNumber: string }) => row.hallTicketNumber,
      );

      expect(new Set(numbers).size).toBe(2);
      expect(numbers[0]).toMatch(/^DSA-SEM5-\d{4}$/);
    });

    it('skips a student who is already registered rather than failing', async () => {
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      const second = await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      expect(second.body.data.registered).toBe(0);
      expect(second.body.data.skipped).toBe(1);
    });

    it('requires a reason before a candidate is blocked', async () => {
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      const registrations = await request(app)
        .get(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .expect(200);

      const registrationId = registrations.body.data[0].id as string;

      await request(app)
        .patch(`${API}/examinations/registrations/${registrationId}`)
        .set(auth(tenant.token))
        .send({ status: 'blocked' })
        .expect(400);

      await request(app)
        .patch(`${API}/examinations/registrations/${registrationId}`)
        .set(auth(tenant.token))
        .send({ status: 'blocked', reason: 'Outstanding fees' })
        .expect(200);
    });

    it('withholds hall tickets until the exam is published', async () => {
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await request(app)
        .get(`${API}/examinations/${examId}/hall-tickets`)
        .set(auth(tenant.token))
        .expect(422);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      const tickets = await request(app)
        .get(`${API}/examinations/${examId}/hall-tickets`)
        .set(auth(tenant.token))
        .expect(200);

      expect(tickets.body.data).toHaveLength(1);
      expect(tickets.body.data[0].rollNumber).toBe('CS22B001');
    });
  });

  /* ---------------------------------- marks ---------------------------------- */

  describe('marks', () => {
    it('computes every derived field from the grade scale', async () => {
      const { examId } = await examWithVerifiedMarks();

      const marks = await request(app)
        .get(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .expect(200);

      const entry = marks.body.data[0];

      expect(entry.rawTotal).toBe(79);
      expect(entry.percentage).toBe(79);
      expect(entry.letter).toBe('A');
      expect(entry.gradePoint).toBe(9);
      expect(entry.isPass).toBe(true);
      expect(entry.status).toBe('verified');
    });

    it('rejects a component mark above its maximum', async () => {
      await createScale();
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'present' }] })
        .expect(200);

      await transition(examId, 'completed');

      const response = await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, theory: 75, practical: 10, internal: 10 }], submit: false })
        .expect(400);

      expect(response.body.error.message).toMatch(/exceeds the maximum/i);
    });

    it('refuses marks entry before the exam is completed', async () => {
      await createScale();
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      const response = await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, theory: 40 }], submit: false })
        .expect(422);

      expect(response.body.error.message).toMatch(/once the exam is completed/i);
    });

    it('fails an absent student regardless of the marks recorded', async () => {
      await createScale();
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'malpractice', remarks: 'Caught copying' }] })
        .expect(200);

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, theory: 60, practical: 20, internal: 20 }], submit: true })
        .expect(200);

      const marks = await request(app)
        .get(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .expect(200);

      expect(marks.body.data[0].isAbsent).toBe(true);
      expect(marks.body.data[0].isPass).toBe(false);
      expect(marks.body.data[0].percentage).toBe(0);
    });

    it('records the prior values in history when a mark is corrected', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      const response = await request(app)
        .post(`${API}/examinations/${examId}/marks/correct`)
        .set(auth(tenant.token))
        .send({
          studentId,
          theory: 55,
          practical: 18,
          internal: 19,
          graceMarks: 0,
          reason: 'Revaluation of question 4 following an appeal',
        })
        .expect(200);

      expect(response.body.data.percentage).toBe(92);
      expect(response.body.data.letter).toBe('O');
      // A correction re-enters the verification queue.
      expect(response.body.data.status).toBe('submitted');
      expect(response.body.data.history).toHaveLength(1);
      expect(response.body.data.history[0].percentage).toBe(79);
      expect(response.body.data.history[0].letter).toBe('A');
      expect(response.body.data.history[0].reason).toMatch(/Revaluation/);
    });

    it('rejects a correction with no meaningful reason', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/marks/correct`)
        .set(auth(tenant.token))
        .send({ studentId, theory: 55, graceMarks: 0, reason: 'oops' })
        .expect(400);
    });

    it('leaves a verified mark untouched when marks are re-entered in bulk', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'completed' })
        .expect(200);

      const response = await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, theory: 10, practical: 0, internal: 0 }], submit: true })
        .expect(200);

      expect(response.body.data.saved).toBe(0);

      const entry = await MarksEntryModel.findOne({ examId, studentId }).exec();
      expect(entry?.percentage).toBe(79);
    });
  });

  /* ---------------------------- result publication --------------------------- */

  describe('result publication', () => {
    it('publishes results, locks the marks and records version 1', async () => {
      const { examId } = await examWithVerifiedMarks();

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      expect(response.body.data.publication.version).toBe(1);
      expect(response.body.data.publication.studentCount).toBe(1);
      expect(response.body.data.publication.passCount).toBe(1);
      expect(response.body.data.exam.status).toBe('results_published');
      expect(response.body.data.exam.resultsPublishedAt).not.toBeNull();

      const entry = await MarksEntryModel.findOne({ examId }).exec();
      expect(entry?.status).toBe('locked');
      expect(entry?.publishedVersion).toBe(1);
    });

    it('keeps a withheld student unpublished while releasing the rest', async () => {
      await createScale();
      const examId = await createExam();
      const first = await createStudent();
      const second = await createStudent({ rollNumber: 'CS22B002', email: 'two@example.edu' });

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [first, second], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({
          entries: [
            { studentId: first, status: 'present' },
            { studentId: second, status: 'present' },
          ],
        })
        .expect(200);

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({
          entries: [
            { studentId: first, theory: 45, practical: 16, internal: 18, graceMarks: 0 },
            { studentId: second, theory: 30, practical: 12, internal: 14, graceMarks: 0 },
          ],
          submit: true,
        })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/marks/verify`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await transition(examId, 'marks_entered');

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [second], reason: 'Disciplinary enquiry pending' })
        .expect(200);

      expect(response.body.data.publication.studentCount).toBe(1);
      expect(response.body.data.publication.withheldCount).toBe(1);

      const withheld = await MarksEntryModel.findOne({ examId, studentId: second }).exec();
      expect(withheld?.isWithheld).toBe(true);
      expect(withheld?.publishedVersion).toBeNull();
      // The mark itself survives; only its visibility changed.
      expect(withheld?.percentage).toBe(56);
    });

    it('refuses to publish while any mark is unverified', async () => {
      await createScale();
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'present' }] })
        .expect(200);

      await transition(examId, 'completed');

      // Marked absent so `marks_entered` can be reached without verification.
      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, theory: 45, practical: 16, internal: 18 }], submit: true })
        .expect(200);

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(422);

      expect(response.body.error.message).toMatch(/only be published from "marks entered"/i);
    });

    it('unpublishes, unlocks the marks and appends the withdrawal to the history', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/unpublish`)
        .set(auth(tenant.token))
        .send({ reason: 'A question paper error affected the whole cohort' })
        .expect(200);

      expect(response.body.data.status).toBe('marks_entered');
      expect(response.body.data.resultsPublishedAt).toBeNull();

      const entry = await MarksEntryModel.findOne({ examId }).exec();
      expect(entry?.publishedVersion).toBeNull();
      expect(entry?.status).toBe('verified');

      const history = await request(app)
        .get(`${API}/examinations/${examId}/results/history`)
        .set(auth(tenant.token))
        .expect(200);

      expect(history.body.data).toHaveLength(2);
      expect(history.body.data[0].action).toBe('unpublished');
      expect(history.body.data[0].version).toBe(2);
      expect(history.body.data[1].action).toBe('published');
    });

    it('refuses to unpublish results that were never published', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/unpublish`)
        .set(auth(tenant.token))
        .send({ reason: 'A reason long enough to pass validation' })
        .expect(422);
    });

    /**
     * Recalculation regrades from the raw components, so a scale change or a
     * grace policy applied after the fact reaches every affected student.
     */
    it('regrades every entry when the policy changes and records what moved', async () => {
      const { examId } = await examWithVerifiedMarks({
        theory: 20,
        practical: 10,
        internal: 8,
      });

      const before = await MarksEntryModel.findOne({ examId }).exec();
      expect(before?.percentage).toBe(38);
      expect(before?.isPass).toBe(false);

      // The pass mark drops, so the same raw marks now clear it.
      const scales = await request(app)
        .get(`${API}/examinations/grade-scales`)
        .set(auth(tenant.token))
        .expect(200);

      await request(app)
        .patch(`${API}/examinations/grade-scales/${scales.body.data[0].id}`)
        .set(auth(tenant.token))
        .send({
          policy: { passingPercent: 35 },
          bands: [
            { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true },
            { letter: 'A', minPercent: 70, maxPercent: 89.99, gradePoint: 9, isPass: true },
            { letter: 'B', minPercent: 55, maxPercent: 69.99, gradePoint: 7, isPass: true },
            { letter: 'P', minPercent: 35, maxPercent: 54.99, gradePoint: 5, isPass: true },
            { letter: 'F', minPercent: 0, maxPercent: 34.99, gradePoint: 0, isPass: false },
          ],
        })
        .expect(200);

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/recalculate`)
        .set(auth(tenant.token))
        .send({ reason: 'Grade scale revised by the examination board' })
        .expect(200);

      expect(response.body.data.recalculated).toBe(1);
      expect(response.body.data.changed).toBe(1);

      const after = await MarksEntryModel.findOne({ examId }).exec();
      expect(after?.isPass).toBe(true);
      expect(after?.letter).toBe('P');
      // The raw components are untouched; only the derived grade moved.
      expect(after?.theory).toBe(20);
      expect(after?.history).toHaveLength(1);
      expect(after?.history[0]?.letter).toBe('F');
    });

    it('reports nothing changed when a recalculation is a no-op', async () => {
      const { examId } = await examWithVerifiedMarks();

      const response = await request(app)
        .post(`${API}/examinations/${examId}/results/recalculate`)
        .set(auth(tenant.token))
        .send({ reason: 'Routine verification of the computed grades' })
        .expect(200);

      expect(response.body.data.recalculated).toBe(1);
      expect(response.body.data.changed).toBe(0);
    });
  });

  /* -------------------------------- transcripts ------------------------------ */

  describe('transcripts', () => {
    it('builds a transcript from published results and syncs the student CGPA', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const response = await request(app)
        .post(`${API}/examinations/transcripts`)
        .set(auth(tenant.token))
        .send({ studentId })
        .expect(201);

      expect(response.body.data.revision).toBe(1);
      expect(response.body.data.isCurrent).toBe(true);
      expect(response.body.data.cgpa).toBe(9);
      expect(response.body.data.totalCreditsEarned).toBe(4);
      expect(response.body.data.activeBacklogs).toBe(0);
      expect(response.body.data.subjects).toHaveLength(1);
      expect(response.body.data.subjects[0].courseCode).toBe('CS201');
      expect(response.body.data.semesters[0].gpa).toBe(9);

      const student = await request(app)
        .get(`${API}/students/${studentId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(student.body.data.academics.currentCgpa).toBe(9);
    });

    it('supersedes the previous transcript rather than editing it', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/transcripts`)
        .set(auth(tenant.token))
        .send({ studentId })
        .expect(201);

      const second = await request(app)
        .post(`${API}/examinations/transcripts`)
        .set(auth(tenant.token))
        .send({ studentId })
        .expect(201);

      expect(second.body.data.revision).toBe(2);

      const versions = await request(app)
        .get(`${API}/examinations/transcripts/${studentId}/versions`)
        .set(auth(tenant.token))
        .expect(200);

      expect(versions.body.data).toHaveLength(2);
      expect(versions.body.data.filter((row: { isCurrent: boolean }) => row.isCurrent)).toHaveLength(
        1,
      );
    });

    it('refuses to build a transcript with no published results behind it', async () => {
      const { studentId } = await examWithVerifiedMarks();

      const response = await request(app)
        .post(`${API}/examinations/transcripts`)
        .set(auth(tenant.token))
        .send({ studentId })
        .expect(422);

      expect(response.body.error.message).toMatch(/no published results/i);
    });

    it('reports 404 for a student who has no transcript yet', async () => {
      const studentId = await createStudent();

      await request(app)
        .get(`${API}/examinations/transcripts/${studentId}`)
        .set(auth(tenant.token))
        .expect(404);
    });
  });

  /* -------------------------------- analytics -------------------------------- */

  describe('analytics', () => {
    it('summarises exams by status', async () => {
      const { examId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const response = await request(app)
        .get(`${API}/examinations/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.published).toBe(1);
      expect(response.body.data.passRate).toBe(100);
    });

    it('exposes the live counts and allowed transitions on the profile', async () => {
      const { examId } = await examWithVerifiedMarks();

      const response = await request(app)
        .get(`${API}/examinations/${examId}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.counts.registered).toBe(1);
      expect(response.body.data.counts.present).toBe(1);
      expect(response.body.data.counts.marksEntered).toBe(1);
      expect(response.body.data.results.passCount).toBe(1);
      expect(response.body.data.gradeScale.code).toBe('TEN');
      expect(response.body.data.allowedTransitions).toContain('results_published');
    });
  });

  /* --------------------------- training integration -------------------------- */

  describe('training integration', () => {
    async function createTrainingSession(): Promise<string> {
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

      const response = await request(app)
        .post(`${API}/training/sessions`)
        .set(auth(tenant.token))
        .send({
          title: 'Advanced Java — Batch A',
          trainingType: 'technical',
          departmentIds: [tenant.departmentId],
          batchIds: [tenant.batchId],
          trainerIds: [],
          startDate: day(1),
          endDate: day(3),
          capacity: 30,
          mode: 'offline',
          location: 'Lab 3',
          learningObjectives: ['Write concurrent code'],
          topics: ['Concurrency'],
          status: 'scheduled',
        })
        .expect(201);

      return response.body.data.id as string;
    }

    it('fills the assessmentExamId extension point when an exam is attached', async () => {
      await createScale();
      const sessionId = await createTrainingSession();

      const examId = await createExam({ code: 'TRN-ASSESS', trainingSessionId: sessionId });

      const session = await TrainingSessionModel.findById(sessionId).exec();
      expect(String(session?.assessmentExamId)).toBe(examId);
    });

    it('refuses a second assessment for the same training session', async () => {
      await createScale();
      const sessionId = await createTrainingSession();

      await createExam({ code: 'TRN-ASSESS', trainingSessionId: sessionId });

      const response = await request(app)
        .post(`${API}/examinations`)
        .set(auth(tenant.token))
        .send(examPayload({ code: 'TRN-SECOND', trainingSessionId: sessionId }))
        .expect(422);

      expect(response.body.error.message).toMatch(/already has an assessment/i);
    });

    it('clears the extension point when the assessment is deleted', async () => {
      await createScale();
      const sessionId = await createTrainingSession();
      const examId = await createExam({ code: 'TRN-ASSESS', trainingSessionId: sessionId });

      await request(app)
        .delete(`${API}/examinations/${examId}`)
        .set(auth(tenant.token))
        .expect(200);

      const session = await TrainingSessionModel.findById(sessionId).exec();
      expect(session?.assessmentExamId).toBeNull();
    });

    it('links each enrolment to its marks entry once results are published', async () => {
      await createScale();
      const sessionId = await createTrainingSession();
      const examId = await createExam({ code: 'TRN-ASSESS', trainingSessionId: sessionId });
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'present' }] })
        .expect(200);

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({
          entries: [{ studentId, theory: 45, practical: 16, internal: 18, graceMarks: 0 }],
          submit: true,
        })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/marks/verify`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await transition(examId, 'marks_entered');

      const enrollmentBefore = await TrainingEnrollmentModel.findOne({ sessionId }).exec();
      expect(enrollmentBefore?.assessmentAttemptId).toBeNull();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const entry = await MarksEntryModel.findOne({ examId, studentId }).exec();
      const enrollmentAfter = await TrainingEnrollmentModel.findOne({ sessionId }).exec();

      expect(String(enrollmentAfter?.assessmentAttemptId)).toBe(String(entry?._id));
    });

    it('leaves a withheld student unlinked on the training record', async () => {
      await createScale();
      const sessionId = await createTrainingSession();
      const examId = await createExam({ code: 'TRN-ASSESS', trainingSessionId: sessionId });
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/training/sessions/${sessionId}/enrol`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({ entries: [{ studentId, status: 'present' }] })
        .expect(200);

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({
          entries: [{ studentId, theory: 45, practical: 16, internal: 18, graceMarks: 0 }],
          submit: true,
        })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/marks/verify`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await transition(examId, 'marks_entered');

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [studentId], reason: 'Fees outstanding' })
        .expect(200);

      const enrollment = await TrainingEnrollmentModel.findOne({ sessionId }).exec();
      expect(enrollment?.assessmentAttemptId).toBeNull();
    });
  });

  /* ------------------------------- permissions ------------------------------- */

  describe('permissions', () => {
    it('lets faculty enter marks but not verify them', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'lecturer@example.edu',
        employeeId: 'EMP2001',
      });

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(faculty.token))
        .send({ entries: [{ studentId, theory: 40, practical: 15, internal: 15 }], submit: true })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/marks/verify`)
        .set(auth(faculty.token))
        .send({})
        .expect(403);
    });

    it('does not let faculty publish results', async () => {
      const { examId } = await examWithVerifiedMarks();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'lecturer2@example.edu',
        employeeId: 'EMP2002',
      });

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(faculty.token))
        .send({ withholdStudentIds: [] })
        .expect(403);
    });

    it('does not let a student reach the marks list for an exam', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      const student = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'meera.iyer@example.edu.student',
      });

      expect(studentId).toBeTruthy();

      await request(app)
        .get(`${API}/examinations/${examId}/marks`)
        .set(auth(student.token))
        .expect(403);
    });

    it('does not let faculty manage grade scales', async () => {
      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'lecturer3@example.edu',
        employeeId: 'EMP2003',
      });

      await request(app)
        .post(`${API}/examinations/grade-scales`)
        .set(auth(faculty.token))
        .send(scalePayload({ code: 'NOPE' }))
        .expect(403);

      // Reading is allowed: faculty need to see how their marks will grade.
      await request(app)
        .get(`${API}/examinations/grade-scales`)
        .set(auth(faculty.token))
        .expect(200);
    });
  });

  /* ----------------------------- tenant isolation ---------------------------- */

  describe('tenant isolation', () => {
    it('reports another college exam as missing rather than forbidden', async () => {
      const { examId } = await examWithVerifiedMarks();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      // 404, not 403: a 403 would confirm the exam exists.
      await request(app)
        .get(`${API}/examinations/${examId}`)
        .set(auth(other.token))
        .expect(404);

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(other.token))
        .send({ withholdStudentIds: [] })
        .expect(404);
    });

    it('keeps exam lists scoped to the caller college', async () => {
      await createExam();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      const response = await request(app)
        .get(`${API}/examinations`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('allows the same exam code in two different colleges', async () => {
      await createExam();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      const otherCourse = await request(app)
        .post(`${API}/courses`)
        .set(auth(other.token))
        .send({
          title: 'Data Structures',
          code: 'CS201',
          description: 'Core data structures and algorithm design fundamentals.',
          category: 'technical',
          level: 'intermediate',
          durationHours: 45,
          credits: 4,
          semester: 5,
          departmentIds: [other.departmentId],
          batchIds: [other.batchId],
          instructorIds: [],
          prerequisites: [],
          learningOutcomes: ['Analyse complexity'],
          tags: [],
          status: 'published',
        })
        .expect(201);

      await request(app)
        .post(`${API}/examinations`)
        .set(auth(other.token))
        .send({
          ...examPayload(),
          courseId: otherCourse.body.data.id,
          departmentId: other.departmentId,
          batchIds: [other.batchId],
        })
        .expect(201);
    });

    it('will not register a student from another college', async () => {
      const examId = await createExam();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      const foreignStudent = await request(app)
        .post(`${API}/students`)
        .set(auth(other.token))
        .send(
          studentPayload(other, {
            rollNumber: 'NIT22B001',
            email: 'foreign@example.edu',
          }),
        )
        .expect(201);

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [foreignStudent.body.data.id], batchIds: [] })
        .expect(400);
    });
  });

  /* ------------------------- student self-service ---------------------------- */

  describe('student self-service', () => {
    /** A student account that can actually sign in and owns a Student record. */
    async function studentLogin(email = 'meera.iyer@example.edu'): Promise<{
      token: string;
      studentId: string;
    }> {
      const user = await UserModel.findOne({ email }).exec();
      if (!user) throw new Error(`No user for ${email}`);

      const student = await StudentModel.findOne({ userId: user._id }).exec();
      if (!student) throw new Error(`No student record for ${email}`);

      const { hashPassword } = await import('@/utils/crypto');

      await UserModel.updateOne(
        { _id: user._id },
        { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
      ).exec();

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'CorrectHorse9' })
        .expect(200);

      return { studentId: String(student._id), token: login.body.data.accessToken as string };
    }

    /** Drives one exam all the way to published results. */
    async function publishedResult() {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      return { examId, studentId };
    }

    it('returns the caller own results with no id in the URL', async () => {
      await publishedResult();
      const { token } = await studentLogin();

      const response = await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].letter).toBe('A');
      expect(response.body.data.results[0].percentage).toBe(79);
      expect(response.body.data.results[0].courseCode).toBe('CS201');
      expect(response.body.data.results[0].examCode).toBe('DSA-SEM5');
      expect(response.body.data.summary.cgpa).toBe(9);
      expect(response.body.data.summary.semesters[0].gpa).toBe(9);
    });

    /**
     * Correction history, examiner remarks, workflow status and the ids of
     * whoever entered or verified a mark are the office record, not the
     * student's.
     */
    it('does not leak internal audit fields to the student', async () => {
      await publishedResult();
      const { token } = await studentLogin();

      const response = await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(token))
        .expect(200);

      const result = response.body.data.results[0];

      for (const field of [
        'history',
        'status',
        'enteredBy',
        'verifiedBy',
        'enteredAt',
        'verifiedAt',
        'remarks',
        'publishedVersion',
        'studentId',
      ]) {
        expect(result).not.toHaveProperty(field);
      }
    });

    it('omits a result that has not been published', async () => {
      // Marks entered and verified, but never released.
      await examWithVerifiedMarks();
      const { token } = await studentLogin();

      const response = await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data.results).toHaveLength(0);
      expect(response.body.data.withheld).toHaveLength(0);
      expect(response.body.data.summary.cgpa).toBe(0);
    });

    /**
     * A withheld result is acknowledged so the student knows to ask, but the
     * mark itself must not travel.
     */
    it('reports a withheld result without any marks or grade', async () => {
      const { examId, studentId } = await examWithVerifiedMarks();

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [studentId], reason: 'Fees outstanding' })
        .expect(200);

      const { token } = await studentLogin();

      const response = await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data.results).toHaveLength(0);
      expect(response.body.data.withheld).toHaveLength(1);

      const withheld = response.body.data.withheld[0];
      expect(withheld.courseCode).toBe('CS201');
      expect(withheld.examCode).toBe('DSA-SEM5');

      for (const field of ['percentage', 'letter', 'finalTotal', 'gradePoint', 'isPass']) {
        expect(withheld).not.toHaveProperty(field);
      }

      // A withheld result must not reach the CGPA either.
      expect(response.body.data.summary.cgpa).toBe(0);
    });

    it('returns the caller own transcript, and null before one is issued', async () => {
      const { studentId } = await publishedResult();
      const { token } = await studentLogin();

      const before = await request(app)
        .get(`${API}/examinations/me/transcript`)
        .set(auth(token))
        .expect(200);

      expect(before.body.data).toBeNull();

      await request(app)
        .post(`${API}/examinations/transcripts`)
        .set(auth(tenant.token))
        .send({ studentId })
        .expect(201);

      const after = await request(app)
        .get(`${API}/examinations/me/transcript`)
        .set(auth(token))
        .expect(200);

      expect(after.body.data.cgpa).toBe(9);
      expect(after.body.data.revision).toBe(1);
      expect(after.body.data.subjects).toHaveLength(1);
      expect(after.body.data.semesters[0].gpa).toBe(9);
    });

    it('refuses a caller without the own-scoped permission', async () => {
      await publishedResult();

      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'lecturer.own@example.edu',
        employeeId: 'EMP3001',
      });

      // Faculty hold marks:read but not result:read_own.
      await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(faculty.token))
        .expect(403);
    });

    it('refuses an account with no student record behind it', async () => {
      await publishedResult();

      // Holds the student role, and so the permission, but no Student document.
      const orphan = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.STUDENT,
        email: 'orphan@example.edu',
      });

      await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(orphan.token))
        .expect(403);
    });

    it('gives each student only their own results', async () => {
      // Both candidates are registered before the exam leaves the registration
      // window — the server refuses a late addition, correctly.
      await createScale();
      const examId = await createExam();

      const first = await createStudent();
      const second = await createStudent({
        rollNumber: 'CS22B002',
        email: 'second.student@example.edu',
      });

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [first, second], batchIds: [] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      await request(app)
        .post(`${API}/examinations/${examId}/attendance`)
        .set(auth(tenant.token))
        .send({
          entries: [
            { studentId: first, status: 'present' },
            { studentId: second, status: 'present' },
          ],
        })
        .expect(200);

      await transition(examId, 'completed');

      await request(app)
        .post(`${API}/examinations/${examId}/marks`)
        .set(auth(tenant.token))
        .send({
          entries: [
            { studentId: first, theory: 45, practical: 16, internal: 18, graceMarks: 0 },
            { studentId: second, theory: 30, practical: 12, internal: 14, graceMarks: 0 },
          ],
          submit: true,
        })
        .expect(200);

      await request(app)
        .post(`${API}/examinations/${examId}/marks/verify`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      await transition(examId, 'marks_entered');

      await request(app)
        .post(`${API}/examinations/${examId}/results/publish`)
        .set(auth(tenant.token))
        .send({ withholdStudentIds: [] })
        .expect(200);

      const { token } = await studentLogin('second.student@example.edu');

      const response = await request(app)
        .get(`${API}/examinations/me/results`)
        .set(auth(token))
        .expect(200);

      // Their own 56%, not the other candidate's 79%.
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].percentage).toBe(56);
    });

    it('still refuses the staff endpoints that name a student in the URL', async () => {
      const { studentId } = await publishedResult();
      const { token } = await studentLogin();

      // `result:read_own` must not unlock the by-id endpoints, even for self.
      await request(app)
        .get(`${API}/examinations/results/students/${studentId}`)
        .set(auth(token))
        .expect(403);

      await request(app)
        .get(`${API}/examinations/transcripts/${studentId}`)
        .set(auth(token))
        .expect(403);
    });
  });

  /* ------------------- student visibility and exam integrity ------------------ */

  /**
   * Regression cover for three defects found by audit. All three came from the
   * same root cause: `exam:read` is held by staff *and* students, and the read
   * paths narrowed by department without ever narrowing by lifecycle or owner.
   */
  describe('student visibility and exam integrity', () => {
    async function signInStudent(email = 'meera.iyer@example.edu'): Promise<{
      token: string;
      studentId: string;
    }> {
      const user = await UserModel.findOne({ email }).exec();
      if (!user) throw new Error(`No user for ${email}`);

      const student = await StudentModel.findOne({ userId: user._id }).exec();
      if (!student) throw new Error(`No student record for ${email}`);

      const { hashPassword } = await import('@/utils/crypto');

      await UserModel.updateOne(
        { _id: user._id },
        { $set: { status: 'active', passwordHash: await hashPassword('CorrectHorse9') } },
      ).exec();

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'CorrectHorse9' })
        .expect(200);

      return { studentId: String(student._id), token: login.body.data.accessToken as string };
    }

    /** An exam driven to `published`, with the student registered on it. */
    async function publishedExamWithStudent() {
      const examId = await createExam();
      const studentId = await createStudent();

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      return { examId, studentId };
    }

    async function addPaper(examId: string, isReleased: boolean, title: string) {
      return request(app)
        .post(`${API}/examinations/${examId}/papers`)
        .set(auth(tenant.token))
        .send({
          title,
          totalMarks: 100,
          sections: [{ name: 'Section A', questionCount: 10, marksPerQuestion: 10 }],
          instructions: 'Answer all questions.',
          attachment: {
            url: 'https://files.example.edu/paper.pdf',
            fileName: 'paper.pdf',
            fileKey: `papers/${title}.pdf`,
            sizeBytes: 1024,
            mimeType: 'application/pdf',
          },
          isReleased,
        })
        .expect(201);
    }

    /* ------------------------- defect 1: draft exams ------------------------ */

    it('shows a student a published exam', async () => {
      await publishedExamWithStudent();
      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('published');
    });

    it('hides a draft exam from a student', async () => {
      await createExam();
      await createStudent();
      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('hides a scheduled exam from a student', async () => {
      const examId = await createExam();
      await createStudent();
      await transition(examId, 'scheduled');

      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    /** The filter is applied last, so a caller-supplied status cannot widen it. */
    it('does not let ?status=draft expose drafts to a student', async () => {
      await createExam();
      await createStudent();
      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations?status=draft`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('refuses a student fetching an unpublished exam by id', async () => {
      const examId = await createExam();
      await createStudent();
      const { token } = await signInStudent();

      // 404 rather than 403 — a 403 would confirm the exam exists.
      await request(app)
        .get(`${API}/examinations/${examId}`)
        .set(auth(token))
        .expect(404);
    });

    it('leaves staff able to see drafts', async () => {
      await createExam();

      const response = await request(app)
        .get(`${API}/examinations?status=draft`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('draft');
    });

    /* ------------------------ defect 2: exam papers ------------------------- */

    it('gives a student the released paper only', async () => {
      const { examId } = await publishedExamWithStudent();

      await addPaper(examId, false, 'Unreleased revision');
      await addPaper(examId, true, 'Released revision');

      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations/${examId}/papers`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Released revision');
      expect(response.body.data[0].isReleased).toBe(true);
    });

    /**
     * The whole point of the fix: an unreleased paper carries the question
     * sections and a URL to the actual file.
     */
    it('never leaks an unreleased paper, its sections or its attachment', async () => {
      const { examId } = await publishedExamWithStudent();
      await addPaper(examId, false, 'Unreleased revision');

      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations/${examId}/papers`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toEqual([]);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain('Unreleased revision');
      expect(body).not.toContain('Section A');
      expect(body).not.toContain('files.example.edu');
    });

    it('gives staff the full revision history', async () => {
      const { examId } = await publishedExamWithStudent();

      await addPaper(examId, false, 'Unreleased revision');
      await addPaper(examId, true, 'Released revision');

      const response = await request(app)
        .get(`${API}/examinations/${examId}/papers`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    /* ----------------------- defect 3: hall tickets ------------------------- */

    it('gives a student only their own hall ticket', async () => {
      const { examId } = await publishedExamWithStudent();

      const otherId = await createStudent({
        email: 'second.student@example.edu',
        rollNumber: 'CS22B002',
        firstName: 'Arun',
      });

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [otherId] })
        .expect(201);

      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations/${examId}/hall-tickets`)
        .set(auth(token))
        .expect(200);

      // The controller projects the registration down to a hall ticket, so the
      // student is identified by roll number rather than id.
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].rollNumber).toBe('CS22B001');

      // The other candidate must appear nowhere in the payload.
      expect(JSON.stringify(response.body)).not.toContain('CS22B002');
    });

    it('gives staff the whole roster', async () => {
      const { examId } = await publishedExamWithStudent();

      const otherId = await createStudent({
        email: 'second.student@example.edu',
        rollNumber: 'CS22B002',
        firstName: 'Arun',
      });

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [otherId] })
        .expect(201);

      const response = await request(app)
        .get(`${API}/examinations/${examId}/hall-tickets`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('returns nothing for a student not registered on the exam', async () => {
      const examId = await createExam();

      // Meera is never registered. Arun is, because publishing an exam with an
      // empty roster is refused by the lifecycle rules.
      await createStudent();
      const registeredId = await createStudent({
        email: 'second.student@example.edu',
        rollNumber: 'CS22B002',
        firstName: 'Arun',
      });

      await request(app)
        .post(`${API}/examinations/${examId}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [registeredId] })
        .expect(201);

      await transition(examId, 'scheduled');
      await transition(examId, 'published');

      const { token } = await signInStudent();

      const response = await request(app)
        .get(`${API}/examinations/${examId}/hall-tickets`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    /* ------------------------- isolation and RBAC --------------------------- */

    it('keeps a student scoped to their own college', async () => {
      const { examId } = await publishedExamWithStudent();

      // A second tenant exists but owns nothing this student may reach.
      await createTenant(app, { code: 'KCT', adminEmail: 'admin.kct@example.edu' });

      const { token } = await signInStudent();

      const list = await request(app)
        .get(`${API}/examinations`)
        .set(auth(token))
        .expect(200);

      expect(list.body.data).toHaveLength(1);
      expect(String(list.body.data[0].id)).toBe(examId);

      // An id outside the caller's tenant is indistinguishable from one that
      // does not exist — 404, never 403.
      const foreignId = new mongoose.Types.ObjectId().toString();

      await request(app)
        .get(`${API}/examinations/${foreignId}`)
        .set(auth(token))
        .expect(404);

      await request(app)
        .get(`${API}/examinations/${foreignId}/papers`)
        .set(auth(token))
        .expect(404);
    });

    it('still refuses a caller with no exam permission', async () => {
      const { examId } = await publishedExamWithStudent();

      const officer = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.PLACEMENT_OFFICER,
        email: 'officer.exams@example.edu',
      });

      await request(app).get(`${API}/examinations`).set(auth(officer.token)).expect(403);

      await request(app)
        .get(`${API}/examinations/${examId}/papers`)
        .set(auth(officer.token))
        .expect(403);
    });
  });
});
