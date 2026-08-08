import { ROLE_KEYS } from '@peacefic/shared';
import request from 'supertest';

import { CompanyModel } from '@/models/company.model';
import { JobApplicationModel } from '@/models/job-application.model';
import { JobPostingModel } from '@/models/job-posting.model';
import { PlacementModel } from '@/models/placement.model';
import { StudentModel } from '@/models/student.model';
import { UserModel } from '@/models/user.model';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createStaffUser,
  createTenant,
  studentPayload,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

const daysFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('placement API', () => {
  const app = testApp();
  let tenant: TenantFixture;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
  });

  /* --------------------------------- helpers -------------------------------- */

  const companyPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Acme Technologies',
    legalName: 'Acme Technologies Private Limited',
    industry: 'Information Technology',
    companyType: 'product',
    sizeRange: '1000-5000',
    headquarters: 'Bengaluru',
    locations: ['Bengaluru', 'Hyderabad'],
    website: 'https://acme.example.com',
    description: 'Builds developer tooling.',
    email: 'careers@acme.example.com',
    phone: '+919876500001',
    contacts: [
      {
        name: 'Priya Menon',
        designation: 'Talent Acquisition Lead',
        email: 'priya.menon@acme.example.com',
        phone: '+919876500002',
        isPrimary: true,
      },
    ],
    ...overrides,
  });

  const jobPayload = (companyId: string, overrides: Record<string, unknown> = {}) => ({
    companyId,
    title: 'Software Engineer',
    description:
      'Build and maintain backend services for a large developer tooling platform.',
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
    selectionRounds: [
      { order: 1, name: 'Online Test', type: 'aptitude', mode: 'online' },
      { order: 2, name: 'Technical Interview', type: 'technical_interview', mode: 'online' },
    ],
    applicationOpenAt: daysFromNow(-1),
    applicationCloseAt: daysFromNow(14),
    driveDate: daysFromNow(21),
    attachments: [],
    ...overrides,
  });

  async function createCompany(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post(`${API}/companies`)
      .set(auth(tenant.token))
      .send(companyPayload(overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  async function createJob(
    companyId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app)
      .post(`${API}/jobs`)
      .set(auth(tenant.token))
      .send(jobPayload(companyId, overrides))
      .expect(201);

    return response.body.data.id as string;
  }

  /** A student whose academics are set directly, to drive eligibility rules. */
  async function createStudent(
    overrides: Record<string, unknown> = {},
    academics: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app)
      .post(`${API}/students`)
      .set(auth(tenant.token))
      .send(studentPayload(tenant, overrides))
      .expect(201);

    const id = response.body.data.id as string;

    if (Object.keys(academics).length > 0) {
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(academics)) patch[`academics.${key}`] = value;
      await StudentModel.updateOne({ _id: id }, { $set: patch }).exec();
    }

    return id;
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

  /* --------------------------------- companies ------------------------------- */

  describe('companies', () => {
    it('creates a company, unverified until someone checks it', async () => {
      const response = await request(app)
        .post(`${API}/companies`)
        .set(auth(tenant.token))
        .send(companyPayload())
        .expect(201);

      expect(response.body.data.name).toBe('Acme Technologies');
      expect(response.body.data.legalName).toBe('Acme Technologies Private Limited');
      expect(response.body.data.contacts).toHaveLength(1);
      // Recruitment fraud is real, so this is never granted on creation.
      expect(response.body.data.isVerified).toBe(false);
      expect(response.body.data.status).toBe('active');
    });

    /** "Acme" and "ACME" are one company, not two halves of a drive history. */
    it('refuses a duplicate name regardless of case', async () => {
      await createCompany();

      await request(app)
        .post(`${API}/companies`)
        .set(auth(tenant.token))
        .send(companyPayload({ name: 'ACME TECHNOLOGIES' }))
        .expect(409);
    });

    it('refuses two primary contacts', async () => {
      await request(app)
        .post(`${API}/companies`)
        .set(auth(tenant.token))
        .send(
          companyPayload({
            contacts: [
              {
                name: 'A',
                designation: 'HR',
                email: 'a@acme.example.com',
                phone: '+919876500003',
                isPrimary: true,
              },
              {
                name: 'B',
                designation: 'HR',
                email: 'b@acme.example.com',
                phone: '+919876500004',
                isPrimary: true,
              },
            ],
          }),
        )
        .expect(400);
    });

    it('records who verified a company and when', async () => {
      const id = await createCompany();

      const response = await request(app)
        .post(`${API}/companies/${id}/verify`)
        .set(auth(tenant.token))
        .send({ isVerified: true, note: 'GST and website checked' })
        .expect(200);

      expect(response.body.data.isVerified).toBe(true);
      expect(response.body.data.verifiedAt).not.toBeNull();
      expect(response.body.data.verificationNote).toBe('GST and website checked');
    });

    it('blacklists with a reason and refuses a second attempt', async () => {
      const id = await createCompany();

      const response = await request(app)
        .post(`${API}/companies/${id}/blacklist`)
        .set(auth(tenant.token))
        .send({ reason: 'Withdrew offers after the drive without notice' })
        .expect(200);

      expect(response.body.data.status).toBe('blacklisted');
      expect(response.body.data.blacklistReason).toMatch(/withdrew offers/i);

      await request(app)
        .post(`${API}/companies/${id}/blacklist`)
        .set(auth(tenant.token))
        .send({ reason: 'Another reason entirely here' })
        .expect(422);
    });

    /** Reinstating is its own decision, not a quiet status edit. */
    it('refuses to lift a blacklist through an ordinary update', async () => {
      const id = await createCompany();

      await request(app)
        .post(`${API}/companies/${id}/blacklist`)
        .set(auth(tenant.token))
        .send({ reason: 'Withdrew offers after the drive' })
        .expect(200);

      await request(app)
        .patch(`${API}/companies/${id}`)
        .set(auth(tenant.token))
        .send({ status: 'active' })
        .expect(422);

      await request(app)
        .post(`${API}/companies/${id}/reinstate`)
        .set(auth(tenant.token))
        .send({ reason: 'Cleared after review by the placement committee' })
        .expect(200);

      const company = await CompanyModel.findById(id).exec();
      expect(company?.status).toBe('active');
      expect(company?.blacklistReason).toBeNull();
    });

    it('refuses to delete a company that has drive history', async () => {
      const companyId = await createCompany();
      await createJob(companyId);

      const response = await request(app)
        .delete(`${API}/companies/${companyId}`)
        .set(auth(tenant.token))
        .expect(422);

      expect(response.body.error.message).toMatch(/blacklist it instead/i);
    });

    it('reports per-row outcomes on a bulk delete rather than failing the batch', async () => {
      const deletable = await createCompany({ name: 'Deletable Co' });
      const blocked = await createCompany({ name: 'Blocked Co' });
      await createJob(blocked);

      const response = await request(app)
        .delete(`${API}/companies/bulk`)
        .set(auth(tenant.token))
        .send({ ids: [deletable, blocked] })
        .expect(200);

      expect(response.body.data.successCount).toBe(1);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[1].message).toMatch(/blacklist it instead/i);
    });
  });

  /* ------------------------------- permissions ------------------------------- */

  describe('company permissions', () => {
    it('lets a placement officer manage companies', async () => {
      const officer = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.PLACEMENT_OFFICER,
        email: 'officer@example.edu',
        employeeId: 'EMP9001',
      });

      await request(app)
        .post(`${API}/companies`)
        .set(auth(officer.token))
        .send(companyPayload({ name: 'Officer Co' }))
        .expect(201);
    });

    it('does not let faculty create a company', async () => {
      const faculty = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.FACULTY,
        email: 'lecturer.placement@example.edu',
        employeeId: 'EMP9002',
      });

      await request(app)
        .post(`${API}/companies`)
        .set(auth(faculty.token))
        .send(companyPayload({ name: 'Faculty Co' }))
        .expect(403);
    });

    /** Verifying is a distinct authority from editing. */
    it('does not let a placement officer verify a company', async () => {
      const id = await createCompany();

      const officer = await createStaffUser(app, tenant, {
        roleKey: ROLE_KEYS.PLACEMENT_OFFICER,
        email: 'officer2@example.edu',
        employeeId: 'EMP9003',
      });

      await request(app)
        .post(`${API}/companies/${id}/verify`)
        .set(auth(officer.token))
        .send({ isVerified: true })
        .expect(403);
    });

    /**
     * A student may see which companies visit campus, but recruiter names,
     * direct dials and personal addresses are what get harvested and spammed.
     * The recruiter gave those to the placement office, not to the cohort.
     */
    it('strips recruiter contact details for a student', async () => {
      const companyId = await createCompany();
      await createStudent();
      const token = await studentLogin('meera.iyer@example.edu');

      const list = await request(app).get(`${API}/companies`).set(auth(token)).expect(200);

      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].name).toBe('Acme Technologies');
      expect(list.body.data[0].contacts).toEqual([]);
      expect(list.body.data[0].email).toBeNull();
      expect(list.body.data[0].phone).toBeNull();

      const detail = await request(app)
        .get(`${API}/companies/${companyId}`)
        .set(auth(token))
        .expect(200);

      expect(detail.body.data.contacts).toEqual([]);
    });

    it('shows recruiter contact details to someone who manages companies', async () => {
      const companyId = await createCompany();

      const response = await request(app)
        .get(`${API}/companies/${companyId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.contacts).toHaveLength(1);
      expect(response.body.data.contacts[0].email).toBe('priya.menon@acme.example.com');
      expect(response.body.data.email).toBe('careers@acme.example.com');
    });

    it('does not let a student create or blacklist a company', async () => {
      const companyId = await createCompany();
      await createStudent();
      const token = await studentLogin('meera.iyer@example.edu');

      await request(app)
        .post(`${API}/companies`)
        .set(auth(token))
        .send(companyPayload({ name: 'Student Co' }))
        .expect(403);

      await request(app)
        .post(`${API}/companies/${companyId}/blacklist`)
        .set(auth(token))
        .send({ reason: 'Attempting an unauthorised blacklist' })
        .expect(403);
    });
  });

  /* ---------------------------- tenant isolation ----------------------------- */

  describe('tenant isolation', () => {
    it('reports another college company as missing rather than forbidden', async () => {
      const companyId = await createCompany();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      // 404, not 403: a 403 would confirm the company exists.
      await request(app)
        .get(`${API}/companies/${companyId}`)
        .set(auth(other.token))
        .expect(404);

      await request(app)
        .patch(`${API}/companies/${companyId}`)
        .set(auth(other.token))
        .send({ industry: 'Hijacked' })
        .expect(404);

      await request(app)
        .post(`${API}/companies/${companyId}/blacklist`)
        .set(auth(other.token))
        .send({ reason: 'Attempting a cross-tenant blacklist' })
        .expect(404);
    });

    it('keeps company lists scoped to the caller college', async () => {
      await createCompany();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      const response = await request(app)
        .get(`${API}/companies`)
        .set(auth(other.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('allows the same company name in two different colleges', async () => {
      await createCompany();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      await request(app)
        .post(`${API}/companies`)
        .set(auth(other.token))
        .send(companyPayload())
        .expect(201);
    });

    it('reports another college job posting as missing', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      await request(app).get(`${API}/jobs/${jobId}`).set(auth(other.token)).expect(404);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(other.token))
        .send({ to: 'published' })
        .expect(404);
    });

    it('refuses a job posting against another college company', async () => {
      const companyId = await createCompany();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      // The company is invisible to the other tenant, so it reads as unknown.
      await request(app)
        .post(`${API}/jobs`)
        .set(auth(other.token))
        .send(jobPayload(companyId))
        .expect(400);
    });
  });

  /* ------------------------------- job postings ------------------------------ */

  describe('job postings', () => {
    it('creates a posting as a draft', async () => {
      const companyId = await createCompany();

      const response = await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(jobPayload(companyId))
        .expect(201);

      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.openings).toBe(10);
      expect(response.body.data.selectionRounds).toHaveLength(2);
    });

    it('refuses a posting whose CTC maximum is below its minimum', async () => {
      const companyId = await createCompany();

      await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(
          jobPayload(companyId, {
            compensation: { currency: 'INR', ctcMin: 1800000, ctcMax: 1200000 },
          }),
        )
        .expect(400);
    });

    it('refuses a posting whose window closes before it opens', async () => {
      const companyId = await createCompany();

      await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(
          jobPayload(companyId, {
            applicationOpenAt: daysFromNow(14),
            applicationCloseAt: daysFromNow(1),
          }),
        )
        .expect(400);
    });

    it('refuses rounds numbered with a gap', async () => {
      const companyId = await createCompany();

      await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(
          jobPayload(companyId, {
            selectionRounds: [
              { order: 1, name: 'Test', type: 'aptitude', mode: 'online' },
              { order: 3, name: 'Interview', type: 'hr_interview', mode: 'online' },
            ],
          }),
        )
        .expect(400);
    });

    /** A blacklisted company must not run a new drive. */
    it('refuses a posting for a blacklisted company', async () => {
      const companyId = await createCompany();

      await request(app)
        .post(`${API}/companies/${companyId}/blacklist`)
        .set(auth(tenant.token))
        .send({ reason: 'Withdrew offers after the drive' })
        .expect(200);

      const response = await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(jobPayload(companyId))
        .expect(422);

      expect(response.body.error.message).toMatch(/blacklisted/i);
    });

    it('refuses an unknown department in the eligibility block', async () => {
      const companyId = await createCompany();

      await request(app)
        .post(`${API}/jobs`)
        .set(auth(tenant.token))
        .send(
          jobPayload(companyId, {
            eligibility: {
              ...jobPayload(companyId).eligibility,
              departmentIds: ['507f1f77bcf86cd799439011'],
            },
          }),
        )
        .expect(400);
    });
  });

  /* --------------------------------- lifecycle ------------------------------- */

  describe('job lifecycle', () => {
    it('publishes a draft and counts the eligible cohort', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);
      await createStudent();

      const response = await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      expect(response.body.data.status).toBe('published');
      expect(response.body.data.publishedAt).not.toBeNull();
      expect(response.body.data.stats.eligibleCount).toBe(1);
    });

    /** Publishing to nobody is a mistake, not a drive. */
    it('refuses to publish when nobody is eligible', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 9.9 },
      });

      await createStudent({}, { currentCgpa: 6 });

      const response = await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(422);

      expect(response.body.error.message).toMatch(/no student meets this eligibility/i);
    });

    it('refuses to publish a posting whose window has already closed', async () => {
      const companyId = await createCompany();
      await createStudent();

      const jobId = await createJob(companyId, {
        applicationOpenAt: daysFromNow(-30),
        applicationCloseAt: daysFromNow(-1),
      });

      const response = await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(422);

      expect(response.body.error.message).toMatch(/already closed/i);
    });

    it('rejects a transition the state machine does not allow', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);

      // draft cannot jump straight to completed.
      const response = await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'completed' })
        .expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('treats completed as terminal', async () => {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      for (const to of ['published', 'closed', 'completed']) {
        await request(app)
          .post(`${API}/jobs/${jobId}/transition`)
          .set(auth(tenant.token))
          .send({ to })
          .expect(200);
      }

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(409);
    });

    it('closes expired postings and stops accepting applications', async () => {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      // Back-dated so the window has passed.
      await JobPostingModel.updateOne(
        { _id: jobId },
        { $set: { applicationCloseAt: new Date(Date.now() - 1000) } },
      ).exec();

      const response = await request(app)
        .post(`${API}/jobs/close-expired`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.closed).toBe(1);

      const profile = await request(app)
        .get(`${API}/jobs/${jobId}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(profile.body.data.job.status).toBe('closed');
      expect(profile.body.data.window.isOpen).toBe(false);
    });

    it('refuses to delete a published posting', async () => {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      await request(app).delete(`${API}/jobs/${jobId}`).set(auth(tenant.token)).expect(422);
    });
  });

  /* -------------------------------- eligibility ------------------------------ */

  describe('eligibility over real data', () => {
    it('filters the eligible list by CGPA', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 7 },
      });

      await createStudent({ rollNumber: 'CS22B001', email: 'high@example.edu' }, { currentCgpa: 8.5 });
      await createStudent({ rollNumber: 'CS22B002', email: 'low@example.edu' }, { currentCgpa: 6.2 });

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].rollNumber).toBe('CS22B001');
    });

    it('filters by active backlogs', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, maxActiveBacklogs: 0 },
      });

      await createStudent({ rollNumber: 'CS22B001', email: 'clear@example.edu' }, { activeBacklogs: 0 });
      await createStudent({ rollNumber: 'CS22B002', email: 'backlog@example.edu' }, { activeBacklogs: 2 });

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].rollNumber).toBe('CS22B001');
    });

    it('filters by department', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: {
          ...jobPayload(companyId).eligibility,
          departmentIds: [tenant.departmentId],
        },
      });

      await createStudent();

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('filters by batch', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, batchIds: [tenant.batchId] },
      });

      await createStudent();

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    /** The server explains why, so a student knows what to fix. */
    it('returns structured rejection reasons for a named student', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: {
          ...jobPayload(companyId).eligibility,
          minCgpa: 7,
          maxActiveBacklogs: 0,
        },
      });

      const studentId = await createStudent({}, { currentCgpa: 6, activeBacklogs: 2 });

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligibility/${studentId}`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.eligible).toBe(false);
      expect(response.body.data.reasons).toEqual([
        { rule: 'minimum_cgpa', message: 'Minimum CGPA required is 7. Yours is 6.' },
        { rule: 'active_backlogs', message: 'No active backlogs are allowed. You have 2.' },
      ]);
    });

    it('excludes an already placed student unless the drive allows them', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);

      const studentId = await createStudent();
      await StudentModel.updateOne(
        { _id: studentId },
        { $set: { 'placement.isPlaced': true } },
      ).exec();

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('excludes a student the office has barred from placement', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);

      const studentId = await createStudent();
      await StudentModel.updateOne(
        { _id: studentId },
        { $set: { 'placement.isEligible': false, 'placement.eligibilityNote': 'Fees pending' } },
      ).exec();

      const response = await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    /** Terms fixed once students commit to them. */
    it('refuses an eligibility change after applications exist', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);

      await JobPostingModel.updateOne(
        { _id: jobId },
        { $set: { 'stats.applicationCount': 3 } },
      ).exec();

      const response = await request(app)
        .patch(`${API}/jobs/${jobId}`)
        .set(auth(tenant.token))
        .send({ eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 8 } })
        .expect(422);

      expect(response.body.error.message).toMatch(/already applied/i);
    });
  });

  /* ----------------------------- student self-service ------------------------ */

  describe('student self-service', () => {
    it('lists open drives with the caller own eligibility and reasons', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 9 },
      });

      await createStudent({}, { currentCgpa: 6.5 });

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(422);

      // Relaxed so the drive can be published, then tightened is impossible —
      // so publish an open drive and assert the student sees it.
      const openJobId = await createJob(companyId, { title: 'Open Role' });

      await request(app)
        .post(`${API}/jobs/${openJobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');

      const response = await request(app)
        .get(`${API}/jobs/me/openings`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].job.title).toBe('Open Role');
      expect(response.body.data[0].eligible).toBe(true);
    });

    it('returns the caller own eligibility with no student id in the URL', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 9 },
      });

      await createStudent({}, { currentCgpa: 6.5 });
      const token = await studentLogin('meera.iyer@example.edu');

      const response = await request(app)
        .get(`${API}/jobs/me/eligibility/${jobId}`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data.eligible).toBe(false);
      expect(response.body.data.reasons[0].rule).toBe('minimum_cgpa');
    });

    /** A student must not be able to ask about anyone else. */
    it('refuses a student the by-id eligibility endpoint', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);
      const studentId = await createStudent();

      const token = await studentLogin('meera.iyer@example.edu');

      await request(app)
        .get(`${API}/jobs/${jobId}/eligibility/${studentId}`)
        .set(auth(token))
        .expect(403);
    });

    it('refuses a student the eligible-students list', async () => {
      const companyId = await createCompany();
      const jobId = await createJob(companyId);
      await createStudent();

      const token = await studentLogin('meera.iyer@example.edu');

      await request(app)
        .get(`${API}/jobs/${jobId}/eligible-students`)
        .set(auth(token))
        .expect(403);
    });

    it('shows a student only published drives, not drafts', async () => {
      const companyId = await createCompany();
      await createJob(companyId, { title: 'Still A Draft' });
      await createStudent();

      const token = await studentLogin('meera.iyer@example.edu');

      const response = await request(app)
        .get(`${API}/jobs/me/openings`)
        .set(auth(token))
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  /* ---------------------------------- exports -------------------------------- */

  describe('exports', () => {
    it('exports companies as CSV with a row count header', async () => {
      await createCompany();

      const response = await request(app)
        .post(`${API}/companies/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.headers['x-row-count']).toBe('1');
      expect(response.text).toContain('Acme Technologies');
    });

    /**
     * A company named `=HYPERLINK(...)` would otherwise execute when the
     * export is opened in Excel.
     */
    it('neutralises a formula in a company export', async () => {
      await createCompany({ name: '=HYPERLINK("http://evil.example.com","Click")' });

      const response = await request(app)
        .post(`${API}/companies/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text).toContain("'=HYPERLINK");
      expect(response.text).not.toMatch(/(^|,)"?=HYPERLINK/);
    });

    it('neutralises a formula in a job export', async () => {
      const companyId = await createCompany();
      await createJob(companyId, { title: '+SUM(A1:A9)' });

      const response = await request(app)
        .post(`${API}/jobs/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text).toContain("'+SUM");
    });

    it('exports only the selected rows when ids are supplied', async () => {
      const first = await createCompany({ name: 'First Co' });
      await createCompany({ name: 'Second Co' });

      const response = await request(app)
        .post(`${API}/companies/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({ ids: [first] })
        .expect(200);

      expect(response.headers['x-row-count']).toBe('1');
      expect(response.text).toContain('First Co');
      expect(response.text).not.toContain('Second Co');
    });
  });

  /* --------------------------------- analytics ------------------------------- */

  describe('analytics', () => {
    it('summarises companies by status', async () => {
      await createCompany({ name: 'Active Co' });
      const blacklisted = await createCompany({ name: 'Bad Co' });

      await request(app)
        .post(`${API}/companies/${blacklisted}/blacklist`)
        .set(auth(tenant.token))
        .send({ reason: 'Withdrew offers after the drive' })
        .expect(200);

      const response = await request(app)
        .get(`${API}/companies/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(2);
      expect(response.body.data.active).toBe(1);
      expect(response.body.data.blacklisted).toBe(1);
      expect(response.body.data.industries).toContain('Information Technology');
    });

    it('summarises job postings and compensation', async () => {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const response = await request(app)
        .get(`${API}/jobs/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.open).toBe(1);
      expect(response.body.data.highestCtc).toBe(1800000);
      expect(response.body.data.totalOpenings).toBe(10);
    });
  });

  /* ------------------------------- applications ------------------------------ */

  describe('applications', () => {
    /** A published, open drive with one eligible student who can sign in. */
    async function openDrive(
      jobOverrides: Record<string, unknown> = {},
      academics: Record<string, unknown> = {},
    ): Promise<{ jobId: string; studentId: string; token: string }> {
      const companyId = await createCompany();
      const studentId = await createStudent({}, academics);
      const jobId = await createJob(companyId, jobOverrides);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');
      return { jobId, studentId, token };
    }

    async function apply(jobId: string, token: string, expected = 201) {
      return request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ coverLetter: 'I would like to be considered.', answers: [] })
        .expect(expected);
    }

    it('creates an application and freezes the academics behind it', async () => {
      const { jobId, token } = await openDrive({}, { currentCgpa: 8.4, activeBacklogs: 0 });

      const response = await apply(jobId, token);

      expect(response.body.data.status).toBe('applied');
      expect(response.body.data.currentRound).toBe(0);
      // Frozen so a later CGPA change cannot rewrite the basis for admission.
      expect(response.body.data.eligibilitySnapshot.cgpa).toBe(8.4);
      expect(response.body.data.history).toHaveLength(1);
      expect(response.body.data.history[0].to).toBe('applied');
      expect(response.body.data.history[0].actedByRole).toBe('student');
    });

    it('bumps the posting and company counters', async () => {
      const { jobId, token } = await openDrive();
      await apply(jobId, token);

      const profile = await request(app)
        .get(`${API}/jobs/${jobId}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(profile.body.data.counts.applications).toBe(1);
    });

    /** Duplicates put a student on a shortlist twice. */
    it('refuses a second application to the same role', async () => {
      const { jobId, token } = await openDrive();
      await apply(jobId, token);

      const response = await apply(jobId, token, 409);
      expect(response.body.error.message).toMatch(/already applied/i);
    });

    it('refuses an application from an ineligible student, with the reason', async () => {
      const companyId = await createCompany();
      await createStudent({}, { currentCgpa: 5.5 });

      // Published while eligibility was open, then tightened is impossible, so
      // a second student clears the bar and the first does not.
      const jobId = await createJob(companyId, {
        eligibility: { ...jobPayload(companyId).eligibility, minCgpa: 7 },
      });

      await createStudent(
        { rollNumber: 'CS22B002', email: 'eligible@example.edu' },
        { currentCgpa: 9 },
      );

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');
      const response = await apply(jobId, token, 422);

      expect(response.body.error.message).toMatch(/not eligible/i);
      expect(response.body.error.message).toMatch(/minimum cgpa required is 7/i);
    });

    it('refuses an application to a draft posting', async () => {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      const token = await studentLogin('meera.iyer@example.edu');
      const response = await apply(jobId, token, 422);

      expect(response.body.error.message).toMatch(/not open for applications/i);
    });

    it('refuses an application to a closed posting', async () => {
      const { jobId, token } = await openDrive();

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'closed' })
        .expect(200);

      const response = await apply(jobId, token, 422);
      expect(response.body.error.message).toMatch(/have closed/i);
    });

    it('refuses an application after the deadline has passed', async () => {
      const { jobId, token } = await openDrive();

      await JobPostingModel.updateOne(
        { _id: jobId },
        { $set: { applicationCloseAt: new Date(Date.now() - 1000) } },
      ).exec();

      const response = await apply(jobId, token, 422);
      expect(response.body.error.message).toMatch(/deadline .* has passed/i);
    });

    it('refuses an application before the window opens', async () => {
      const companyId = await createCompany();
      await createStudent();

      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      await JobPostingModel.updateOne(
        { _id: jobId },
        { $set: { applicationOpenAt: new Date(Date.now() + 86400000) } },
      ).exec();

      const token = await studentLogin('meera.iyer@example.edu');
      const response = await apply(jobId, token, 422);

      expect(response.body.error.message).toMatch(/applications open on/i);
    });
  });

  /* --------------------- application access and ownership -------------------- */

  describe('application ownership', () => {
    async function twoApplicants(): Promise<{
      jobId: string;
      first: { id: string; token: string; applicationId: string };
      second: { id: string; token: string; applicationId: string };
    }> {
      const companyId = await createCompany();
      const firstId = await createStudent();
      const secondId = await createStudent({
        rollNumber: 'CS22B002',
        email: 'second.student@example.edu',
      });

      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const firstToken = await studentLogin('meera.iyer@example.edu');
      const secondToken = await studentLogin('second.student@example.edu');

      const firstApp = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(firstToken))
        .send({ answers: [] })
        .expect(201);

      const secondApp = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(secondToken))
        .send({ answers: [] })
        .expect(201);

      return {
        jobId,
        first: { id: firstId, token: firstToken, applicationId: firstApp.body.data.id },
        second: { id: secondId, token: secondToken, applicationId: secondApp.body.data.id },
      };
    }

    it('returns only the caller own applications', async () => {
      const { first } = await twoApplicants();

      const response = await request(app)
        .get(`${API}/applications/me`)
        .set(auth(first.token))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(first.applicationId);
    });

    /** 404, not 403: a 403 would confirm the application exists. */
    it('refuses a student another student application', async () => {
      const { first, second } = await twoApplicants();

      await request(app)
        .get(`${API}/applications/me/${second.applicationId}`)
        .set(auth(first.token))
        .expect(404);

      await request(app)
        .get(`${API}/applications/${second.applicationId}`)
        .set(auth(first.token))
        .expect(404);
    });

    it('refuses a student withdrawing another student application', async () => {
      const { first, second } = await twoApplicants();

      await request(app)
        .post(`${API}/applications/me/${second.applicationId}/withdraw`)
        .set(auth(first.token))
        .send({ reason: 'Attempting to withdraw someone else' })
        .expect(404);

      // The other application is untouched.
      const untouched = await JobApplicationModel.findById(second.applicationId).exec();
      expect(untouched?.status).toBe('applied');
    });

    it('refuses a student the office application list', async () => {
      const { first } = await twoApplicants();

      await request(app).get(`${API}/applications`).set(auth(first.token)).expect(403);
    });

    it('refuses a student shortlisting or rejecting', async () => {
      const { first, second } = await twoApplicants();

      await request(app)
        .post(`${API}/applications/${second.applicationId}/shortlist`)
        .set(auth(first.token))
        .send({ roundOrder: 1 })
        .expect(403);

      await request(app)
        .post(`${API}/applications/${first.applicationId}/reject`)
        .set(auth(first.token))
        .send({ reason: 'Attempting a self-reject' })
        .expect(403);
    });

    it('lets the office see every application', async () => {
      await twoApplicants();

      const response = await request(app)
        .get(`${API}/applications`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('reports another college application as missing', async () => {
      const { first } = await twoApplicants();

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      await request(app)
        .get(`${API}/applications/${first.applicationId}`)
        .set(auth(other.token))
        .expect(404);
    });
  });

  /* --------------------------- application transitions ----------------------- */

  describe('application state transitions', () => {
    async function applied(): Promise<{ applicationId: string; token: string; jobId: string }> {
      const companyId = await createCompany();
      await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');

      const response = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ answers: [] })
        .expect(201);

      return { applicationId: response.body.data.id, token, jobId };
    }

    it('walks applied to selected through the office', async () => {
      const { applicationId } = await applied();

      for (const [path, body] of [
        ['shortlist', { roundOrder: 1 }],
        ['advance', { to: 'in_process', roundOrder: 2 }],
        ['select', {}],
      ] as Array<[string, Record<string, unknown>]>) {
        await request(app)
          .post(`${API}/applications/${applicationId}/${path}`)
          .set(auth(tenant.token))
          .send(body)
          .expect(200);
      }

      const application = await JobApplicationModel.findById(applicationId).exec();
      expect(application?.status).toBe('selected');
      expect(application?.selectedAt).not.toBeNull();
      // One entry per change, oldest first.
      expect(application?.history.map((entry) => entry.to)).toEqual([
        'applied',
        'shortlisted',
        'in_process',
        'selected',
      ]);
    });

    it('rejects a transition the state machine does not allow', async () => {
      const { applicationId } = await applied();

      // applied cannot jump straight to in_process.
      const response = await request(app)
        .post(`${API}/applications/${applicationId}/advance`)
        .set(auth(tenant.token))
        .send({ to: 'in_process' })
        .expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('treats rejected as terminal', async () => {
      const { applicationId } = await applied();

      await request(app)
        .post(`${API}/applications/${applicationId}/reject`)
        .set(auth(tenant.token))
        .send({ reason: 'Did not clear the aptitude round' })
        .expect(200);

      await request(app)
        .post(`${API}/applications/${applicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(409);
    });

    it('lets a student withdraw, and refuses a second withdrawal', async () => {
      const { applicationId, token } = await applied();

      const response = await request(app)
        .post(`${API}/applications/me/${applicationId}/withdraw`)
        .set(auth(token))
        .send({ reason: 'Accepted another offer' })
        .expect(200);

      expect(response.body.data.status).toBe('withdrawn');
      expect(response.body.data.withdrawalReason).toBe('Accepted another offer');

      await request(app)
        .post(`${API}/applications/me/${applicationId}/withdraw`)
        .set(auth(token))
        .send({ reason: 'Trying again for some reason' })
        .expect(422);
    });

    /** Once selected, the exit is declining the offer, not withdrawing. */
    it('refuses a withdrawal after selection and directs to declining', async () => {
      const { applicationId, token } = await applied();

      await request(app)
        .post(`${API}/applications/${applicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(200);

      await request(app)
        .post(`${API}/applications/${applicationId}/select`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      const response = await request(app)
        .post(`${API}/applications/me/${applicationId}/withdraw`)
        .set(auth(token))
        .send({ reason: 'Changed my mind about this' })
        .expect(422);

      expect(response.body.error.message).toMatch(/decline the offer/i);

      await request(app)
        .post(`${API}/applications/me/${applicationId}/decline-offer`)
        .set(auth(token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      const application = await JobApplicationModel.findById(applicationId).exec();
      expect(application?.status).toBe('offer_declined');
    });

    it('refuses declining when there is no offer', async () => {
      const { applicationId, token } = await applied();

      await request(app)
        .post(`${API}/applications/me/${applicationId}/decline-offer`)
        .set(auth(token))
        .send({ reason: 'There is nothing to decline' })
        .expect(422);
    });

    /** Withdrawing is the student's own act, not something staff impose. */
    it('refuses the office driving a withdrawal through advance', async () => {
      const { applicationId } = await applied();

      const response = await request(app)
        .post(`${API}/applications/${applicationId}/advance`)
        .set(auth(tenant.token))
        .send({ to: 'withdrawn', reason: 'Office attempting a withdrawal' })
        .expect(422);

      expect(response.body.error.message).toMatch(/student/i);
    });

    it('refuses more selections than there are openings', async () => {
      const companyId = await createCompany();
      const first = await createStudent();
      const second = await createStudent({
        rollNumber: 'CS22B002',
        email: 'second.student@example.edu',
      });

      const jobId = await createJob(companyId, { openings: 1 });

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const applicationIds: string[] = [];

      for (const email of ['meera.iyer@example.edu', 'second.student@example.edu']) {
        const token = await studentLogin(email);
        const response = await request(app)
          .post(`${API}/jobs/${jobId}/apply`)
          .set(auth(token))
          .send({ answers: [] })
          .expect(201);

        applicationIds.push(response.body.data.id);
      }

      expect(first).toBeTruthy();
      expect(second).toBeTruthy();

      for (const id of applicationIds) {
        await request(app)
          .post(`${API}/applications/${id}/shortlist`)
          .set(auth(tenant.token))
          .send({ roundOrder: 1 })
          .expect(200);
      }

      await request(app)
        .post(`${API}/applications/${applicationIds[0]}/select`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      const response = await request(app)
        .post(`${API}/applications/${applicationIds[1]}/select`)
        .set(auth(tenant.token))
        .send({})
        .expect(422);

      expect(response.body.error.message).toMatch(/already filled/i);
    });

    it('reports per-row outcomes on a bulk shortlist', async () => {
      const { applicationId } = await applied();

      // A rejected application cannot be shortlisted, so one row fails.
      const companyId = await createCompany({ name: 'Second Co' });
      const secondJob = await createJob(companyId, { title: 'Second Role' });
      expect(secondJob).toBeTruthy();

      await request(app)
        .post(`${API}/applications/${applicationId}/reject`)
        .set(auth(tenant.token))
        .send({ reason: 'Did not clear the first round' })
        .expect(200);

      const response = await request(app)
        .post(`${API}/applications/bulk/shortlist`)
        .set(auth(tenant.token))
        .send({ ids: [applicationId] })
        .expect(200);

      expect(response.body.data.successCount).toBe(0);
      expect(response.body.data.failureCount).toBe(1);
      expect(response.body.data.results[0].code).toBe('INVALID_STATE_TRANSITION');
    });

    it('keeps the posting counters in step as applications move', async () => {
      const { applicationId, jobId } = await applied();

      await request(app)
        .post(`${API}/applications/${applicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(200);

      const profile = await request(app)
        .get(`${API}/jobs/${jobId}/profile`)
        .set(auth(tenant.token))
        .expect(200);

      expect(profile.body.data.counts.shortlisted).toBe(1);
    });

    it('summarises applications for the office', async () => {
      const { applicationId } = await applied();

      await request(app)
        .post(`${API}/applications/${applicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(200);

      const response = await request(app)
        .get(`${API}/applications/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.shortlisted).toBe(1);
    });

    it('neutralises a formula in an application export', async () => {
      const companyId = await createCompany();
      await createStudent({ rollNumber: '=cmd|calc' });
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');

      await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ answers: [] })
        .expect(201);

      const response = await request(app)
        .post(`${API}/applications/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      // The model uppercases roll numbers, so the comparison is case-insensitive.
      expect(response.text).toMatch(/'=CMD\|CALC/i);
      // The raw formula must never start a cell.
      expect(response.text).not.toMatch(/(^|,)"=CMD/i);
    });
  });

  /* ---------------------------------- offers --------------------------------- */

  describe('offers', () => {
    /** A selected application, ready for an offer to be recorded against it. */
    async function selectedApplication(): Promise<{
      applicationId: string;
      studentId: string;
      jobId: string;
      companyId: string;
      token: string;
    }> {
      const companyId = await createCompany();
      const studentId = await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');

      const application = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ answers: [] })
        .expect(201);

      const applicationId = application.body.data.id as string;

      await request(app)
        .post(`${API}/applications/${applicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(200);

      await request(app)
        .post(`${API}/applications/${applicationId}/select`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      return { applicationId, studentId, jobId, companyId, token };
    }

    const offerPayload = (
      ids: { applicationId: string; studentId: string; jobId: string; companyId: string },
      overrides: Record<string, unknown> = {},
    ) => ({
      studentId: ids.studentId,
      applicationId: ids.applicationId,
      jobPostingId: ids.jobId,
      companyId: ids.companyId,
      offerDate: new Date().toISOString(),
      joiningDate: daysFromNow(90),
      designation: 'Software Engineer I',
      location: 'Bengaluru',
      jobType: 'full_time',
      package: { currency: 'INR', ctc: 1500000, fixed: 1300000, variable: 200000 },
      isPrimaryOffer: true,
      academicYear: '2025-2026',
      ...overrides,
    });

    async function createOffer(
      ids: { applicationId: string; studentId: string; jobId: string; companyId: string },
      overrides: Record<string, unknown> = {},
    ): Promise<string> {
      const response = await request(app)
        .post(`${API}/placements`)
        .set(auth(tenant.token))
        .send(offerPayload(ids, overrides))
        .expect(201);

      return response.body.data.id as string;
    }

    it('records an offer against a selected application', async () => {
      const ids = await selectedApplication();

      const response = await request(app)
        .post(`${API}/placements`)
        .set(auth(tenant.token))
        .send(offerPayload(ids))
        .expect(201);

      expect(response.body.data.status).toBe('offered');
      expect(response.body.data.designation).toBe('Software Engineer I');
      expect(response.body.data.package.ctc).toBe(1500000);
      expect(response.body.data.isPrimaryOffer).toBe(true);
      // Denormalised from the application so reports group without a join.
      expect(response.body.data.departmentId).toBe(tenant.departmentId);
      expect(response.body.data.batchId).toBe(tenant.batchId);
    });

    it('marks the student placed and records the package', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      const student = await StudentModel.findById(ids.studentId).exec();
      expect(student?.placement.isPlaced).toBe(true);
      expect(student?.placement.placementCount).toBe(1);
      expect(student?.placement.highestPackage).toBe(1500000);
    });

    /** An offer only exists because someone was selected. */
    it('refuses an offer for an application that is not selected', async () => {
      const companyId = await createCompany();
      const studentId = await createStudent();
      const jobId = await createJob(companyId);

      await request(app)
        .post(`${API}/jobs/${jobId}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const token = await studentLogin('meera.iyer@example.edu');

      const application = await request(app)
        .post(`${API}/jobs/${jobId}/apply`)
        .set(auth(token))
        .send({ answers: [] })
        .expect(201);

      const response = await request(app)
        .post(`${API}/placements`)
        .set(auth(tenant.token))
        .send(
          offerPayload({
            applicationId: application.body.data.id,
            studentId,
            jobId,
            companyId,
          }),
        )
        .expect(422);

      expect(response.body.error.message).toMatch(/only be recorded for a selected application/i);
    });

    it('refuses a duplicate offer for the same application', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      const response = await request(app)
        .post(`${API}/placements`)
        .set(auth(tenant.token))
        .send(offerPayload(ids))
        .expect(409);

      expect(response.body.error.message).toMatch(/already been recorded/i);
    });

    /** The unique index is the real guard, not the service-level check. */
    it('enforces the duplicate guard at the database', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      const placement = await PlacementModel.findOne({ applicationId: ids.applicationId }).exec();

      await expect(
        PlacementModel.create({
          collegeId: placement!.collegeId,
          studentId: placement!.studentId,
          applicationId: placement!.applicationId,
          jobPostingId: placement!.jobPostingId,
          companyId: placement!.companyId,
          departmentId: placement!.departmentId,
          batchId: placement!.batchId,
          offerDate: new Date(),
          designation: 'Bypassing the service',
          location: 'Bengaluru',
          jobType: 'full_time',
          package: { ctc: 100 },
          academicYear: '2025-2026',
        }),
      ).rejects.toThrow();
    });

    it('refuses ids that do not describe one coherent record', async () => {
      const ids = await selectedApplication();

      const otherStudent = await createStudent({
        rollNumber: 'CS22B002',
        email: 'other.student@example.edu',
      });

      const response = await request(app)
        .post(`${API}/placements`)
        .set(auth(tenant.token))
        .send(offerPayload({ ...ids, studentId: otherStudent }))
        .expect(400);

      expect(response.body.error.message).toMatch(/belongs to a different student/i);
    });

    it('links the offer to the correct application, student, company and posting', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const placement = await PlacementModel.findById(offerId).exec();

      expect(String(placement?.applicationId)).toBe(ids.applicationId);
      expect(String(placement?.studentId)).toBe(ids.studentId);
      expect(String(placement?.jobPostingId)).toBe(ids.jobId);
      expect(String(placement?.companyId)).toBe(ids.companyId);
    });

    /* ------------------------------- ownership ------------------------------- */

    it('lets a student see their own offer with relations populated', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const list = await request(app)
        .get(`${API}/placements/me`)
        .set(auth(ids.token))
        .expect(200);

      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(offerId);
      // Populated for display: the student needs the company and role names.
      expect(list.body.data[0].companyId.name).toBe('Acme Technologies');
      expect(list.body.data[0].jobPostingId.title).toBe('Software Engineer');

      const detail = await request(app)
        .get(`${API}/placements/me/${offerId}`)
        .set(auth(ids.token))
        .expect(200);

      expect(detail.body.data.package.ctc).toBe(1500000);
      expect(detail.body.data.location).toBe('Bengaluru');
    });

    /** 404, not 403: a 403 would confirm the offer exists. */
    it('refuses a student another student offer', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await createStudent({ rollNumber: 'CS22B002', email: 'other.student@example.edu' });
      const otherToken = await studentLogin('other.student@example.edu');

      await request(app)
        .get(`${API}/placements/me/${offerId}`)
        .set(auth(otherToken))
        .expect(404);

      await request(app)
        .get(`${API}/placements/${offerId}`)
        .set(auth(otherToken))
        .expect(404);

      await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(otherToken))
        .expect(404);

      const untouched = await PlacementModel.findById(offerId).exec();
      expect(untouched?.status).toBe('offered');
    });

    it('refuses a student the office offer list', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      await request(app).get(`${API}/placements`).set(auth(ids.token)).expect(403);
    });

    it('refuses an unauthenticated request', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app).get(`${API}/placements/me`).expect(401);
      await request(app).get(`${API}/placements/${offerId}`).expect(401);
    });

    it('reports another college offer as missing', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const other = await createTenant(app, {
        code: 'NIT',
        adminEmail: 'admin.nit@example.edu',
      });

      await request(app)
        .get(`${API}/placements/${offerId}`)
        .set(auth(other.token))
        .expect(404);

      await request(app)
        .post(`${API}/placements/${offerId}/revoke`)
        .set(auth(other.token))
        .send({ reason: 'Attempting a cross-tenant revoke' })
        .expect(404);
    });

    it('rejects a malformed id rather than treating it as a lookup', async () => {
      await request(app)
        .get(`${API}/placements/not-an-object-id`)
        .set(auth(tenant.token))
        .expect(400);
    });

    /* ------------------------------ transitions ------------------------------ */

    it('lets a student accept their own offer', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const response = await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(ids.token))
        .expect(200);

      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.respondedAt).not.toBeNull();
      expect(response.body.data.history.map((entry: { to: string }) => entry.to)).toEqual([
        'accepted',
      ]);
    });

    it('lets a student decline their own offer', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const response = await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(ids.token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      expect(response.body.data.status).toBe('declined');
      expect(response.body.data.declineReason).toBe('Accepted a different offer');
    });

    /**
     * A declined offer is also a declined application, so a placement report
     * never shows the two contradicting each other.
     */
    it('marks the application offer_declined when the offer is declined', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(ids.token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      const application = await JobApplicationModel.findById(ids.applicationId).exec();
      expect(application?.status).toBe('offer_declined');
    });

    it('clears the placed flag when the only primary offer is declined', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      let student = await StudentModel.findById(ids.studentId).exec();
      expect(student?.placement.isPlaced).toBe(true);

      await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(ids.token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      student = await StudentModel.findById(ids.studentId).exec();
      expect(student?.placement.isPlaced).toBe(false);
      // The best offer they ever held is a fact a decline does not unmake.
      expect(student?.placement.highestPackage).toBe(1500000);
    });

    it('refuses accepting an offer that was already declined', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(ids.token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      const response = await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(ids.token))
        .expect(409);

      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses declining an offer that was already accepted', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(ids.token))
        .expect(200);

      await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(ids.token))
        .send({ reason: 'Changed my mind entirely' })
        .expect(409);
    });

    /** Answering belongs to the student, whatever the office holds. */
    it('refuses the office accepting or declining on the student behalf', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      // The office holds placement:update but not placement:respond.
      await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(tenant.token))
        .expect(403);

      await request(app)
        .post(`${API}/placements/me/${offerId}/decline`)
        .set(auth(tenant.token))
        .send({ reason: 'Office attempting to decline' })
        .expect(403);

      const untouched = await PlacementModel.findById(offerId).exec();
      expect(untouched?.status).toBe('offered');
    });

    it('refuses a status change through an ordinary edit', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const response = await request(app)
        .patch(`${API}/placements/${offerId}`)
        .set(auth(tenant.token))
        .send({ status: 'accepted' })
        .expect(422);

      expect(response.body.error.message).toMatch(/rather than editing the status/i);
    });

    it('lets the office revoke an offer, and treats it as terminal', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      const response = await request(app)
        .post(`${API}/placements/${offerId}/revoke`)
        .set(auth(tenant.token))
        .send({ reason: 'The company withdrew the role' })
        .expect(200);

      expect(response.body.data.status).toBe('offer_revoked');
      expect(response.body.data.revokeReason).toBe('The company withdrew the role');

      await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(ids.token))
        .expect(409);
    });

    it('records joining after acceptance', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/placements/me/${offerId}/accept`)
        .set(auth(ids.token))
        .expect(200);

      const response = await request(app)
        .post(`${API}/placements/${offerId}/joined`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.body.data.status).toBe('joined');
      expect(response.body.data.joinedAt).not.toBeNull();
    });

    it('refuses joining before the offer was accepted', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/placements/${offerId}/joined`)
        .set(auth(tenant.token))
        .send({})
        .expect(409);
    });

    /**
     * The application decline endpoint predates the offer record. Where an
     * offer exists, both must end up saying the same thing.
     */
    it('declines a linked offer when the application is declined', async () => {
      const ids = await selectedApplication();
      const offerId = await createOffer(ids);

      await request(app)
        .post(`${API}/applications/me/${ids.applicationId}/decline-offer`)
        .set(auth(ids.token))
        .send({ reason: 'Accepted a different offer' })
        .expect(200);

      const placement = await PlacementModel.findById(offerId).exec();
      expect(placement?.status).toBe('declined');

      const student = await StudentModel.findById(ids.studentId).exec();
      expect(student?.placement.isPlaced).toBe(false);
    });

    it('keeps a selected application protected from withdrawal', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      const response = await request(app)
        .post(`${API}/applications/me/${ids.applicationId}/withdraw`)
        .set(auth(ids.token))
        .send({ reason: 'Trying to withdraw after selection' })
        .expect(422);

      expect(response.body.error.message).toMatch(/decline the offer/i);
    });

    /* ------------------------------- primacy -------------------------------- */

    it('demotes the previous primary offer when a new one is made primary', async () => {
      const first = await selectedApplication();
      const firstOffer = await createOffer(first);

      // A second drive for the same student. It must admit placed students —
      // the first offer marked them placed, and the default eligibility
      // excludes those, which is exactly how a "dream offer" drive is set up.
      const secondCompany = await createCompany({ name: 'Second Co' });
      const secondJob = await createJob(secondCompany, {
        title: 'Second Role',
        eligibility: {
          ...jobPayload(secondCompany).eligibility,
          allowPlacedStudents: true,
        },
      });

      await request(app)
        .post(`${API}/jobs/${secondJob}/transition`)
        .set(auth(tenant.token))
        .send({ to: 'published' })
        .expect(200);

      const secondApplication = await request(app)
        .post(`${API}/jobs/${secondJob}/apply`)
        .set(auth(first.token))
        .send({ answers: [] })
        .expect(201);

      const secondApplicationId = secondApplication.body.data.id as string;

      await request(app)
        .post(`${API}/applications/${secondApplicationId}/shortlist`)
        .set(auth(tenant.token))
        .send({ roundOrder: 1 })
        .expect(200);

      await request(app)
        .post(`${API}/applications/${secondApplicationId}/select`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      const secondOffer = await createOffer(
        {
          applicationId: secondApplicationId,
          studentId: first.studentId,
          jobId: secondJob,
          companyId: secondCompany,
        },
        { designation: 'Second Role Engineer', package: { currency: 'INR', ctc: 2000000 } },
      );

      const [before, after] = await Promise.all([
        PlacementModel.findById(firstOffer).exec(),
        PlacementModel.findById(secondOffer).exec(),
      ]);

      // Only one primary per student per year, so the first was demoted.
      expect(before?.isPrimaryOffer).toBe(false);
      expect(after?.isPrimaryOffer).toBe(true);
    });

    /* ------------------------------- analytics ------------------------------- */

    it('summarises offers, placement rate and package figures', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      const response = await request(app)
        .get(`${API}/placements/analytics`)
        .set(auth(tenant.token))
        .expect(200);

      expect(response.body.data.totalOffers).toBe(1);
      expect(response.body.data.offered).toBe(1);
      expect(response.body.data.placedStudents).toBe(1);
      expect(response.body.data.highestCtc).toBe(1500000);
      expect(response.body.data.averageCtc).toBe(1500000);
      expect(response.body.data.medianCtc).toBe(1500000);
      expect(response.body.data.byDepartment).toHaveLength(1);
      expect(response.body.data.topRecruiters[0].offers).toBe(1);
    });

    it('refuses analytics to a caller without the report permission', async () => {
      const ids = await selectedApplication();
      await createOffer(ids);

      await request(app)
        .get(`${API}/placements/analytics`)
        .set(auth(ids.token))
        .expect(403);
    });

    it('neutralises a formula in a placement export', async () => {
      const ids = await selectedApplication();
      await createOffer(ids, { designation: '=HYPERLINK("http://evil.example.com")' });

      const response = await request(app)
        .post(`${API}/placements/bulk/export?format=csv`)
        .set(auth(tenant.token))
        .send({})
        .expect(200);

      expect(response.text).toContain("'=HYPERLINK");
      expect(response.text).not.toMatch(/(^|,)"=HYPERLINK/);
      expect(response.headers['x-row-count']).toBe('1');
    });
  });
});
