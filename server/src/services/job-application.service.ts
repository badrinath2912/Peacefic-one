import {
  APPLICATION_TRANSITIONS,
  hasPermission,
  STUDENT_APPLICATION_TRANSITIONS,
  type AdvanceApplicationInput,
  type ApplicationStatus,
  type ApplyToJobInput,
  type BulkOperationResult,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { EligibilityService } from './eligibility.service';
import type { JobPostingService } from './job-posting.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
} from '@/errors';
import type { JobApplicationDocument } from '@/models/job-application.model';
import type { JobPostingDocument } from '@/models/job-posting.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type {
  CompanyRepository,
  JobApplicationRepository,
  JobPostingRepository,
  PlacementRepository,
} from '@/repositories/placement.repository';
import type { StudentRepository } from '@/repositories/student.repository';

/**
 * The application lifecycle.
 *
 * applied → under_review → shortlisted → in_process → selected
 *
 * `rejected`, `withdrawn` and `offer_declined` are terminal. A candidate can
 * be rejected from any live stage, because a company can stop at any point.
 */
// The map itself lives in `@peacefic/shared` so the client can offer only the
// moves this service would accept. Re-exported here because that is where the
// rest of the server has always imported it from.
export { APPLICATION_TRANSITIONS };

/** Transitions a student may drive on their own application. */
const STUDENT_TRANSITIONS = new Set<ApplicationStatus>(STUDENT_APPLICATION_TRANSITIONS);

/** Stages from which a student may still walk away. */
const WITHDRAWABLE = new Set<ApplicationStatus>([
  'applied',
  'under_review',
  'shortlisted',
  'in_process',
]);

export class JobApplicationService {
  constructor(
    private readonly applicationRepository: JobApplicationRepository,
    private readonly jobRepository: JobPostingRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly placementRepository: PlacementRepository,
    private readonly studentRepository: StudentRepository,
    private readonly jobPostingService: JobPostingService,
    private readonly eligibilityService: EligibilityService,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ------------------------------- self-service ------------------------------ */

  /**
   * Applies the signed-in student to a posting.
   *
   * Identity comes from the token, never the request. Eligibility is decided
   * here against the student's live record — a client that renders "eligible"
   * proves nothing, and the same engine call that showed them the button
   * decides whether the application is created.
   */
  async apply(jobId: string, input: ApplyToJobInput): Promise<JobApplicationDocument> {
    const student = await this.scopeGuard.requireOwnStudent();
    const job = await this.jobRepository.findByIdOrFail(jobId);

    // Window and status first: an ineligible student applying to a closed
    // drive should hear that it is closed.
    this.assertAcceptingApplications(job);

    const eligibility = await this.eligibilityService.check(student, job);

    if (!eligibility.eligible) {
      throw new BusinessRuleError(
        `You are not eligible for this role. ${eligibility.reasons.map((reason) => reason.message).join(' ')}`,
      );
    }

    const existing = await this.applicationRepository.findByJobAndStudent(job._id, student._id);

    if (existing) {
      throw new ConflictError(
        existing.status === 'withdrawn'
          ? 'You withdrew from this drive. Contact the placement office to reapply.'
          : 'You have already applied to this role.',
      );
    }

    const snapshot = await this.eligibilityService.snapshotFor(student);
    const userId = requestContext.get().userId;

    const application = await withTransaction(async (transaction) => {
      let created: JobApplicationDocument;

      try {
        created = await this.applicationRepository.create(
          {
            jobPostingId: job._id,
            companyId: job.companyId,
            studentId: student._id,
            departmentId: student.departmentId,
            batchId: student.batchId,
            status: 'applied',
            currentRound: 0,
            coverLetter: input.coverLetter ?? null,
            answers: input.answers,
            resumeUrl: student.resumeUrl,
            // Frozen: a later CGPA change must not rewrite the basis on which
            // this student was admitted to the drive.
            eligibilitySnapshot: {
              cgpa: snapshot.cgpa,
              activeBacklogs: snapshot.activeBacklogs,
              totalBacklogs: snapshot.totalBacklogs,
              attendancePercent: snapshot.attendancePercent,
              capturedAt: new Date(),
            },
            appliedAt: new Date(),
            history: [
              {
                from: null,
                to: 'applied',
                actedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
                actedByRole: 'student',
                at: new Date(),
                reason: null,
                roundOrder: null,
              },
            ],
          } as Partial<JobApplicationDocument>,
          transaction,
        );
      } catch (error) {
        // Two requests arriving together both pass the check above; the unique
        // index is what actually prevents the duplicate.
        if ((error as { code?: number }).code === 11000) {
          throw new ConflictError('You have already applied to this role.');
        }
        throw error;
      }

      await this.jobRepository.updateById(
        job._id,
        { $inc: { 'stats.applicationCount': 1 } },
        { session: transaction },
      );

      await this.companyRepository.adjustStats(
        job.companyId,
        { applicationCount: 1 },
        transaction,
      );

      return created;
    });

    await this.auditService.log({
      action: 'application.created',
      category: 'data',
      entity: { type: 'JobApplication', id: application._id, label: job.title },
      metadata: { jobPostingId: String(job._id), rollNumber: student.rollNumber },
    });

    return application;
  }

  /** The signed-in student's own applications, newest first. */
  async myApplications(): Promise<JobApplicationDocument[]> {
    const student = await this.scopeGuard.requireOwnStudent();
    const applications = await this.applicationRepository.findForStudent(student._id);

    await this.applicationRepository.populateRelations(applications);
    return applications;
  }

  /**
   * One of the signed-in student's applications.
   *
   * Ownership is checked against the token's student rather than trusting the
   * id in the URL, so a student cannot read a classmate's application by
   * guessing an id.
   */
  async myApplication(id: string): Promise<JobApplicationDocument> {
    const application = await this.requireOwnApplication(id);

    await this.applicationRepository.populateRelations([application]);
    return application;
  }

  /**
   * The caller's own application, unpopulated.
   *
   * Mutation paths use this rather than `myApplication`: a populated document
   * carries whole related records where the relation fields are typed as ids,
   * and passing one into a repository call casts as `_id` and fails.
   */
  private async requireOwnApplication(id: string): Promise<JobApplicationDocument> {
    const student = await this.scopeGuard.requireOwnStudent();
    const application = await this.applicationRepository.findByIdOrFail(id);

    if (String(application.studentId) !== String(student._id)) {
      // 404 rather than 403: a 403 would confirm the application exists.
      throw new NotFoundError('Application');
    }

    return application;
  }

  /** Withdraws the signed-in student's own application. */
  async withdraw(id: string, reason: string): Promise<JobApplicationDocument> {
    const application = await this.requireOwnApplication(id);

    if (!WITHDRAWABLE.has(application.status)) {
      throw new BusinessRuleError(
        application.status === 'selected'
          ? 'You have been selected. Decline the offer rather than withdrawing.'
          : `An application that is "${application.status.replace(/_/g, ' ')}" cannot be withdrawn.`,
      );
    }

    return this.applyTransition(application, 'withdrawn', {
      reason,
      actedByRole: 'student',
    });
  }

  /** Declines an offer the student has been selected for. */
  async declineOffer(id: string, reason: string): Promise<JobApplicationDocument> {
    const application = await this.requireOwnApplication(id);

    if (application.status !== 'selected') {
      throw new BusinessRuleError('There is no offer on this application to decline.');
    }

    const declined = await this.applyTransition(application, 'offer_declined', {
      reason,
      actedByRole: 'student',
    });

    /**
     * Keeps a recorded offer in step.
     *
     * This endpoint predates the Placement record and still serves an
     * application selected before an offer was raised. Where one exists, both
     * must say the same thing — a placement report that shows an application
     * declined against an offer still open is worse than either alone.
     */
    const placement = await this.placementRepository.findByApplication(application._id);

    if (placement && placement.status === 'offered') {
      await this.placementRepository.updateById(placement._id, {
        $set: {
          status: 'declined',
          respondedAt: new Date(),
          declineReason: reason,
        },
        $push: {
          history: {
            from: 'offered',
            to: 'declined',
            actedBy: null,
            actedByRole: 'student',
            at: new Date(),
            reason,
          },
        },
      });

      if (placement.isPrimaryOffer) {
        await this.studentRepository.clearPlacement(placement.studentId);
        await this.companyRepository.adjustStats(placement.companyId, { offerCount: -1 });
      }
    }

    return declined;
  }

  /* ---------------------------------- office --------------------------------- */

  async list(options: ListOptions): Promise<PaginatedResult<JobApplicationDocument>> {
    return this.applicationRepository.paginate({
      ...options,
      include: options.include ?? 'studentId,jobPostingId,companyId',
    });
  }

  /**
   * One application, for the placement office.
   *
   * A caller who only holds `application:read` sees their own; the office
   * permission is what reaches anyone else's.
   */
  async get(id: string): Promise<JobApplicationDocument> {
    const permissions = requestContext.tryGet()?.permissions ?? [];

    if (!hasPermission(permissions, 'application:read_all')) {
      return this.myApplication(id);
    }

    const application = await this.applicationRepository.findByIdOrFail(id);
    await this.applicationRepository.populateRelations([application]);
    return application;
  }

  /** Moves an application along its lifecycle, on the office's authority. */
  async advance(
    id: string,
    to: ApplicationStatus,
    input: { reason?: string; roundOrder?: number } = {},
  ): Promise<JobApplicationDocument> {
    const application = await this.applicationRepository.findByIdOrFail(id);

    if (STUDENT_TRANSITIONS.has(to)) {
      throw new BusinessRuleError(
        'Withdrawing and declining an offer are the student’s own actions.',
      );
    }

    return this.applyTransition(application, to, {
      reason: input.reason ?? null,
      roundOrder: input.roundOrder ?? null,
      actedByRole: 'staff',
    });
  }

  async shortlist(id: string, input: AdvanceApplicationInput): Promise<JobApplicationDocument> {
    const application = await this.applicationRepository.findByIdOrFail(id);

    return this.applyTransition(application, 'shortlisted', {
      reason: input.feedback ?? null,
      roundOrder: input.roundOrder,
      actedByRole: 'staff',
    });
  }

  async reject(id: string, reason: string): Promise<JobApplicationDocument> {
    const application = await this.applicationRepository.findByIdOrFail(id);

    return this.applyTransition(application, 'rejected', {
      reason,
      actedByRole: 'staff',
    });
  }

  async select(id: string, reason?: string): Promise<JobApplicationDocument> {
    const application = await this.applicationRepository.findByIdOrFail(id);
    const job = await this.jobRepository.findByIdOrFail(application.jobPostingId);

    // More selections than openings is usually a mistake, and the office
    // should decide deliberately rather than discover it later.
    const stats = await this.applicationRepository.statsForJob(job._id);

    if (stats.selected >= job.openings) {
      throw new BusinessRuleError(
        `All ${job.openings} opening(s) for this role are already filled.`,
      );
    }

    return this.applyTransition(application, 'selected', {
      reason: reason ?? null,
      actedByRole: 'staff',
    });
  }

  /** Applies one action to many applications, reporting each row's outcome. */
  async bulkAdvance(
    ids: string[],
    to: ApplicationStatus,
    reason?: string,
  ): Promise<BulkOperationResult> {
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
        await this.advance(id, to, { reason });
        successCount += 1;
        results.push({ index, success: true, id });
      } catch (error) {
        results.push({
          index,
          success: false,
          id,
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Action failed',
        });
      }
    }

    await this.auditService.log({
      action: 'application.bulk_action',
      category: 'admin',
      metadata: { to, submitted: ids.length, succeeded: successCount },
    });

    return {
      totalSubmitted: ids.length,
      successCount,
      failureCount: ids.length - successCount,
      results,
    };
  }

  async analytics(filter: Record<string, unknown> = {}) {
    const byStatus = await this.applicationRepository.countByStatus(filter);

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    const selected = byStatus.selected ?? 0;
    const live = total - (byStatus.withdrawn ?? 0) - (byStatus.rejected ?? 0);

    return {
      total,
      applied: byStatus.applied ?? 0,
      underReview: byStatus.under_review ?? 0,
      shortlisted: byStatus.shortlisted ?? 0,
      inProcess: byStatus.in_process ?? 0,
      selected,
      rejected: byStatus.rejected ?? 0,
      withdrawn: byStatus.withdrawn ?? 0,
      offerDeclined: byStatus.offer_declined ?? 0,
      inProgress: live,
      // Share of applications that ended in an offer, ignoring withdrawals.
      conversionRate:
        total - (byStatus.withdrawn ?? 0) > 0
          ? Math.round((selected / (total - (byStatus.withdrawn ?? 0))) * 1000) / 10
          : 0,
      byStatus,
    };
  }

  /* -------------------------------- internals -------------------------------- */

  /**
   * The single place a status changes.
   *
   * Every path — student, office, bulk — goes through here, so the edge list,
   * the history entry, the denormalised counts and the notification cannot
   * disagree about what happened.
   */
  private async applyTransition(
    application: JobApplicationDocument,
    to: ApplicationStatus,
    options: {
      reason?: string | null;
      roundOrder?: number | null;
      actedByRole: 'student' | 'staff';
    },
  ): Promise<JobApplicationDocument> {
    const allowed = APPLICATION_TRANSITIONS[application.status] ?? [];

    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(application.status, to, 'application');
    }

    const userId = requestContext.tryGet()?.userId;
    const now = new Date();

    const patch: Record<string, unknown> = { status: to };

    if (to === 'withdrawn') {
      patch.withdrawnAt = now;
      patch.withdrawalReason = options.reason ?? null;
    }

    if (to === 'rejected') {
      patch.rejectedAt = now;
      patch.rejectionReason = options.reason ?? null;
    }

    if (to === 'selected') patch.selectedAt = now;

    if (options.roundOrder !== null && options.roundOrder !== undefined) {
      patch.currentRound = options.roundOrder;
    }

    const updated = await this.applicationRepository.updateByIdOrFail(application._id, {
      $set: patch,
      $push: {
        history: {
          from: application.status,
          to,
          actedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
          actedByRole: options.actedByRole,
          at: now,
          reason: options.reason ?? null,
          roundOrder: options.roundOrder ?? null,
        },
      },
    });

    await this.syncCounts(application.jobPostingId, application.companyId, application.status, to);

    await this.auditService.log({
      action: `application.${to}`,
      category: options.actedByRole === 'staff' ? 'admin' : 'data',
      severity: to === 'rejected' ? 'warning' : 'info',
      entity: { type: 'JobApplication', id: application._id },
      changes: [{ field: 'status', from: application.status, to }],
      metadata: { reason: options.reason ?? null, byRole: options.actedByRole },
    });

    // The student hears about anything the office did to their application.
    if (options.actedByRole === 'staff') {
      await this.notifyStudent(application, to, options.reason ?? null);
    }

    return updated;
  }

  /** Keeps the posting's and company's denormalised counts honest. */
  private async syncCounts(
    jobPostingId: mongoose.Types.ObjectId,
    companyId: mongoose.Types.ObjectId,
    from: ApplicationStatus,
    to: ApplicationStatus,
  ): Promise<void> {
    const stats = await this.applicationRepository.statsForJob(jobPostingId);

    await this.jobRepository.updateById(jobPostingId, {
      $set: {
        'stats.applicationCount': stats.applications,
        'stats.shortlistedCount': stats.shortlisted,
        'stats.selectedCount': stats.selected,
      },
    });

    if (to === 'selected' && from !== 'selected') {
      await this.companyRepository.adjustStats(companyId, { offerCount: 1 });
    }

    if (from === 'selected' && to !== 'selected') {
      await this.companyRepository.adjustStats(companyId, { offerCount: -1 });
    }
  }

  /** A posting must be published and inside its window to take applications. */
  private assertAcceptingApplications(job: JobPostingDocument): void {
    const now = new Date();

    if (job.status !== 'published') {
      throw new BusinessRuleError(
        job.status === 'closed' || job.status === 'completed'
          ? 'Applications for this role have closed.'
          : 'This role is not open for applications.',
      );
    }

    if (job.applicationOpenAt > now) {
      throw new BusinessRuleError(
        `Applications open on ${job.applicationOpenAt.toDateString()}.`,
      );
    }

    if (job.applicationCloseAt <= now) {
      throw new BusinessRuleError('The application deadline for this role has passed.');
    }
  }

  private async notifyStudent(
    application: JobApplicationDocument,
    to: ApplicationStatus,
    reason: string | null,
  ): Promise<void> {
    const student = await this.studentRepository.findById(application.studentId);
    if (!student) return;

    const job = await this.jobRepository.findById(application.jobPostingId);
    const title = job?.title ?? 'a role you applied for';

    const messages: Partial<Record<ApplicationStatus, { title: string; body: string }>> = {
      under_review: {
        title: 'Your application is being reviewed',
        body: `Your application for "${title}" is under review.`,
      },
      shortlisted: {
        title: 'You have been shortlisted',
        body: `You have been shortlisted for "${title}".`,
      },
      in_process: {
        title: 'You have moved to the next round',
        body: `You are through to the next round for "${title}".`,
      },
      selected: {
        title: 'You have been selected',
        body: `You have been selected for "${title}".`,
      },
      rejected: {
        title: 'An application was not taken forward',
        body: `Your application for "${title}" was not taken forward.${reason ? ` ${reason}` : ''}`,
      },
    };

    const message = messages[to];
    if (!message) return;

    await this.notificationService.notifySafely({
      userIds: [student.userId],
      type: `placement.application_${to}`,
      category: 'placement',
      priority: to === 'selected' || to === 'shortlisted' ? 'high' : 'normal',
      title: message.title,
      message: message.body,
      actionUrl: `/student/applications/${String(application._id)}`,
      entity: { type: 'JobApplication', id: application._id },
    });
  }
}
