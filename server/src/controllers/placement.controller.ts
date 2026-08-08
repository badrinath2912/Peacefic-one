import type { ApplicationStatus, JobStatus } from '@peacefic/shared';
import type { Request, Response } from 'express';

import { ValidationError } from '@/errors';
import type {
  CompanyRepository,
  JobApplicationRepository,
  JobPostingRepository,
  PlacementRepository,
} from '@/repositories/placement.repository';
import type { CompanyService } from '@/services/company.service';
import type { ExportService } from '@/services/export.service';
import type { JobApplicationService } from '@/services/job-application.service';
import type { JobPostingService } from '@/services/job-posting.service';
import type { PlacementService } from '@/services/placement.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/response';

function populatedValue(relation: unknown, field: string): string {
  if (!relation || typeof relation !== 'object') return '';
  return String((relation as Record<string, unknown>)[field] ?? '');
}

export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly companyRepository: CompanyRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.companyService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      filter: this.companyRepository.buildFilterFromQuery(query),
    });

    // Recruiter contact details are stripped for a caller who may not manage
    // companies — students hold `company:read` to see who visits campus.
    return sendPaginated(res, this.companyService.redactMany(result.items), result.pagination);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.get(req.params.id as string);
    return sendSuccess(res, this.companyService.redact(company));
  };

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.companyService.getProfile(req.params.id as string);

    return sendSuccess(res, {
      ...profile,
      company: this.companyService.redact(profile.company),
    });
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.create(req.body);
    return sendCreated(res, company);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.update(req.params.id as string, req.body);
    return sendSuccess(res, company);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.companyService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  verify = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.setVerification(req.params.id as string, req.body);
    return sendSuccess(res, company);
  };

  blacklist = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.blacklist(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, company);
  };

  reinstate = async (req: Request, res: Response): Promise<Response> => {
    const company = await this.companyService.reinstate(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, company);
  };

  uploadLogo = async (req: Request, res: Response): Promise<Response> => {
    const file = req.file;

    if (!file) {
      throw new ValidationError('No file was received.', [
        { field: 'file', message: 'Choose a logo to upload' },
      ]);
    }

    const company = await this.companyService.setLogo(req.params.id as string, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    return sendSuccess(res, company);
  };

  analytics = async (_req: Request, res: Response): Promise<Response> => {
    const analytics = await this.companyService.analytics();
    return sendSuccess(res, analytics);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.companyService.bulkDelete((req.body as { ids: string[] }).ids);
    return sendSuccess(res, result);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const companies = await this.companyService.export(
      this.companyRepository.buildFilterFromQuery(query) as Record<string, unknown>,
      { ids },
    );

    const result = await this.exportService.build(
      format,
      companies,
      [
        { key: 'name', header: 'Company', width: 30, value: (c) => c.name },
        { key: 'legalName', header: 'Legal Name', width: 30, value: (c) => c.legalName },
        { key: 'industry', header: 'Industry', width: 22, value: (c) => c.industry },
        { key: 'companyType', header: 'Type', value: (c) => c.companyType },
        { key: 'sizeRange', header: 'Size', value: (c) => c.sizeRange },
        { key: 'headquarters', header: 'Headquarters', width: 24, value: (c) => c.headquarters },
        { key: 'website', header: 'Website', width: 28, value: (c) => c.website },
        { key: 'email', header: 'Email', width: 26, value: (c) => c.email },
        { key: 'phone', header: 'Phone', value: (c) => c.phone },
        {
          key: 'primaryContact',
          header: 'Primary Contact',
          width: 24,
          value: (c) => c.contacts.find((contact) => contact.isPrimary)?.name ?? '',
        },
        {
          key: 'primaryContactEmail',
          header: 'Contact Email',
          width: 26,
          value: (c) => c.contacts.find((contact) => contact.isPrimary)?.email ?? '',
        },
        { key: 'isVerified', header: 'Verified', value: (c) => (c.isVerified ? 'Yes' : 'No') },
        { key: 'status', header: 'Status', value: (c) => c.status },
        { key: 'jobCount', header: 'Drives', value: (c) => c.stats.jobCount },
        { key: 'offerCount', header: 'Offers', value: (c) => c.stats.offerCount },
        { key: 'lastDriveAt', header: 'Last Drive', value: (c) => c.stats.lastDriveAt },
      ],
      'Companies',
    );

    const fileName = this.exportService.fileName('companies', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(companies.length));
    res.send(result.buffer);
  };
}

export class JobPostingController {
  constructor(
    private readonly jobService: JobPostingService,
    private readonly jobRepository: JobPostingRepository,
    private readonly exportService: ExportService,
  ) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.jobService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.jobRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const job = await this.jobService.get(req.params.id as string);
    return sendSuccess(res, job);
  };

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    const profile = await this.jobService.getProfile(req.params.id as string);
    return sendSuccess(res, profile);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const job = await this.jobService.create(req.body);
    return sendCreated(res, job);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const job = await this.jobService.update(req.params.id as string, req.body);
    return sendSuccess(res, job);
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.jobService.remove(req.params.id as string);
    return sendSuccess(res, result);
  };

  transition = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { to: JobStatus; reason?: string };
    const job = await this.jobService.transition(req.params.id as string, body.to, body.reason);
    return sendSuccess(res, job);
  };

  eligibleStudents = async (req: Request, res: Response): Promise<Response> => {
    const { students } = await this.jobService.eligibleStudents(req.params.id as string);

    return sendSuccess(
      res,
      students.map((student) => ({
        id: String(student._id),
        rollNumber: student.rollNumber,
        name: typeof student.userId === 'object' ? student.userId : null,
        departmentId: student.departmentId,
        batchId: student.batchId,
        cgpa: student.academics.currentCgpa,
        activeBacklogs: student.academics.activeBacklogs,
        isPlaced: student.placement.isPlaced,
      })),
    );
  };

  /** Named student — a different permission from the self-service check. */
  checkStudent = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.jobService.checkStudentEligibility(
      req.params.id as string,
      req.params.studentId as string,
    );
    return sendSuccess(res, result);
  };

  analytics = async (_req: Request, res: Response): Promise<Response> => {
    const analytics = await this.jobService.analytics();
    return sendSuccess(res, analytics);
  };

  bulkDelete = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.jobService.bulkDelete((req.body as { ids: string[] }).ids);
    return sendSuccess(res, result);
  };

  closeExpired = async (_req: Request, res: Response): Promise<Response> => {
    const result = await this.jobService.closeExpired();
    return sendSuccess(res, result);
  };

  /* ------------------------------- self-service ------------------------------ */
  // No student parameter: identity comes from the token.

  myOpenings = async (_req: Request, res: Response): Promise<Response> => {
    const rows = await this.jobService.openPostingsForStudent();

    return sendSuccess(
      res,
      rows.map(({ job, eligibility }) => ({
        job,
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
      })),
    );
  };

  myEligibility = async (req: Request, res: Response): Promise<Response> => {
    const { job: _job, ...result } = await this.jobService.checkOwnEligibility(
      req.params.id as string,
    );
    return sendSuccess(res, result);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const ids = (req.body as { ids?: string[] } | undefined)?.ids;
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const jobs = await this.jobService.export(
      this.jobRepository.buildFilterFromQuery(query) as Record<string, unknown>,
      { ids },
    );

    const result = await this.exportService.build(
      format,
      jobs,
      [
        { key: 'title', header: 'Role', width: 30, value: (j) => j.title },
        { key: 'company', header: 'Company', width: 26, value: (j) => populatedValue(j.companyId, 'name') },
        { key: 'jobType', header: 'Type', value: (j) => j.jobType },
        { key: 'workMode', header: 'Mode', value: (j) => j.workMode },
        { key: 'locations', header: 'Locations', width: 24, value: (j) => j.locations.join('; ') },
        { key: 'openings', header: 'Openings', value: (j) => j.openings },
        { key: 'ctcMin', header: 'CTC Min', value: (j) => j.compensation.ctcMin },
        { key: 'ctcMax', header: 'CTC Max', value: (j) => j.compensation.ctcMax },
        { key: 'minCgpa', header: 'Min CGPA', value: (j) => j.eligibility.minCgpa },
        {
          key: 'maxBacklogs',
          header: 'Max Active Backlogs',
          value: (j) => j.eligibility.maxActiveBacklogs,
        },
        { key: 'opensAt', header: 'Opens', value: (j) => j.applicationOpenAt },
        { key: 'closesAt', header: 'Closes', value: (j) => j.applicationCloseAt },
        { key: 'driveDate', header: 'Drive Date', value: (j) => j.driveDate },
        { key: 'status', header: 'Status', value: (j) => j.status },
        { key: 'eligible', header: 'Eligible', value: (j) => j.stats.eligibleCount },
        { key: 'applications', header: 'Applications', value: (j) => j.stats.applicationCount },
        { key: 'selected', header: 'Selected', value: (j) => j.stats.selectedCount },
      ],
      'Job Postings',
    );

    const fileName = this.exportService.fileName('job-postings', result.extension);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('X-Row-Count', String(jobs.length));
    res.send(result.buffer);
  };
}

export class JobApplicationController {
  constructor(
    private readonly applicationService: JobApplicationService,
    private readonly applicationRepository: JobApplicationRepository,
    private readonly exportService: ExportService,
  ) {}

  /* ------------------------------- self-service ------------------------------ */
  // No student parameter anywhere below: identity comes from the token.

  apply = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.apply(req.params.id as string, req.body);
    return sendCreated(res, application);
  };

  mine = async (_req: Request, res: Response): Promise<Response> => {
    const applications = await this.applicationService.myApplications();
    return sendSuccess(res, applications);
  };

  mineOne = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.myApplication(req.params.id as string);
    return sendSuccess(res, application);
  };

  withdraw = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.withdraw(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, application);
  };

  declineOffer = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.declineOffer(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, application);
  };

  /* ---------------------------------- office --------------------------------- */

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.applicationService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      include: query.include as string | undefined,
      filter: this.applicationRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.get(req.params.id as string);
    return sendSuccess(res, application);
  };

  shortlist = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.shortlist(req.params.id as string, req.body);
    return sendSuccess(res, application);
  };

  advance = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { to: ApplicationStatus; reason?: string; roundOrder?: number };

    const application = await this.applicationService.advance(req.params.id as string, body.to, {
      reason: body.reason,
      roundOrder: body.roundOrder,
    });

    return sendSuccess(res, application);
  };

  reject = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.reject(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, application);
  };

  select = async (req: Request, res: Response): Promise<Response> => {
    const application = await this.applicationService.select(
      req.params.id as string,
      (req.body as { reason?: string }).reason,
    );
    return sendSuccess(res, application);
  };

  bulkShortlist = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { ids: string[]; reason?: string };
    const result = await this.applicationService.bulkAdvance(body.ids, 'shortlisted', body.reason);
    return sendSuccess(res, result);
  };

  bulkReject = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { ids: string[]; reason?: string };
    const result = await this.applicationService.bulkAdvance(body.ids, 'rejected', body.reason);
    return sendSuccess(res, result);
  };

  analytics = async (req: Request, res: Response): Promise<Response> => {
    const filter = this.applicationRepository.buildFilterFromQuery(
      req.query as Record<string, unknown>,
    ) as Record<string, unknown>;

    const analytics = await this.applicationService.analytics(filter);
    return sendSuccess(res, analytics);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const result = await this.applicationService.list({
      limit: 5000,
      sort: '-appliedAt',
      include: 'studentId,jobPostingId,companyId',
      filter: this.applicationRepository.buildFilterFromQuery(query),
    });

    const file = await this.exportService.build(
      format,
      result.items,
      [
        {
          key: 'rollNumber',
          header: 'Roll Number',
          value: (a) => populatedValue(a.studentId, 'rollNumber'),
        },
        {
          key: 'student',
          header: 'Student',
          width: 24,
          value: (a) => {
            const student = a.studentId as unknown as { userId?: unknown };
            const user = student && typeof student === 'object' ? student.userId : null;
            if (!user || typeof user !== 'object') return '';
            const record = user as { firstName?: string; lastName?: string };
            return `${record.firstName ?? ''} ${record.lastName ?? ''}`.trim();
          },
        },
        {
          key: 'role',
          header: 'Role',
          width: 28,
          value: (a) => populatedValue(a.jobPostingId, 'title'),
        },
        {
          key: 'company',
          header: 'Company',
          width: 24,
          value: (a) => populatedValue(a.companyId, 'name'),
        },
        { key: 'status', header: 'Status', value: (a) => a.status },
        { key: 'round', header: 'Round', value: (a) => a.currentRound },
        { key: 'cgpa', header: 'CGPA at Apply', value: (a) => a.eligibilitySnapshot.cgpa },
        {
          key: 'backlogs',
          header: 'Backlogs at Apply',
          value: (a) => a.eligibilitySnapshot.activeBacklogs,
        },
        { key: 'appliedAt', header: 'Applied', value: (a) => a.appliedAt },
        { key: 'rejectionReason', header: 'Reason', width: 30, value: (a) => a.rejectionReason },
      ],
      'Applications',
    );

    const fileName = this.exportService.fileName('applications', file.extension);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('X-Row-Count', String(result.items.length));
    res.send(file.buffer);
  };
}

export class PlacementController {
  constructor(
    private readonly placementService: PlacementService,
    private readonly placementRepository: PlacementRepository,
    private readonly exportService: ExportService,
  ) {}

  /* ------------------------------- self-service ------------------------------ */
  // No student parameter anywhere below: identity comes from the token.

  mine = async (_req: Request, res: Response): Promise<Response> => {
    const offers = await this.placementService.myOffers();
    return sendSuccess(res, offers);
  };

  mineOne = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.myOffer(req.params.id as string);
    return sendSuccess(res, offer);
  };

  accept = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.accept(req.params.id as string);
    return sendSuccess(res, offer);
  };

  decline = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.decline(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, offer);
  };

  /* ---------------------------------- office --------------------------------- */

  list = async (req: Request, res: Response): Promise<Response> => {
    const query = req.query as Record<string, unknown>;

    const result = await this.placementService.list({
      page: query.page as number | undefined,
      limit: query.limit as number | undefined,
      sort: query.sort as string | undefined,
      search: query.search as string | undefined,
      include: query.include as string | undefined,
      filter: this.placementRepository.buildFilterFromQuery(query),
    });

    return sendPaginated(res, result.items, result.pagination);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.get(req.params.id as string);
    return sendSuccess(res, offer);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.create(req.body);
    return sendCreated(res, offer);
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.update(req.params.id as string, req.body);
    return sendSuccess(res, offer);
  };

  revoke = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.revoke(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, offer);
  };

  markJoined = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { joiningDate?: string };

    const offer = await this.placementService.markJoined(
      req.params.id as string,
      body.joiningDate ? new Date(body.joiningDate) : undefined,
    );

    return sendSuccess(res, offer);
  };

  markNotJoined = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.markNotJoined(
      req.params.id as string,
      (req.body as { reason: string }).reason,
    );
    return sendSuccess(res, offer);
  };

  verify = async (req: Request, res: Response): Promise<Response> => {
    const offer = await this.placementService.setVerification(
      req.params.id as string,
      (req.body as { isVerified: boolean }).isVerified,
    );
    return sendSuccess(res, offer);
  };

  analytics = async (req: Request, res: Response): Promise<Response> => {
    const filter = this.placementRepository.buildFilterFromQuery(
      req.query as Record<string, unknown>,
    ) as Record<string, unknown>;

    const analytics = await this.placementService.analytics(filter);
    return sendSuccess(res, analytics);
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, unknown> & { format?: 'csv' | 'xlsx' };
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const placements = await this.placementService.export(
      this.placementRepository.buildFilterFromQuery(query) as Record<string, unknown>,
    );

    const file = await this.exportService.build(
      format,
      placements,
      [
        {
          key: 'rollNumber',
          header: 'Roll Number',
          value: (p) => populatedValue(p.studentId, 'rollNumber'),
        },
        {
          key: 'student',
          header: 'Student',
          width: 24,
          value: (p) => {
            const student = p.studentId as unknown as { userId?: unknown };
            const user = student && typeof student === 'object' ? student.userId : null;
            if (!user || typeof user !== 'object') return '';
            const record = user as { firstName?: string; lastName?: string };
            return `${record.firstName ?? ''} ${record.lastName ?? ''}`.trim();
          },
        },
        {
          key: 'company',
          header: 'Company',
          width: 26,
          value: (p) => populatedValue(p.companyId, 'name'),
        },
        { key: 'designation', header: 'Designation', width: 26, value: (p) => p.designation },
        { key: 'jobType', header: 'Type', value: (p) => p.jobType },
        { key: 'location', header: 'Location', width: 20, value: (p) => p.location },
        { key: 'ctc', header: 'CTC', value: (p) => p.package.ctc },
        { key: 'currency', header: 'Currency', value: (p) => p.package.currency },
        { key: 'offerDate', header: 'Offer Date', value: (p) => p.offerDate },
        { key: 'joiningDate', header: 'Joining Date', value: (p) => p.joiningDate },
        { key: 'status', header: 'Status', value: (p) => p.status },
        { key: 'isPrimary', header: 'Primary', value: (p) => (p.isPrimaryOffer ? 'Yes' : 'No') },
        { key: 'academicYear', header: 'Academic Year', value: (p) => p.academicYear },
        { key: 'isVerified', header: 'Verified', value: (p) => (p.isVerified ? 'Yes' : 'No') },
      ],
      'Placements',
    );

    const fileName = this.exportService.fileName('placements', file.extension);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('X-Row-Count', String(placements.length));
    res.send(file.buffer);
  };
}
