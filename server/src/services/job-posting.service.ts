import type {
  BulkOperationResult,
  CreateJobPostingInput,
  EligibilityResult,
  JobStatus,
  UpdateJobPostingInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { CompanyService } from './company.service';
import type { EligibilityService } from './eligibility.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { requestContext } from '@/config/request-context';
import { BusinessRuleError, InvalidStateTransitionError, NotFoundError, ValidationError } from '@/errors';
import type { JobPostingDocument } from '@/models/job-posting.model';
import type { StudentDocument } from '@/models/student.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { CompanyRepository, JobPostingRepository } from '@/repositories/placement.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import { toPlain } from '@/utils/mongo';

/**
 * The posting lifecycle, enforced server-side.
 *
 * draft → published   visible to students, applications open in their window
 * published → closed  applications stop; the drive continues
 * closed → completed  offers are out and the drive is finished
 *
 * `cancelled` is reachable from anywhere except a completed drive, because a
 * company can withdraw a role at any point. `completed` is terminal.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['closed', 'cancelled', 'draft'],
  closed: ['completed', 'published', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class JobPostingService {
  constructor(
    private readonly jobRepository: JobPostingRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly studentRepository: StudentRepository,
    private readonly companyService: CompanyService,
    private readonly eligibilityService: EligibilityService,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async list(options: ListOptions): Promise<PaginatedResult<JobPostingDocument>> {
    return this.jobRepository.paginate({
      ...options,
      include: options.include ?? 'companyId',
    });
  }

  async get(id: string): Promise<JobPostingDocument> {
    return this.jobRepository.findByIdOrFail(id, { include: 'companyId' });
  }

  /** Detail view: the posting, its company, and how the drive is going. */
  async getProfile(id: string) {
    const job = await this.get(id);
    const [company, eligibleCount] = await Promise.all([
      this.companyRepository.findById(job.companyId),
      this.eligibilityService.countEligible(job),
    ]);

    return {
      job,
      company,
      counts: {
        eligible: eligibleCount,
        applications: job.stats.applicationCount,
        shortlisted: job.stats.shortlistedCount,
        selected: job.stats.selectedCount,
        openings: job.openings,
      },
      window: {
        isOpen: this.isAcceptingApplications(job),
        opensAt: job.applicationOpenAt,
        closesAt: job.applicationCloseAt,
      },
      allowedTransitions: JOB_TRANSITIONS[job.status],
    };
  }

  async create(input: CreateJobPostingInput): Promise<JobPostingDocument> {
    const company = await this.companyService.assertCanRecruit(input.companyId);
    await this.assertEligibilityRelationsExist(input.eligibility);

    const job = await this.jobRepository.create({
      companyId: company._id,
      title: input.title,
      description: input.description,
      jobType: input.jobType,
      workMode: input.workMode,
      locations: input.locations,
      openings: input.openings,
      compensation: input.compensation,
      eligibility: {
        ...input.eligibility,
        departmentIds: input.eligibility.departmentIds.map(
          (id) => new mongoose.Types.ObjectId(id),
        ),
        batchIds: input.eligibility.batchIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
      selectionRounds: input.selectionRounds,
      applicationOpenAt: input.applicationOpenAt,
      applicationCloseAt: input.applicationCloseAt,
      driveDate: input.driveDate ?? null,
      attachments: input.attachments,
      // Always a draft: publishing is a separate, audited act that notifies
      // every eligible student.
      status: 'draft',
    } as unknown as Partial<JobPostingDocument>);

    await this.companyRepository.adjustStats(company._id, { jobCount: 1 });

    await this.auditService.log({
      action: 'job.created',
      category: 'data',
      entity: { type: 'JobPosting', id: job._id, label: job.title },
      metadata: { company: company.name, jobType: job.jobType, openings: job.openings },
    });

    return job;
  }

  async update(id: string, input: UpdateJobPostingInput): Promise<JobPostingDocument> {
    const existing = await this.jobRepository.findByIdOrFail(id);

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new BusinessRuleError(`A ${existing.status} posting can no longer be edited.`);
    }

    // Once students have applied, the terms they applied under are fixed.
    // Loosening or tightening eligibility mid-drive would silently re-rank a
    // set of people who already committed.
    if (input.eligibility && existing.stats.applicationCount > 0) {
      throw new BusinessRuleError(
        `${existing.stats.applicationCount} student(s) have already applied, so eligibility can no longer be changed.`,
      );
    }

    if (input.eligibility) await this.assertEligibilityRelationsExist(input.eligibility);

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('title', input.title);
    assign('description', input.description);
    assign('jobType', input.jobType);
    assign('workMode', input.workMode);
    assign('locations', input.locations);
    assign('openings', input.openings);
    assign('compensation', input.compensation);
    assign('selectionRounds', input.selectionRounds);
    assign('applicationOpenAt', input.applicationOpenAt);
    assign('applicationCloseAt', input.applicationCloseAt);
    assign('driveDate', input.driveDate);

    if (input.eligibility) {
      patch.eligibility = {
        ...input.eligibility,
        departmentIds: input.eligibility.departmentIds.map(
          (entry) => new mongoose.Types.ObjectId(entry),
        ),
        batchIds: input.eligibility.batchIds.map((entry) => new mongoose.Types.ObjectId(entry)),
      };
    }

    const openAt = input.applicationOpenAt ?? existing.applicationOpenAt;
    const closeAt = input.applicationCloseAt ?? existing.applicationCloseAt;

    if (closeAt <= openAt) {
      throw new ValidationError('Applications must close after they open.', [
        { field: 'applicationCloseAt', message: 'Must be after the opening date' },
      ]);
    }

    const updated = await this.jobRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'job.updated',
      category: 'data',
      entity: { type: 'JobPosting', id: updated._id, label: updated.title },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    // A window or date change after publication has to reach the candidates.
    if (existing.status === 'published' && (input.applicationCloseAt || input.driveDate)) {
      await this.notifyEligible(
        updated,
        'A drive you are eligible for has changed',
        `"${updated.title}" has updated dates. Check the new application deadline.`,
        'high',
      );
    }

    return updated;
  }

  /**
   * Moves a posting along its lifecycle.
   *
   * Publishing computes the eligible cohort and notifies exactly those
   * students — a drive nobody is eligible for is refused rather than published
   * to silence.
   */
  async transition(id: string, to: JobStatus, reason?: string): Promise<JobPostingDocument> {
    const job = await this.jobRepository.findByIdOrFail(id);
    const allowed = JOB_TRANSITIONS[job.status] ?? [];

    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(job.status, to, 'job posting');
    }

    const patch: Record<string, unknown> = { status: to };
    const userId = requestContext.get().userId;

    let eligibleCount = job.stats.eligibleCount;

    if (to === 'published') {
      await this.companyService.assertCanRecruit(job.companyId);

      if (job.applicationCloseAt <= new Date()) {
        throw new BusinessRuleError(
          'The application window has already closed. Move the closing date before publishing.',
        );
      }

      eligibleCount = await this.eligibilityService.countEligible(job);

      if (eligibleCount === 0) {
        throw new BusinessRuleError(
          'No student meets this eligibility. Relax the criteria before publishing.',
        );
      }

      patch.publishedAt = new Date();
      patch.publishedBy = userId ? new mongoose.Types.ObjectId(userId) : null;
      patch['stats.eligibleCount'] = eligibleCount;
      patch['stats.eligibilityComputedAt'] = new Date();
    }

    if (to === 'closed') {
      patch.closedAt = new Date();
      patch.closureReason = reason ?? null;
    }

    if (to === 'draft') {
      // Unpublishing withdraws it from students entirely.
      patch.publishedAt = null;
      patch.publishedBy = null;
    }

    const updated = await this.jobRepository.updateByIdOrFail(id, { $set: patch });

    // Only a published posting counts as an active drive for the company.
    const wasActive = job.status === 'published';
    const isActive = to === 'published';

    if (wasActive !== isActive) {
      await this.companyRepository.adjustStats(job.companyId, {
        activeJobCount: isActive ? 1 : -1,
      });
    }

    if (to === 'published' && job.driveDate) {
      await this.companyRepository.touchLastDrive(job.companyId, job.driveDate);
    }

    await this.auditService.log({
      action: `job.${to}`,
      category: 'admin',
      severity: to === 'cancelled' ? 'warning' : 'info',
      entity: { type: 'JobPosting', id: updated._id, label: updated.title },
      changes: [{ field: 'status', from: job.status, to }],
      metadata: { reason: reason ?? null, eligibleCount },
    });

    if (to === 'published') {
      await this.notifyEligible(
        updated,
        'A new opportunity is open to you',
        `"${updated.title}" is accepting applications until ${updated.applicationCloseAt.toDateString()}.`,
      );
    }

    if (to === 'cancelled') {
      await this.notifyEligible(
        updated,
        'A drive was cancelled',
        `"${updated.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
        'high',
      );
    }

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    const job = await this.jobRepository.findByIdOrFail(id);

    if (job.status !== 'draft') {
      throw new BusinessRuleError(
        'Only a draft posting can be deleted. Cancel it instead once it has been announced.',
      );
    }

    if (job.stats.applicationCount > 0) {
      throw new BusinessRuleError(
        `${job.stats.applicationCount} student(s) have applied, so this posting cannot be deleted.`,
      );
    }

    const deleted = await this.jobRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Job posting');

    await this.companyRepository.adjustStats(job.companyId, { jobCount: -1 });

    await this.auditService.log({
      action: 'job.deleted',
      category: 'data',
      severity: 'warning',
      entity: { type: 'JobPosting', id: job._id, label: job.title },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* ------------------------------- eligibility ------------------------------- */

  /** Every student this posting is open to, for the placement office. */
  async eligibleStudents(id: string): Promise<{
    job: JobPostingDocument;
    students: StudentDocument[];
  }> {
    const job = await this.jobRepository.findByIdOrFail(id);
    const { students } = await this.eligibilityService.eligibleStudents(job);

    await this.studentRepository.populateRelations(students);
    await this.jobRepository.setEligibleCount(job._id, students.length);

    return { job, students };
  }

  /**
   * Whether the signed-in student may apply.
   *
   * The student is read from the token, never from the request — this is the
   * same call the eventual apply endpoint must make, so the two cannot
   * disagree about who is eligible.
   */
  async checkOwnEligibility(id: string): Promise<EligibilityResult & { job: JobPostingDocument }> {
    const job = await this.jobRepository.findByIdOrFail(id);
    const student = await this.scopeGuard.requireOwnStudent();
    const result = await this.eligibilityService.check(student, job);

    return { ...result, job };
  }

  /**
   * Whether a named student may apply, for the placement office.
   *
   * Separate from the self-service check and gated by a different permission,
   * because this one names another person.
   */
  async checkStudentEligibility(id: string, studentId: string): Promise<EligibilityResult> {
    const job = await this.jobRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessStudent(studentId);

    const student = await this.studentRepository.findByIdOrFail(studentId);
    return this.eligibilityService.check(student, job);
  }

  /* --------------------------------- students -------------------------------- */

  /**
   * Open drives, each carrying the signed-in student's eligibility.
   *
   * Ineligible roles are returned with their reasons rather than hidden: a
   * student who cannot see a drive cannot work out what to fix.
   */
  async openPostingsForStudent(): Promise<
    Array<{ job: JobPostingDocument; eligibility: EligibilityResult }>
  > {
    const student = await this.scopeGuard.requireOwnStudent();
    const postings = await this.jobRepository.findOpenPostings();

    await this.jobRepository.populateRelations(postings);

    const snapshot = await this.eligibilityService.snapshotFor(student);

    return postings.map((job) => ({
      job,
      eligibility: this.eligibilityService.evaluateAgainst(snapshot, job),
    }));
  }

  /* -------------------------------- analytics -------------------------------- */

  async analytics() {
    const [byStatus, open, compensation] = await Promise.all([
      this.jobRepository.countByStatus(),
      this.jobRepository.countOpen(),
      this.jobRepository.compensationSummary(),
    ]);

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      open,
      published: byStatus.published ?? 0,
      draft: byStatus.draft ?? 0,
      closed: byStatus.closed ?? 0,
      byStatus,
      averageCtc: compensation.averageCtc,
      highestCtc: compensation.highestCtc,
      totalOpenings: compensation.totalOpenings,
    };
  }

  async export(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<JobPostingDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const jobs = await this.jobRepository.findMany(query, { sort: '-createdAt', limit: 5000 });
    await this.jobRepository.populateRelations(jobs);

    await this.auditService.log({
      action: 'job.exported',
      category: 'data',
      metadata: { rows: jobs.length },
    });

    return jobs;
  }

  async bulkDelete(ids: string[]): Promise<BulkOperationResult> {
    const results: Array<{
      index: number;
      success: boolean;
      id?: string;
      code?: string;
      message?: string;
    }> = [];

    let successCount = 0;

    for (const [index, id] of ids.entries()) {
      try {
        await this.remove(id);
        successCount += 1;
        results.push({ index, success: true, id });
      } catch (error) {
        results.push({
          index,
          success: false,
          id,
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Delete failed',
        });
      }
    }

    return {
      totalSubmitted: ids.length,
      successCount,
      failureCount: ids.length - successCount,
      results,
    };
  }

  /**
   * Closes every published posting whose window has passed.
   *
   * Exposed as a method rather than wired to a schedule: the project has no
   * job runner yet, and a posting that silently keeps accepting applications
   * past its deadline is worse than one closed by hand.
   */
  async closeExpired(): Promise<{ closed: number }> {
    const expired = await this.jobRepository.findExpired();

    for (const job of expired) {
      await this.jobRepository.updateById(job._id, {
        $set: {
          status: 'closed',
          closedAt: new Date(),
          closureReason: 'The application window closed.',
        },
      });

      await this.companyRepository.adjustStats(job.companyId, { activeJobCount: -1 });
    }

    if (expired.length > 0) {
      await this.auditService.log({
        action: 'job.auto_closed',
        category: 'system',
        metadata: { closed: expired.length },
      });
    }

    return { closed: expired.length };
  }

  /* -------------------------------- internals -------------------------------- */

  /** Whether the posting is inside its window right now. */
  isAcceptingApplications(job: JobPostingDocument, now = new Date()): boolean {
    return (
      job.status === 'published' &&
      job.applicationOpenAt <= now &&
      job.applicationCloseAt > now
    );
  }

  private async assertEligibilityRelationsExist(eligibility: {
    departmentIds: string[];
    batchIds: string[];
  }): Promise<void> {
    if (eligibility.departmentIds.length > 0) {
      const departments = await this.departmentRepository.findMany({
        _id: { $in: eligibility.departmentIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });

      if (departments.length !== eligibility.departmentIds.length) {
        throw new ValidationError('One or more departments could not be found.', [
          { field: 'eligibility.departmentIds', message: 'Unknown department' },
        ]);
      }
    }

    if (eligibility.batchIds.length > 0) {
      const batches = await this.batchRepository.findMany({
        _id: { $in: eligibility.batchIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });

      if (batches.length !== eligibility.batchIds.length) {
        throw new ValidationError('One or more batches could not be found.', [
          { field: 'eligibility.batchIds', message: 'Unknown batch' },
        ]);
      }
    }
  }

  /** Notifies exactly the students a posting is open to. */
  private async notifyEligible(
    job: JobPostingDocument,
    title: string,
    message: string,
    priority: 'normal' | 'high' = 'normal',
  ): Promise<void> {
    const { students } = await this.eligibilityService.eligibleStudents(job);
    if (students.length === 0) return;

    await this.notificationService.notifySafely({
      userIds: students.map((student) => student.userId),
      type: 'placement.job_published',
      category: 'placement',
      priority,
      title,
      message,
      actionUrl: `/student/jobs/${String(job._id)}`,
      entity: { type: 'JobPosting', id: job._id },
    });
  }
}
