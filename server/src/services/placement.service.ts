import {
  hasPermission,
  PLACEMENT_TRANSITIONS,
  STUDENT_PLACEMENT_TRANSITIONS,
  type CreatePlacementInput,
  type PlacementStatus,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { PlacementDocument } from '@/models/placement.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type {
  CompanyRepository,
  JobApplicationRepository,
  JobPostingRepository,
  PlacementRepository,
} from '@/repositories/placement.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import { toPlain } from '@/utils/mongo';

/**
 * The offer lifecycle.
 *
 * offered → accepted → joined
 * offered → declined
 *
 * `declined`, `joined`, `not_joined` and `offer_revoked` are terminal. A
 * company can pull an offer at either live stage, which is what
 * `offer_revoked` records.
 */
// The map itself lives in `@peacefic/shared` so the client can offer only the
// moves this service would accept. Re-exported here because that is where the
// rest of the server has always imported it from.
export { PLACEMENT_TRANSITIONS };

/**
 * Answering an offer is the student's decision.
 *
 * The office may correct a record's details and may revoke on the company's
 * instruction, but it must not accept or decline on a student's behalf — a
 * placement report has to be able to say the student chose.
 */
const STUDENT_ONLY = new Set<PlacementStatus>(STUDENT_PLACEMENT_TRANSITIONS);

/** Statuses that count a student as placed. */
const PLACED_STATUSES = new Set<PlacementStatus>(['offered', 'accepted', 'joined']);

export class PlacementService {
  constructor(
    private readonly placementRepository: PlacementRepository,
    private readonly applicationRepository: JobApplicationRepository,
    private readonly jobRepository: JobPostingRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly studentRepository: StudentRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ---------------------------------- office --------------------------------- */

  async list(options: ListOptions): Promise<PaginatedResult<PlacementDocument>> {
    return this.placementRepository.paginate({
      ...options,
      include: options.include ?? 'studentId,companyId,jobPostingId',
    });
  }

  /**
   * One offer.
   *
   * A caller without the office permission gets the own-offer path, so a
   * student passing someone else's id gets a 404 rather than a record.
   */
  async get(id: string): Promise<PlacementDocument> {
    const permissions = requestContext.tryGet()?.permissions ?? [];

    if (!hasPermission(permissions, 'placement:read_all')) {
      return this.myOffer(id);
    }

    const placement = await this.placementRepository.findByIdOrFail(id);
    await this.placementRepository.populateRelations([placement]);
    return placement;
  }

  /**
   * Records an offer against a selected application.
   *
   * Selection and the offer are separate steps by design: the offer carries a
   * designation, location, package and academic year that exist on neither the
   * application nor the posting, and `isPrimaryOffer` is a judgement no
   * automatic step can make for a student holding several offers.
   */
  async create(input: CreatePlacementInput): Promise<PlacementDocument> {
    const application = await this.applicationRepository.findByIdOrFail(input.applicationId);

    // An offer only exists because someone was selected.
    if (application.status !== 'selected') {
      throw new BusinessRuleError(
        `An offer can only be recorded for a selected application. This one is "${application.status.replace(/_/g, ' ')}".`,
      );
    }

    // The ids must describe one coherent record rather than three unrelated
    // ones the caller happened to send.
    if (String(application.studentId) !== String(input.studentId)) {
      throw new ValidationError('That application belongs to a different student.', [
        { field: 'studentId', message: 'Does not match the application' },
      ]);
    }

    if (String(application.jobPostingId) !== String(input.jobPostingId)) {
      throw new ValidationError('That application is for a different role.', [
        { field: 'jobPostingId', message: 'Does not match the application' },
      ]);
    }

    if (String(application.companyId) !== String(input.companyId)) {
      throw new ValidationError('That application is for a different company.', [
        { field: 'companyId', message: 'Does not match the application' },
      ]);
    }

    const existing = await this.placementRepository.findByApplication(application._id);

    if (existing) {
      throw new ConflictError('An offer has already been recorded for this application.');
    }

    const placement = await withTransaction(async (transaction) => {
      // Clearing first keeps the partial unique index from rejecting the insert.
      if (input.isPrimaryOffer) {
        await this.placementRepository.clearPrimary(
          application.studentId,
          input.academicYear,
          undefined,
          transaction,
        );
      }

      let created: PlacementDocument;

      try {
        created = await this.placementRepository.create(
          {
            studentId: application.studentId,
            applicationId: application._id,
            jobPostingId: application.jobPostingId,
            companyId: application.companyId,
            departmentId: application.departmentId,
            batchId: application.batchId,
            offerDate: input.offerDate,
            joiningDate: input.joiningDate ?? null,
            designation: input.designation,
            location: input.location,
            jobType: input.jobType,
            package: input.package,
            isPrimaryOffer: input.isPrimaryOffer,
            academicYear: input.academicYear,
            status: input.status,
          } as Partial<PlacementDocument>,
          transaction,
        );
      } catch (error) {
        // Two requests arriving together both pass the check above; the unique
        // index is what actually prevents the duplicate.
        if ((error as { code?: number }).code === 11000) {
          throw new ConflictError('An offer has already been recorded for this application.');
        }
        throw error;
      }

      return created;
    });

    // The student's placement figures are what eligibility and reporting read.
    if (PLACED_STATUSES.has(placement.status) && placement.isPrimaryOffer) {
      await this.studentRepository.recordPlacement(placement.studentId, placement.package.ctc);
    }

    await this.auditService.log({
      action: 'placement.created',
      category: 'data',
      entity: { type: 'Placement', id: placement._id, label: placement.designation },
      metadata: {
        applicationId: String(application._id),
        ctc: placement.package.ctc,
        isPrimaryOffer: placement.isPrimaryOffer,
      },
    });

    await this.notifyStudent(
      placement,
      'You have received an offer',
      `You have an offer for ${placement.designation}. Open it to accept or decline.`,
      'high',
    );

    return placement;
  }

  async update(id: string, input: Record<string, unknown>): Promise<PlacementDocument> {
    const existing = await this.placementRepository.findByIdOrFail(id);

    if (existing.status !== 'offered' && existing.status !== 'accepted') {
      throw new BusinessRuleError(
        `An offer that is "${existing.status.replace(/_/g, ' ')}" can no longer be edited.`,
      );
    }

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('joiningDate', input.joiningDate);
    assign('designation', input.designation);
    assign('location', input.location);
    assign('notes', input.note);

    // Status is moved through the dedicated transitions, never a field edit,
    // so the history and the student's placement figures stay in step.
    if (input.status !== undefined) {
      throw new BusinessRuleError(
        'Use the accept, decline, revoke or joined operations rather than editing the status.',
      );
    }

    const updated = await withTransaction(async (transaction) => {
      if (input.isPrimaryOffer === true) {
        await this.placementRepository.clearPrimary(
          existing.studentId,
          existing.academicYear,
          existing._id,
          transaction,
        );
        patch.isPrimaryOffer = true;
      } else if (input.isPrimaryOffer === false) {
        patch.isPrimaryOffer = false;
      }

      const result = await this.placementRepository.updateById(
        id,
        { $set: patch },
        { session: transaction },
      );

      if (!result) throw new NotFoundError('Placement');
      return result;
    });

    await this.auditService.log({
      action: 'placement.updated',
      category: 'data',
      entity: { type: 'Placement', id: updated._id, label: updated.designation },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  /** Withdraws an offer, on the company's instruction. */
  async revoke(id: string, reason: string): Promise<PlacementDocument> {
    const placement = await this.placementRepository.findByIdOrFail(id);
    return this.transition(placement, 'offer_revoked', { reason, actedByRole: 'staff' });
  }

  /** Records that the student actually joined. */
  async markJoined(id: string, joiningDate?: Date): Promise<PlacementDocument> {
    const placement = await this.placementRepository.findByIdOrFail(id);

    return this.transition(placement, 'joined', {
      actedByRole: 'staff',
      extraPatch: {
        joinedAt: new Date(),
        ...(joiningDate ? { joiningDate } : {}),
      },
    });
  }

  /** Records that the student did not turn up, after accepting. */
  async markNotJoined(id: string, reason: string): Promise<PlacementDocument> {
    const placement = await this.placementRepository.findByIdOrFail(id);
    return this.transition(placement, 'not_joined', { reason, actedByRole: 'staff' });
  }

  async setVerification(id: string, isVerified: boolean): Promise<PlacementDocument> {
    const placement = await this.placementRepository.findByIdOrFail(id);
    const userId = requestContext.get().userId;

    const updated = await this.placementRepository.updateByIdOrFail(id, {
      $set: {
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
        verifiedBy: isVerified && userId ? new mongoose.Types.ObjectId(userId) : null,
      },
    });

    await this.auditService.log({
      action: isVerified ? 'placement.verified' : 'placement.unverified',
      category: 'admin',
      entity: { type: 'Placement', id: placement._id, label: placement.designation },
      changes: [{ field: 'isVerified', from: placement.isVerified, to: isVerified }],
    });

    return updated;
  }

  /* ------------------------------- self-service ------------------------------ */

  /** The signed-in student's own offers. */
  async myOffers(): Promise<PlacementDocument[]> {
    const student = await this.scopeGuard.requireOwnStudent();
    const placements = await this.placementRepository.findForStudent(student._id);

    await this.placementRepository.populateRelations(placements);
    return placements;
  }

  /** One of the signed-in student's offers, populated for display. */
  async myOffer(id: string): Promise<PlacementDocument> {
    const placement = await this.requireOwnPlacement(id);

    await this.placementRepository.populateRelations([placement]);
    return placement;
  }

  /**
   * The caller's own offer, unpopulated.
   *
   * Mutation paths use this rather than `myOffer`: a populated document carries
   * whole related records where the relation fields are typed as ids, and
   * passing one into a repository call casts as `_id` and fails.
   */
  private async requireOwnPlacement(id: string): Promise<PlacementDocument> {
    const student = await this.scopeGuard.requireOwnStudent();
    const placement = await this.placementRepository.findByIdOrFail(id);

    if (String(placement.studentId) !== String(student._id)) {
      // 404 rather than 403: a 403 would confirm the offer exists.
      throw new NotFoundError('Placement');
    }

    return placement;
  }

  async accept(id: string): Promise<PlacementDocument> {
    const placement = await this.requireOwnPlacement(id);
    return this.transition(placement, 'accepted', { actedByRole: 'student' });
  }

  async decline(id: string, reason: string): Promise<PlacementDocument> {
    const placement = await this.requireOwnPlacement(id);
    return this.transition(placement, 'declined', { reason, actedByRole: 'student' });
  }

  /* -------------------------------- analytics -------------------------------- */

  async analytics(filter: Record<string, unknown> = {}) {
    const [byStatus, packages, byDepartment, byBatch, recruiters, totalStudents] =
      await Promise.all([
        this.placementRepository.countByStatus(filter),
        this.placementRepository.packageSummary(filter),
        this.placementRepository.countByDepartment(filter),
        this.placementRepository.countByBatch(filter),
        this.placementRepository.topRecruiters(filter),
        this.studentRepository.count({ status: 'active' }),
      ]);

    const totalOffers = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      totalOffers,
      offered: byStatus.offered ?? 0,
      accepted: byStatus.accepted ?? 0,
      declined: byStatus.declined ?? 0,
      joined: byStatus.joined ?? 0,
      revoked: byStatus.offer_revoked ?? 0,
      notJoined: byStatus.not_joined ?? 0,

      placedStudents: packages.placedStudents,
      totalStudents,
      // Share of the active cohort holding a live primary offer.
      placementPercentage:
        totalStudents > 0
          ? Math.round((packages.placedStudents / totalStudents) * 1000) / 10
          : 0,

      averageCtc: packages.averageCtc,
      highestCtc: packages.highestCtc,
      lowestCtc: packages.lowestCtc,
      medianCtc: packages.medianCtc,

      byStatus,
      byDepartment,
      byBatch,
      topRecruiters: recruiters,
    };
  }

  async export(filter: Record<string, unknown>): Promise<PlacementDocument[]> {
    const placements = await this.placementRepository.findMany(filter, {
      sort: '-offerDate',
      limit: 5000,
    });

    await this.placementRepository.populateRelations(placements);

    await this.auditService.log({
      action: 'placement.exported',
      category: 'data',
      metadata: { rows: placements.length },
    });

    return placements;
  }

  /* -------------------------------- internals -------------------------------- */

  /**
   * The single place an offer's status changes.
   *
   * Every path goes through here, so the edge list, the history entry, the
   * student's placement figures, the company's offer count and the linked
   * application cannot disagree about what happened.
   */
  private async transition(
    placement: PlacementDocument,
    to: PlacementStatus,
    options: {
      reason?: string | null;
      actedByRole: 'student' | 'staff';
      extraPatch?: Record<string, unknown>;
    },
  ): Promise<PlacementDocument> {
    // Answering belongs to the student; the office is refused even where the
    // edge itself is legal.
    if (options.actedByRole === 'staff' && STUDENT_ONLY.has(to)) {
      throw new BusinessRuleError(
        'Accepting and declining an offer are the student’s own decisions.',
      );
    }

    const allowed = PLACEMENT_TRANSITIONS[placement.status] ?? [];

    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(placement.status, to, 'offer');
    }

    const userId = requestContext.tryGet()?.userId;
    const now = new Date();

    const patch: Record<string, unknown> = { status: to, ...(options.extraPatch ?? {}) };

    if (to === 'accepted' || to === 'declined') patch.respondedAt = now;
    if (to === 'declined') patch.declineReason = options.reason ?? null;
    if (to === 'offer_revoked') patch.revokeReason = options.reason ?? null;

    const updated = await this.placementRepository.updateByIdOrFail(placement._id, {
      $set: patch,
      $push: {
        history: {
          from: placement.status,
          to,
          actedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
          actedByRole: options.actedByRole,
          at: now,
          reason: options.reason ?? null,
        },
      },
    });

    await this.syncOnStatusChange(placement, to);

    await this.auditService.log({
      action: `placement.${to}`,
      category: options.actedByRole === 'staff' ? 'admin' : 'data',
      severity: to === 'offer_revoked' || to === 'not_joined' ? 'warning' : 'info',
      entity: { type: 'Placement', id: placement._id, label: placement.designation },
      changes: [{ field: 'status', from: placement.status, to }],
      metadata: { reason: options.reason ?? null, byRole: options.actedByRole },
    });

    if (options.actedByRole === 'staff') {
      await this.notifyOnStaffAction(placement, to, options.reason ?? null);
    }

    return updated;
  }

  /**
   * Keeps everything that mirrors an offer's state honest: the student's
   * placement flags, the company's offer count, and the application the offer
   * came from.
   */
  private async syncOnStatusChange(
    placement: PlacementDocument,
    to: PlacementStatus,
  ): Promise<void> {
    const wasPlaced = PLACED_STATUSES.has(placement.status);
    const isPlaced = PLACED_STATUSES.has(to);

    // Losing a primary offer means the student is looking again. Their
    // eligibility bar is deliberately left alone: whether the office has
    // barred them from drives is a separate decision from whether they hold
    // an offer.
    if (placement.isPrimaryOffer && wasPlaced && !isPlaced) {
      await this.clearPlacedFlag(placement.studentId);
    }

    if (!wasPlaced && isPlaced && placement.isPrimaryOffer) {
      await this.studentRepository.recordPlacement(placement.studentId, placement.package.ctc);
    }

    if (wasPlaced && !isPlaced) {
      await this.companyRepository.adjustStats(placement.companyId, { offerCount: -1 });
    }

    // A declined offer is also a declined application, so the two records
    // never contradict each other on a placement report.
    if (to === 'declined') {
      const application = await this.applicationRepository.findById(placement.applicationId);

      if (application && application.status === 'selected') {
        await this.applicationRepository.updateById(application._id, {
          $set: { status: 'offer_declined' },
          $push: {
            history: {
              from: 'selected',
              to: 'offer_declined',
              actedBy: null,
              actedByRole: 'student',
              at: new Date(),
              reason: 'The offer was declined.',
              roundOrder: null,
            },
          },
        });
      }
    }
  }

  /**
   * Recomputes the student's placed flag from their live offers.
   *
   * `recordPlacement` only ever sets the flag on, so losing an offer needs an
   * explicit recount rather than a decrement — a student may hold others.
   */
  private async clearPlacedFlag(studentId: mongoose.Types.ObjectId): Promise<void> {
    const live = await this.placementRepository.count({
      studentId,
      isPrimaryOffer: true,
      status: { $in: ['offered', 'accepted', 'joined'] },
    });

    if (live > 0) return;

    await this.studentRepository.clearPlacement(studentId);
  }

  private async notifyStudent(
    placement: PlacementDocument,
    title: string,
    message: string,
    priority: 'normal' | 'high' = 'normal',
  ): Promise<void> {
    const student = await this.studentRepository.findById(placement.studentId);
    if (!student) return;

    await this.notificationService.notifySafely({
      userIds: [student.userId],
      type: 'placement.offer',
      category: 'placement',
      priority,
      title,
      message,
      actionUrl: `/student/placement/offers/${String(placement._id)}`,
      entity: { type: 'Placement', id: placement._id },
    });
  }

  private async notifyOnStaffAction(
    placement: PlacementDocument,
    to: PlacementStatus,
    reason: string | null,
  ): Promise<void> {
    const messages: Partial<Record<PlacementStatus, { title: string; body: string }>> = {
      offer_revoked: {
        title: 'An offer was withdrawn',
        body: `Your offer for ${placement.designation} has been withdrawn.${reason ? ` Reason: ${reason}` : ''}`,
      },
      joined: {
        title: 'Your joining has been recorded',
        body: `Your joining for ${placement.designation} has been recorded.`,
      },
      not_joined: {
        title: 'You were recorded as not joining',
        body: `You have been recorded as not joining ${placement.designation}.${reason ? ` Reason: ${reason}` : ''}`,
      },
    };

    const message = messages[to];
    if (!message) return;

    await this.notifyStudent(
      placement,
      message.title,
      message.body,
      to === 'offer_revoked' ? 'high' : 'normal',
    );
  }
}
