import mongoose from 'mongoose';
import request from 'supertest';

import { AttendanceRecordModel } from '@/models/attendance-record.model';
import { PlacementModel } from '@/models/placement.model';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createPlatformAdmin,
  createTenant,
  studentPayload,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

describe('platform aggregation API', () => {
  const app = testApp();
  let tenant: TenantFixture;
  let platform: { token: string; userId: string };

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    platform = await createPlatformAdmin(app);
  });

  describe('authorization', () => {
    it('allows a platform administrator', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .set(auth(platform.token))
        .expect(200);
    });

    it('refuses a college administrator', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .set(auth(tenant.token))
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .expect(401);
    });
  });

  describe('metrics', () => {
    const overview = async () => {
      const response = await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .set(auth(platform.token))
        .expect(200);

      return response.body.data as Record<string, number>;
    };

    /**
     * Only a published exam is live for students, so only a published exam is
     * counted. Driven through the real transitions rather than by writing the
     * status directly, because reaching `published` is the thing being asserted.
     */
    it('counts published examinations and ignores drafts', async () => {
      const courseId = await request(app)
        .post(`${API}/courses`)
        .set(auth(tenant.token))
        .send({
          title: 'Data Structures and Algorithms',
          code: 'CS201',
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
        })
        .expect(201)
        .then((r) => r.body.data.id as string);

      const examPayload = (code: string) => ({
        title: 'DSA Semester Examination',
        code,
        examType: 'semester',
        courseId,
        departmentId: tenant.departmentId,
        batchIds: [tenant.batchId],
        semester: 5,
        academicYear: '2025-2026',
        maxMarks: { theory: 60, practical: 20, internal: 20 },
        credits: 4,
        scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        durationMinutes: 180,
        venue: 'Hall A',
      });

      const createExam = async (code: string) =>
        request(app)
          .post(`${API}/examinations`)
          .set(auth(tenant.token))
          .send(examPayload(code))
          .expect(201)
          .then((r) => r.body.data.id as string);

      // One stays a draft; the other is driven to published.
      await createExam('DRAFT-1');
      const published = await createExam('PUB-1');

      // An exam cannot be scheduled with nobody sitting it.
      const studentId = await request(app)
        .post(`${API}/students`)
        .set(auth(tenant.token))
        .send(studentPayload(tenant))
        .expect(201)
        .then((r) => r.body.data.id as string);

      await request(app)
        .post(`${API}/examinations/${published}/registrations`)
        .set(auth(tenant.token))
        .send({ studentIds: [studentId], batchIds: [] })
        .expect(201);

      for (const to of ['scheduled', 'published']) {
        await request(app)
          .post(`${API}/examinations/${published}/transition`)
          .set(auth(tenant.token))
          .send({ to })
          .expect(200);
      }

      expect((await overview()).examinations).toBe(1);
    });

    /**
     * A student may hold more than one joined primary offer, so the metric
     * groups by student. Counting documents would report three placed students
     * where the platform has two.
     */
    it('counts placed students once each, not placement records', async () => {
      const studentA = new mongoose.Types.ObjectId();
      const studentB = new mongoose.Types.ObjectId();

      const placement = (studentId: mongoose.Types.ObjectId, academicYear = '2025-2026') => ({
        collegeId: tenant.collegeId,
        studentId,
        applicationId: new mongoose.Types.ObjectId(),
        jobPostingId: new mongoose.Types.ObjectId(),
        companyId: new mongoose.Types.ObjectId(),
        departmentId: tenant.departmentId,
        batchId: tenant.batchId,
        offerDate: new Date(),
        joiningDate: new Date(),
        joinedAt: new Date(),
        designation: 'Software Engineer',
        location: 'Bengaluru',
        jobType: 'full_time',
        package: { currency: 'INR', ctc: 1_200_000, fixed: 1_000_000, variable: 200_000 },
        isPrimaryOffer: true,
        academicYear,
        status: 'joined',
      });

      /**
       * A unique index allows a student only one primary offer per college per
       * academic year, so the duplicate is a second year rather than a second
       * offer in the same one — a student placed, then placed again after
       * changing course. Counting documents would report three placed students
       * where the platform has two.
       */
      await PlacementModel.create([
        placement(studentA),
        placement(studentA, '2026-2027'),
        placement(studentB),
      ]);

      expect((await overview()).placements).toBe(2);
    });

    /**
     * Present, late and on-duty all count as attending; `excused` stays in the
     * denominator. Dropping it would read ~88.9% here instead of 80%.
     */
    it('computes the attendance rate with excused in the denominator', async () => {
      const record = (status: string) => ({
        collegeId: tenant.collegeId,
        sessionId: new mongoose.Types.ObjectId(),
        studentId: new mongoose.Types.ObjectId(),
        batchId: tenant.batchId,
        date: new Date(),
        status,
        markedAt: new Date(),
      });

      // attended = 6 + 1 + 1 = 8, total = 10 → 80%
      await AttendanceRecordModel.create([
        ...Array.from({ length: 6 }, () => record('present')),
        record('late'),
        record('on_duty'),
        record('absent'),
        record('excused'),
      ]);

      expect((await overview()).attendanceRate).toBe(80);
    });
  });
});
