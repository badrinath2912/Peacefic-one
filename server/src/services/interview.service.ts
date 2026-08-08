import {
  hasPermission,
  INTERVIEW_TRANSITIONS,
  STUDENT_INTERVIEW_TRANSITIONS,
  type BulkScheduleInterviewInput,
  type InterviewStatus,
  type RecordInterviewResultInput,
  type ScheduleInterviewInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
} from '@/errors';
import type { InterviewDocument } from '@/models/interview.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type {
  InterviewRepository,
  JobApplicationRepository,
  JobPostingRepository,
} from '@/repositories/placement.repository';
import type { StudentRepository } from '@/repositories/student.repository';

/** Statuses from which a round can still be run or moved. */
const LIVE_STATUSES = new Set<InterviewStatus>([
  'scheduled',
  'confirmed',
  'rescheduled',
  'in_progress',
]);

/** Applications a candidate can still be interviewed on. */
const INTERVIEWABLE = new Set(['shortlisted', 'in_process']);

/**
 * Interview rounds.
 *
 * Scheduling is an office action; confirming a slot and asking for a different
 * one belong to the student. The two are kept apart by permission rather than
 * by convention, so `interview:read` can never be mistaken for a licence to
 * change anything.
 */
export class InterviewService {
  constructor(
    private readonly interviewRepository: InterviewRepository,
    private readonly applicationRepository: JobApplicationRepository,
    private readonly jobRepository: JobPostingRepository,
    private readonly studentRepository: StudentRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ---------------------------------- office --------------------------------- */

  async list(options: ListOptions): Promise<PaginatedResult<InterviewDocument>> {
    return this.interviewRepository.paginate({
      ...options,
      include: options.include ?? 'studentId,jobPostingId,companyId',
    });
  }

  /**
   * One interview.
   *
   * A caller without the office permission falls through to their own record,
   * so a student passing someone else's id gets a 404 rather than a document.
   */
  async get(id: string): Promise<InterviewDocument> {
    const permissions = requestContext.tryGet()?.permissions ?? [];

    if (!hasPermission(permissions, 'interview:read_all')) {
      return this.myInterview(id);
    }

    const interview = await this.interviewRepository.findByIdOrFail(id);
    await this.interviewRepository.populateRelations([interview]);
    return interview;
  }

  async schedule(input: ScheduleInterviewInput): Promise<InterviewDocument> {
    const application = await this.applicationRepository.findByIdOrFail(input.applicationId);

    if (!INTERVIEWABLE.has(application.status)) {
      throw new BusinessRuleError(
        `A candidate whose application is "${application.status.replace(/_/g, ' ')}" cannot be scheduled for an interview.`,
      );
    }

    await this.assertRoundExists(application.jobPostingId, input.roundOrder);

    const existing = await this.interviewRepository.findByApplicationAndRound(
      application._id,
      input.roundOrder,
    );

    if (existing) {
      throw new ConflictError(
        `This candidate already has an interview for round ${input.roundOrder}.`,
      );
    }

    const interview = await this.createOne(input, application);

    await this.auditService.log({
      action: 'interview.scheduled',
      category: 'admin',
      entity: { type: 'Interview', id: interview._id, label: interview.roundName },
      metadata: { applicationId: String(application._id), roundOrder: input.roundOrder },
    });

    await this.notifyStudent(
      interview,
      'An interview has been scheduled',
      `Your ${interview.roundName} is on ${interview.scheduledAt.toDateString()}.`,
    );

    return interview;
  }

  /**
   * A whole round in one request.
   *
   * Slots are laid out across panels: each panel runs its own sequence from the
   * same start time, so a round of 60 candidates across 3 panels finishes in a
   * third of the time. Anyone already scheduled for the round is skipped rather
   * than duplicated — the unique index would refuse them anyway, and a partial
   * result the caller can read beats a failed batch.
   */
  async bulkSchedule(input: BulkScheduleInterviewInput): Promise<{
    scheduledCount: number;
    skippedCount: number;
    results: Array<{ applicationId: string; scheduled: boolean; message?: string }>;
  }> {
    await this.assertRoundExists(
      new mongoose.Types.ObjectId(input.jobPostingId),
      input.roundOrder,
    );

    const applications = await this.applicationRepository.findMany(
      { _id: { $in: input.applicationIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { limit: 500 },
    );

    const found = new Map(applications.map((entry) => [String(entry._id), entry]));

    const alreadyScheduled = await this.interviewRepository.findScheduledRounds(
      applications.map((entry) => entry._id),
      input.roundOrder,
    );

    const taken = new Set(alreadyScheduled.map((entry) => String(entry.applicationId)));

    const results: Array<{ applicationId: string; scheduled: boolean; message?: string }> = [];
    let slot = 0;

    for (const applicationId of input.applicationIds) {
      const application = found.get(applicationId);

      if (!application) {
        results.push({ applicationId, scheduled: false, message: 'Application not found.' });
        continue;
      }

      if (String(application.jobPostingId) !== String(input.jobPostingId)) {
        results.push({
          applicationId,
          scheduled: false,
          message: 'This application belongs to a different drive.',
        });
        continue;
      }

      if (!INTERVIEWABLE.has(application.status)) {
        results.push({
          applicationId,
          scheduled: false,
          message: `The application is "${application.status.replace(/_/g, ' ')}".`,
        });
        continue;
      }

      if (taken.has(applicationId)) {
        results.push({
          applicationId,
          scheduled: false,
          message: `Already scheduled for round ${input.roundOrder}.`,
        });
        continue;
      }

      try {
        await this.createOne(
          {
            applicationId,
            roundOrder: input.roundOrder,
            roundName: input.roundName,
            type: input.type,
            mode: input.mode,
            scheduledAt: this.slotFor(input, slot),
            durationMinutes: input.slotDurationMinutes,
            venue: input.venue ?? null,
            meetingLink: input.meetingLink ?? null,
            interviewers: [],
            panelNumber: String((slot % input.panels) + 1),
            instructions: null,
          },
          application,
        );

        results.push({ applicationId, scheduled: true });
        slot += 1;
      } catch (error) {
        // The unique index is the real guard: a concurrent request may have
        // taken this round between the check above and the insert.
        results.push({
          applicationId,
          scheduled: false,
          message:
            error instanceof Error && error.message.includes('duplicate')
              ? `Already scheduled for round ${input.roundOrder}.`
              : 'Could not be scheduled.',
        });
      }
    }

    const scheduledCount = results.filter((row) => row.scheduled).length;

    await this.auditService.log({
      action: 'interview.bulk_scheduled',
      category: 'admin',
      entity: { type: 'JobPosting', id: new mongoose.Types.ObjectId(input.jobPostingId) },
      metadata: {
        roundOrder: input.roundOrder,
        requested: input.applicationIds.length,
        scheduled: scheduledCount,
      },
    });

    return {
      scheduledCount,
      skippedCount: results.length - scheduledCount,
      results,
    };
  }

  /**
   * Where a candidate sits in the grid.
   *
   * Panels run in parallel, so slot 0, 1 and 2 across three panels all start at
   * the same moment and slot 3 begins one duration later.
   */
  private slotFor(input: BulkScheduleInterviewInput, index: number): Date {
    const round = Math.floor(index / input.panels);
    const start = new Date(input.startAt).getTime();
    return new Date(start + round * input.slotDurationMinutes * 60_000);
  }

  private async createOne(
    input: ScheduleInterviewInput,
    application: { _id: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId; jobPostingId: mongoose.Types.ObjectId; companyId: mongoose.Types.ObjectId },
  ): Promise<InterviewDocument> {
    return this.interviewRepository.create({
      applicationId: application._id,
      studentId: application.studentId,
      jobPostingId: application.jobPostingId,
      companyId: application.companyId,
      roundOrder: input.roundOrder,
      roundName: input.roundName,
      type: input.type,
      mode: input.mode,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      venue: input.venue ?? null,
      meetingLink: input.meetingLink ?? null,
      interviewers: (input.interviewers ?? []).map((person) => ({
        name: person.name,
        designation: person.designation,
        email: person.email ?? null,
      })),
      panelNumber: input.panelNumber ?? null,
      instructions: input.instructions ?? null,
      status: 'scheduled',
      history: [
        {
          from: null,
          to: 'scheduled',
          actedBy: this.actor(),
          actedByRole: 'staff',
          at: new Date(),
          reason: null,
        },
      ],
    } as Partial<InterviewDocument>);
  }

  /** Moves the slot. The status returns to `rescheduled`, awaiting the student. */
  async reschedule(id: string, scheduledAt: Date, reason: string): Promise<InterviewDocument> {
    const interview = await this.interviewRepository.findByIdOrFail(id);

    if (!LIVE_STATUSES.has(interview.status)) {
      throw new BusinessRuleError(
        `An interview that is "${interview.status.replace(/_/g, ' ')}" cannot be rescheduled.`,
      );
    }

    const updated = await this.applyTransition(interview, 'rescheduled', {
      reason,
      actedByRole: 'staff',
      extraPatch: { scheduledAt, confirmedAt: null, rescheduleRequest: null },
    });

    await this.notifyStudent(
      updated,
      'An interview has been moved',
      `Your ${updated.roundName} is now on ${scheduledAt.toDateString()}. ${reason}`,
      'high',
    );

    return updated;
  }

  async cancel(id: string, reason: string): Promise<InterviewDocument> {
    const interview = await this.interviewRepository.findByIdOrFail(id);

    const updated = await this.applyTransition(interview, 'cancelled', {
      reason,
      actedByRole: 'staff',
      extraPatch: { cancelledAt: new Date(), cancellationReason: reason },
    });

    await this.notifyStudent(
      updated,
      'An interview was cancelled',
      `Your ${updated.roundName} has been cancelled. ${reason}`,
      'high',
    );

    return updated;
  }

  /** Any other office-driven move: starting, completing, marking a no-show. */
  async transition(id: string, to: InterviewStatus, reason?: string): Promise<InterviewDocument> {
    const interview = await this.interviewRepository.findByIdOrFail(id);

    if (STUDENT_INTERVIEW_TRANSITIONS.includes(to)) {
      throw new BusinessRuleError('Confirming an interview is the student’s own action.');
    }

    return this.applyTransition(interview, to, {
      reason: reason ?? null,
      actedByRole: 'staff',
    });
  }

  /**
   * The outcome of a round.
   *
   * Deliberately does not move the application. `application:shortlist` and
   * `application:reject` are separate permissions held by separate people, and
   * writing the application here would let anyone with `interview:record_result`
   * drive a candidate's progress without ever holding those. The suggestion is
   * returned instead, and the office acts on it through the application API.
   */
  async recordResult(
    id: string,
    input: RecordInterviewResultInput,
  ): Promise<{ interview: InterviewDocument; suggestedApplicationStatus: string | null }> {
    const interview = await this.interviewRepository.findByIdOrFail(id);

    if (interview.status === 'cancelled') {
      throw new BusinessRuleError('A cancelled interview has no result to record.');
    }

    if (input.score !== null && input.score !== undefined) {
      const maxScore = input.maxScore ?? interview.result.maxScore;

      if (maxScore !== null && maxScore !== undefined && input.score > maxScore) {
        throw new BusinessRuleError('The score cannot be higher than the maximum.');
      }
    }

    const updated = await this.interviewRepository.updateByIdOrFail(id, {
      $set: {
        'result.status': input.status,
        'result.score': input.score ?? null,
        'result.maxScore': input.maxScore ?? null,
        'result.feedback': input.feedback ?? null,
        'result.strengths': input.strengths,
        'result.improvements': input.improvements,
        'result.recordedAt': new Date(),
        'result.recordedBy': this.actor(),
        // A recorded result closes the round, unless it did not happen.
        ...(interview.status !== 'completed' && interview.status !== 'no_show'
          ? { status: input.status === 'no_show' ? 'no_show' : 'completed' }
          : {}),
      },
    });

    await this.auditService.log({
      action: 'interview.result_recorded',
      category: 'admin',
      entity: { type: 'Interview', id: updated._id, label: updated.roundName },
      metadata: { result: input.status, score: input.score ?? null },
    });

    return {
      interview: updated,
      suggestedApplicationStatus: this.suggestFor(input.status),
    };
  }

  /**
   * What the office would probably do next. A suggestion only — nothing is
   * written to the application, and acting on it needs its own permission.
   */
  private suggestFor(result: RecordInterviewResultInput['status']): string | null {
    if (result === 'cleared') return 'in_process';
    if (result === 'rejected' || result === 'no_show') return 'rejected';
    return null;
  }

  async analytics(filter: Record<string, unknown> = {}) {
    const [byStatus, byResult, upcoming] = await Promise.all([
      this.interviewRepository.countByStatus(filter),
      this.interviewRepository.countByResult(filter),
      this.interviewRepository.countUpcoming(),
    ]);

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      total,
      upcoming,
      scheduled: byStatus.scheduled ?? 0,
      confirmed: byStatus.confirmed ?? 0,
      completed: byStatus.completed ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      noShow: byStatus.no_show ?? 0,
      cleared: byResult.cleared ?? 0,
      rejected: byResult.rejected ?? 0,
      pendingResult: byResult.pending ?? 0,
      byStatus,
      byResult,
    };
  }

  /* ------------------------------- self-service ------------------------------ */
  // No student parameter anywhere below: identity comes from the token.

  async myInterviews(): Promise<InterviewDocument[]> {
    const student = await this.scopeGuard.requireOwnStudent();
    const interviews = await this.interviewRepository.findForStudent(student._id);

    await this.interviewRepository.populateRelations(interviews);
    return interviews;
  }

  async myInterview(id: string): Promise<InterviewDocument> {
    const interview = await this.requireOwnInterview(id);

    await this.interviewRepository.populateRelations([interview]);
    return interview;
  }

  /** The student says they will attend. */
  async confirm(id: string): Promise<InterviewDocument> {
    const interview = await this.requireOwnInterview(id);

    return this.applyTransition(interview, 'confirmed', {
      actedByRole: 'student',
      extraPatch: { confirmedAt: new Date() },
    });
  }

  /**
   * The student asks for a different time.
   *
   * Records the request and leaves the slot alone: only the office can move an
   * interview, so a request that silently changed the schedule would let a
   * student reschedule themselves.
   */
  async requestReschedule(
    id: string,
    reason: string,
    preferredSlots: Date[],
  ): Promise<InterviewDocument> {
    const interview = await this.requireOwnInterview(id);

    if (!LIVE_STATUSES.has(interview.status)) {
      throw new BusinessRuleError(
        `An interview that is "${interview.status.replace(/_/g, ' ')}" cannot be moved.`,
      );
    }

    const updated = await this.interviewRepository.updateByIdOrFail(id, {
      $set: {
        rescheduleRequest: { reason, preferredSlots, requestedAt: new Date() },
      },
    });

    await this.auditService.log({
      action: 'interview.reschedule_requested',
      category: 'data',
      entity: { type: 'Interview', id: updated._id, label: updated.roundName },
      metadata: { reason },
    });

    return updated;
  }

  /* --------------------------------- internals -------------------------------- */

  private actor(): mongoose.Types.ObjectId | null {
    const userId = requestContext.tryGet()?.userId;
    return userId ? new mongoose.Types.ObjectId(userId) : null;
  }

  /** The signed-in student's own interview, or a 404. */
  private async requireOwnInterview(id: string): Promise<InterviewDocument> {
    const student = await this.scopeGuard.requireOwnStudent();
    const interview = await this.interviewRepository.findByIdOrFail(id);

    if (String(interview.studentId) !== String(student._id)) {
      // 404 rather than 403: a 403 would confirm the interview exists.
      throw new NotFoundError('Interview');
    }

    return interview;
  }

  /** The round must be one the drive actually runs. */
  private async assertRoundExists(
    jobPostingId: mongoose.Types.ObjectId,
    roundOrder: number,
  ): Promise<void> {
    const job = await this.jobRepository.findByIdOrFail(jobPostingId);
    const round = job.selectionRounds.find((entry) => entry.order === roundOrder);

    if (!round) {
      throw new BusinessRuleError(
        `This drive has no round ${roundOrder}. It runs ${job.selectionRounds.length} round(s).`,
      );
    }
  }

  private async applyTransition(
    interview: InterviewDocument,
    to: InterviewStatus,
    options: {
      reason?: string | null;
      actedByRole: 'student' | 'staff';
      extraPatch?: Record<string, unknown>;
    },
  ): Promise<InterviewDocument> {
    const allowed = INTERVIEW_TRANSITIONS[interview.status] ?? [];

    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(interview.status, to, 'interview');
    }

    const updated = await this.interviewRepository.updateByIdOrFail(interview._id, {
      $set: { status: to, ...(options.extraPatch ?? {}) },
      $push: {
        history: {
          from: interview.status,
          to,
          actedBy: this.actor(),
          actedByRole: options.actedByRole,
          at: new Date(),
          reason: options.reason ?? null,
        },
      },
    });

    await this.auditService.log({
      action: `interview.${to}`,
      category: options.actedByRole === 'staff' ? 'admin' : 'data',
      severity: to === 'cancelled' || to === 'no_show' ? 'warning' : 'info',
      entity: { type: 'Interview', id: updated._id, label: updated.roundName },
      changes: [{ field: 'status', from: interview.status, to }],
      metadata: { reason: options.reason ?? null, byRole: options.actedByRole },
    });

    return updated;
  }

  /**
   * Interview notices go through the existing notification service — the same
   * path drives and offers already use. Failures are swallowed there, so a mail
   * outage cannot roll back a schedule that was genuinely made.
   */
  private async notifyStudent(
    interview: InterviewDocument,
    title: string,
    message: string,
    priority: 'normal' | 'high' = 'normal',
  ): Promise<void> {
    const student = await this.studentRepository.findById(interview.studentId);
    if (!student) return;

    await this.notificationService.notifySafely({
      userIds: [student.userId],
      type: 'placement.interview',
      category: 'placement',
      priority,
      title,
      message,
      actionUrl: `/student/interviews/${String(interview._id)}`,
      entity: { type: 'Interview', id: interview._id },
    });
  }
}
