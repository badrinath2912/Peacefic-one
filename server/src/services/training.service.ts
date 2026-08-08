import type {
  BulkOperationResult,
  CompleteSessionInput,
  CreateTrainingRequestInput,
  CreateTrainingSessionInput,
  EnrollStudentsInput,
  UpdateTrainingRequestInput,
  UpdateTrainingSessionInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { TrainingRequestDocument } from '@/models/training-request.model';
import type { TrainingSessionDocument } from '@/models/training-session.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type {
  TrainingEnrollmentRepository,
  TrainingRequestRepository,
  TrainingSessionRepository,
} from '@/repositories/training.repository';
import { formatSequence } from '@/utils/crypto';
import { populatedName, toPlain } from '@/utils/mongo';

/**
 * The approval workflow. A request may only move along these edges; anything
 * else is rejected rather than silently applied.
 */
const REQUEST_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export class TrainingService {
  constructor(
    private readonly requestRepository: TrainingRequestRepository,
    private readonly sessionRepository: TrainingSessionRepository,
    private readonly enrollmentRepository: TrainingEnrollmentRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly studentRepository: StudentRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ------------------------------- requests --------------------------------- */

  async listRequests(options: ListOptions): Promise<PaginatedResult<TrainingRequestDocument>> {
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };
    const allowed = await this.scopeGuard.accessibleDepartmentIds();

    if (allowed) {
      filter.$or = [{ departmentIds: { $in: allowed } }, { departmentIds: { $size: 0 } }];
    }

    return this.requestRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'departmentIds,requestedBy',
    });
  }

  async getRequest(id: string): Promise<TrainingRequestDocument> {
    const request = await this.requestRepository.findByIdOrFail(id, {
      include: 'departmentIds,batchIds,requestedBy,reviewedBy,sessionIds',
    });
    await this.assertRequestVisible(request);
    return request;
  }

  async createRequest(input: CreateTrainingRequestInput): Promise<TrainingRequestDocument> {
    await this.assertRelationsExist(input.departmentIds, input.batchIds);

    const userId = requestContext.get().userId;
    const sequence = await this.requestRepository.nextReference();

    const request = await this.requestRepository.create({
      reference: formatSequence('TR', sequence + 1),
      title: input.title,
      description: input.description,
      trainingType: input.trainingType,
      departmentIds: input.departmentIds.map((id) => new mongoose.Types.ObjectId(id)),
      batchIds: input.batchIds.map((id) => new mongoose.Types.ObjectId(id)),
      expectedParticipants: input.expectedParticipants,
      preferredStartDate: input.preferredStartDate,
      preferredEndDate: input.preferredEndDate,
      durationHours: input.durationHours,
      mode: input.mode,
      topics: input.topics,
      objectives: input.objectives ?? null,
      budget: input.budget ?? null,
      attachments: input.attachments,
      priority: input.priority,
      status: input.status,
      approvalStatus: 'pending',
      requestedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
    } as Partial<TrainingRequestDocument>);

    await this.auditService.log({
      action: 'training.request_created',
      category: 'data',
      entity: { type: 'TrainingRequest', id: request._id, label: request.reference },
    });

    if (request.status === 'submitted') await this.notifyApprovers(request);

    return request;
  }

  async updateRequest(
    id: string,
    input: UpdateTrainingRequestInput,
  ): Promise<TrainingRequestDocument> {
    const existing = await this.requestRepository.findByIdOrFail(id);
    await this.assertRequestVisible(existing);

    // Once a reviewer has acted, the terms of the request are fixed.
    if (!['draft', 'submitted'].includes(existing.status)) {
      throw new BusinessRuleError(
        `A request that is "${existing.status.replace(/_/g, ' ')}" can no longer be edited.`,
      );
    }

    await this.assertRelationsExist(input.departmentIds, input.batchIds);

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('title', input.title);
    assign('description', input.description);
    assign('trainingType', input.trainingType);
    assign('expectedParticipants', input.expectedParticipants);
    assign('preferredStartDate', input.preferredStartDate);
    assign('preferredEndDate', input.preferredEndDate);
    assign('durationHours', input.durationHours);
    assign('mode', input.mode);
    assign('topics', input.topics);
    assign('objectives', input.objectives);
    assign('priority', input.priority);

    if (input.departmentIds) {
      patch.departmentIds = input.departmentIds.map((entry) => new mongoose.Types.ObjectId(entry));
    }
    if (input.batchIds) {
      patch.batchIds = input.batchIds.map((entry) => new mongoose.Types.ObjectId(entry));
    }

    const updated = await this.requestRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'training.request_updated',
      category: 'data',
      entity: { type: 'TrainingRequest', id: updated._id, label: updated.reference },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async submitRequest(id: string): Promise<TrainingRequestDocument> {
    const request = await this.transitionRequest(id, 'submitted', {});
    await this.notifyApprovers(request);
    return request;
  }

  async approveRequest(id: string, comments?: string): Promise<TrainingRequestDocument> {
    const userId = requestContext.get().userId;

    const request = await this.transitionRequest(id, 'approved', {
      approvalStatus: 'approved',
      reviewedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
      reviewedAt: new Date(),
      reviewComments: comments ?? null,
    });

    await this.notifyRequester(
      request,
      'Training request approved',
      `Your request ${request.reference} ("${request.title}") has been approved.`,
    );

    return request;
  }

  async rejectRequest(id: string, reason: string): Promise<TrainingRequestDocument> {
    const userId = requestContext.get().userId;

    const request = await this.transitionRequest(id, 'rejected', {
      approvalStatus: 'rejected',
      reviewedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
      reviewedAt: new Date(),
      rejectionReason: reason,
    });

    // The reason travels with the notification: a bare "rejected" forces the
    // requester to chase someone for the why.
    await this.notifyRequester(
      request,
      'Training request not approved',
      `Your request ${request.reference} was not approved. Reason: ${reason}`,
    );

    return request;
  }

  async cancelRequest(id: string, reason: string): Promise<TrainingRequestDocument> {
    const request = await this.transitionRequest(id, 'cancelled', {
      cancellationReason: reason,
    });

    await this.notifyRequester(
      request,
      'Training request cancelled',
      `Request ${request.reference} was cancelled. Reason: ${reason}`,
    );

    return request;
  }

  /* -------------------------------- sessions -------------------------------- */

  async listSessions(options: ListOptions): Promise<PaginatedResult<TrainingSessionDocument>> {
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };
    const allowed = await this.scopeGuard.accessibleDepartmentIds();

    if (allowed) {
      filter.$or = [{ departmentIds: { $in: allowed } }, { departmentIds: { $size: 0 } }];
    }

    return this.sessionRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'departmentIds,trainerIds',
    });
  }

  async getSession(id: string): Promise<TrainingSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id, {
      include: 'departmentIds,batchIds,trainerIds,requestId',
    });
    await this.assertSessionVisible(session);
    return session;
  }

  /** Detail page: the session, its trainers, its roster and its origin request. */
  async getSessionProfile(id: string) {
    const session = await this.getSession(id);

    const [enrollments, counts] = await Promise.all([
      this.enrollmentRepository.findMany({ sessionId: session._id }, { limit: 500 }),
      this.enrollmentRepository.countBySessionStatus(session._id),
    ]);

    await this.enrollmentRepository.populateRelations(enrollments);

    return {
      session,
      counts: {
        enrolled: counts.enrolled ?? 0,
        completed: counts.completed ?? 0,
        withdrawn: counts.withdrawn ?? 0,
        attended: counts.attended ?? 0,
      },
      seatsRemaining: Math.max(0, session.capacity - session.stats.enrolledCount),
      roster: enrollments.map((enrollment) => ({
        id: String(enrollment._id),
        studentId: String(enrollment.studentId),
        rollNumber:
          enrollment.studentId && typeof enrollment.studentId === 'object'
            ? ((enrollment.studentId as unknown as { rollNumber?: string }).rollNumber ?? '')
            : '',
        name:
          enrollment.studentId && typeof enrollment.studentId === 'object'
            ? populatedName((enrollment.studentId as unknown as { userId?: unknown }).userId)
            : null,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
      })),
      /**
       * Deliberately absent: assessment results and certificates. Those need
       * the Examinations and Certificate modules — see PROJECT_PROGRESS.md.
       */
    };
  }

  async createSession(input: CreateTrainingSessionInput): Promise<TrainingSessionDocument> {
    await this.assertRelationsExist(input.departmentIds, input.batchIds);
    await this.assertTrainersExist(input.trainerIds);

    if (input.requestId) {
      const request = await this.requestRepository.findByIdOrFail(input.requestId);
      if (request.approvalStatus !== 'approved') {
        throw new BusinessRuleError(
          'A session can only be scheduled against an approved request.',
        );
      }
    }

    await this.assertNoTrainerConflict(input.trainerIds, input.startDate, input.endDate);

    const session = await withTransaction(async (transaction) => {
      const created = await this.sessionRepository.create(
        {
          requestId: input.requestId ? new mongoose.Types.ObjectId(input.requestId) : null,
          title: input.title,
          description: input.description ?? null,
          trainingType: input.trainingType,
          departmentIds: input.departmentIds.map((id) => new mongoose.Types.ObjectId(id)),
          batchIds: input.batchIds.map((id) => new mongoose.Types.ObjectId(id)),
          trainerIds: input.trainerIds.map((id) => new mongoose.Types.ObjectId(id)),
          startDate: input.startDate,
          endDate: input.endDate,
          capacity: input.capacity,
          mode: input.mode,
          location: input.location ?? null,
          meetingLink: input.meetingLink ?? null,
          learningObjectives: input.learningObjectives,
          topics: input.topics,
          status: input.status,
        } as Partial<TrainingSessionDocument>,
        transaction,
      );

      // Link back so the request shows what was scheduled against it.
      if (input.requestId) {
        await this.requestRepository.updateById(
          input.requestId,
          { $addToSet: { sessionIds: created._id }, $set: { status: 'scheduled' } },
          { session: transaction },
        );
      }

      return created;
    });

    await this.auditService.log({
      action: 'training.session_created',
      category: 'data',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
    });

    return session;
  }

  async updateSession(
    id: string,
    input: UpdateTrainingSessionInput,
  ): Promise<TrainingSessionDocument> {
    const existing = await this.sessionRepository.findByIdOrFail(id);
    await this.assertSessionVisible(existing);

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new BusinessRuleError(
        `A ${existing.status} session cannot be edited.`,
      );
    }

    await this.assertRelationsExist(input.departmentIds, input.batchIds);
    if (input.trainerIds) await this.assertTrainersExist(input.trainerIds);

    if (input.capacity !== undefined && input.capacity < existing.stats.enrolledCount) {
      throw new BusinessRuleError(
        `This session already has ${existing.stats.enrolledCount} enrolled, so capacity cannot be set to ${input.capacity}.`,
      );
    }

    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;

    if (endDate < startDate) {
      throw new ValidationError('The end date must be on or after the start date.', [
        { field: 'endDate', message: 'Must be on or after the start date' },
      ]);
    }

    if (input.trainerIds || input.startDate || input.endDate) {
      await this.assertNoTrainerConflict(
        (input.trainerIds ?? existing.trainerIds.map(String)),
        startDate,
        endDate,
        id,
      );
    }

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('title', input.title);
    assign('description', input.description);
    assign('trainingType', input.trainingType);
    assign('startDate', input.startDate);
    assign('endDate', input.endDate);
    assign('capacity', input.capacity);
    assign('mode', input.mode);
    assign('location', input.location);
    assign('meetingLink', input.meetingLink);
    assign('learningObjectives', input.learningObjectives);
    assign('topics', input.topics);
    assign('status', input.status);

    for (const key of ['departmentIds', 'batchIds', 'trainerIds'] as const) {
      const value = input[key];
      if (value !== undefined) {
        patch[key] = value.map((entry) => new mongoose.Types.ObjectId(entry));
      }
    }

    const updated = await this.sessionRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'training.session_updated',
      category: 'data',
      entity: { type: 'TrainingSession', id: updated._id, label: updated.title },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async cancelSession(id: string, reason: string): Promise<TrainingSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id);
    await this.assertSessionVisible(session);

    if (session.status === 'completed') {
      throw new InvalidStateTransitionError('completed', 'cancelled', 'training session');
    }

    const updated = await this.sessionRepository.updateByIdOrFail(id, {
      $set: { status: 'cancelled', cancellationReason: reason },
    });

    // Everyone enrolled needs to know, not just the organiser.
    const studentIds = await this.enrollmentRepository.findStudentIds(session._id);
    if (studentIds.length > 0) {
      const students = await this.studentRepository.findMany({
        _id: { $in: studentIds.map((entry) => new mongoose.Types.ObjectId(entry)) },
      });

      await this.notificationService.notifySafely({
        userIds: students.map((student) => student.userId),
        type: 'training.session_cancelled',
        category: 'academic',
        priority: 'high',
        title: 'A training session was cancelled',
        message: `"${session.title}" has been cancelled. Reason: ${reason}`,
        entity: { type: 'TrainingSession', id: session._id },
      });
    }

    await this.auditService.log({
      action: 'training.session_cancelled',
      category: 'data',
      severity: 'warning',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
      metadata: { reason, notified: studentIds.length },
    });

    return updated;
  }

  async completeSession(
    id: string,
    input: CompleteSessionInput,
  ): Promise<TrainingSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id);
    await this.assertSessionVisible(session);

    if (session.status === 'cancelled') {
      throw new InvalidStateTransitionError('cancelled', 'completed', 'training session');
    }

    const completedIds = input.completedStudentIds.map((entry) => new mongoose.Types.ObjectId(entry));

    const updated = await withTransaction(async (transaction) => {
      const completed = await this.enrollmentRepository.markCompleted(
        session._id,
        completedIds,
        transaction,
      );

      const result = await this.sessionRepository.updateById(
        id,
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            feedbackScore: input.feedbackScore ?? null,
            report: input.report ?? null,
            'stats.completedCount': completed,
          },
        },
        { session: transaction },
      );

      if (!result) throw new NotFoundError('Training session');

      if (session.requestId) {
        await this.requestRepository.updateById(
          session.requestId,
          { $set: { status: 'completed' } },
          { session: transaction },
        );
      }

      return result;
    });

    await this.auditService.log({
      action: 'training.session_completed',
      category: 'data',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
      metadata: { completed: completedIds.length, feedbackScore: input.feedbackScore },
    });

    return updated;
  }

  async deleteSession(id: string): Promise<{ id: string; deletedAt: Date }> {
    const session = await this.sessionRepository.findByIdOrFail(id);
    await this.assertSessionVisible(session);

    if (session.stats.enrolledCount > 0) {
      throw new BusinessRuleError(
        `This session has ${session.stats.enrolledCount} enrolled student(s). Cancel it instead of deleting.`,
      );
    }

    const deleted = await this.sessionRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Training session');

    await this.auditService.log({
      action: 'training.session_deleted',
      category: 'data',
      severity: 'warning',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* ------------------------------- enrolment -------------------------------- */

  async enrolStudents(sessionId: string, input: EnrollStudentsInput): Promise<{
    enrolled: number;
    skipped: number;
    seatsRemaining: number;
  }> {
    const session = await this.sessionRepository.findByIdOrFail(sessionId);
    await this.assertSessionVisible(session);

    if (session.status !== 'scheduled' && session.status !== 'in_progress') {
      throw new BusinessRuleError(
        `Students cannot be enrolled in a ${session.status} session.`,
      );
    }

    // Resolve batches into their active students, then merge with the
    // explicitly named ones.
    const candidateIds = new Set(input.studentIds);

    if (input.batchIds.length > 0) {
      for (const batchId of input.batchIds) {
        const ids = await this.studentRepository.findIdsByBatch(
          new mongoose.Types.ObjectId(batchId),
        );
        for (const id of ids) candidateIds.add(String(id));
      }
    }

    const students = await this.studentRepository.findMany({
      _id: { $in: [...candidateIds].map((entry) => new mongoose.Types.ObjectId(entry)) },
      status: { $in: ['active', 'on_leave'] },
    });

    if (students.length === 0) {
      throw new ValidationError('None of those students could be enrolled.', [
        { field: 'studentIds', message: 'No active students matched' },
      ]);
    }

    // Already-enrolled students are skipped, not counted against capacity twice.
    const existing = new Set(await this.enrollmentRepository.findStudentIds(session._id));
    const toEnrol = students.filter((student) => !existing.has(String(student._id)));

    const seatsRemaining = session.capacity - session.stats.enrolledCount;

    if (toEnrol.length > seatsRemaining) {
      throw new BusinessRuleError(
        `Only ${seatsRemaining} seat(s) remain but ${toEnrol.length} student(s) were selected.`,
      );
    }

    const enrolledBy = requestContext.get().userId;

    await withTransaction(async (transaction) => {
      await this.enrollmentRepository.enrolMany(
        session._id,
        toEnrol.map((student) => ({ studentId: student._id, batchId: student.batchId })),
        enrolledBy ? new mongoose.Types.ObjectId(enrolledBy) : null,
        transaction,
      );

      await this.sessionRepository.adjustStats(
        session._id,
        { enrolledCount: toEnrol.length },
        transaction,
      );
    });

    await this.notificationService.notifySafely({
      userIds: toEnrol.map((student) => student.userId),
      type: 'training.enrolled',
      category: 'academic',
      title: 'You have been enrolled in a training',
      message: `You are enrolled in "${session.title}".`,
      entity: { type: 'TrainingSession', id: session._id },
    });

    await this.auditService.log({
      action: 'training.students_enrolled',
      category: 'data',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
      metadata: { enrolled: toEnrol.length, skipped: students.length - toEnrol.length },
    });

    return {
      enrolled: toEnrol.length,
      skipped: students.length - toEnrol.length,
      seatsRemaining: seatsRemaining - toEnrol.length,
    };
  }

  async withdrawStudents(
    sessionId: string,
    studentIds: string[],
    reason?: string,
  ): Promise<{ withdrawn: number }> {
    const session = await this.sessionRepository.findByIdOrFail(sessionId);
    await this.assertSessionVisible(session);

    const ids = studentIds.map((entry) => new mongoose.Types.ObjectId(entry));

    const withdrawn = await withTransaction(async (transaction) => {
      const count = await this.enrollmentRepository.withdrawMany(
        session._id,
        ids,
        reason ?? null,
        transaction,
      );

      await this.sessionRepository.adjustStats(
        session._id,
        { enrolledCount: -count, withdrawnCount: count },
        transaction,
      );

      return count;
    });

    await this.auditService.log({
      action: 'training.students_withdrawn',
      category: 'data',
      entity: { type: 'TrainingSession', id: session._id, label: session.title },
      metadata: { withdrawn, reason },
    });

    return { withdrawn };
  }

  /* -------------------------- calendar and analytics ------------------------- */

  async calendar(from: Date, to: Date, filters: Record<string, unknown> = {}) {
    const filter: Record<string, unknown> = { ...filters };
    const allowed = await this.scopeGuard.accessibleDepartmentIds();

    if (allowed) {
      filter.$or = [{ departmentIds: { $in: allowed } }, { departmentIds: { $size: 0 } }];
    }

    const sessions = await this.sessionRepository.findInRange(from, to, filter);
    await this.sessionRepository.populateRelations(sessions);

    return sessions.map((session) => ({
      id: String(session._id),
      title: session.title,
      trainingType: session.trainingType,
      startDate: session.startDate,
      endDate: session.endDate,
      mode: session.mode,
      location: session.location,
      status: session.status,
      capacity: session.capacity,
      enrolledCount: session.stats.enrolledCount,
      trainers: session.trainerIds.map((trainer) =>
        typeof trainer === 'object' && trainer !== null
          ? (populatedName((trainer as unknown as { userId?: unknown }).userId) ?? '')
          : '',
      ),
    }));
  }

  async analytics() {
    const [requestCounts, sessionCounts, upcoming, completion] = await Promise.all([
      this.requestRepository.countByStatus(),
      this.sessionRepository.countByStatus(),
      this.sessionRepository.count({
        startDate: { $gte: new Date() },
        status: 'scheduled',
      }),
      this.sessionRepository.aggregate<{
        _id: null;
        totalEnrolled: number;
        totalCompleted: number;
        avgFeedback: number | null;
      }>([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            totalEnrolled: { $sum: '$stats.enrolledCount' },
            totalCompleted: { $sum: '$stats.completedCount' },
            avgFeedback: { $avg: '$feedbackScore' },
          },
        },
      ]),
    ]);

    const totals = completion[0];

    return {
      requests: {
        total: Object.values(requestCounts).reduce((sum, count) => sum + count, 0),
        pending: (requestCounts.submitted ?? 0) + (requestCounts.under_review ?? 0),
        approved: requestCounts.approved ?? 0,
        rejected: requestCounts.rejected ?? 0,
        byStatus: requestCounts,
      },
      sessions: {
        total: Object.values(sessionCounts).reduce((sum, count) => sum + count, 0),
        scheduled: sessionCounts.scheduled ?? 0,
        inProgress: sessionCounts.in_progress ?? 0,
        completed: sessionCounts.completed ?? 0,
        upcoming,
        byStatus: sessionCounts,
      },
      completion: {
        totalEnrolled: totals?.totalEnrolled ?? 0,
        totalCompleted: totals?.totalCompleted ?? 0,
        // Percentage of enrolled students who finished, across completed sessions.
        completionRate:
          totals && totals.totalEnrolled > 0
            ? Math.round((totals.totalCompleted / totals.totalEnrolled) * 1000) / 10
            : 0,
        averageFeedback: totals?.avgFeedback ? Math.round(totals.avgFeedback * 10) / 10 : null,
      },
    };
  }

  async exportSessions(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<TrainingSessionDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (allowed) {
      query.$or = [{ departmentIds: { $in: allowed } }, { departmentIds: { $size: 0 } }];
    }

    const sessions = await this.sessionRepository.findMany(query, {
      sort: '-startDate',
      limit: 2000,
    });

    await this.sessionRepository.populateRelations(sessions);

    await this.auditService.log({
      action: 'training.exported',
      category: 'data',
      metadata: { rows: sessions.length },
    });

    return sessions;
  }

  async bulkDeleteSessions(ids: string[]): Promise<BulkOperationResult> {
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
        await this.deleteSession(id);
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

  /* -------------------------------- internals -------------------------------- */

  private async transitionRequest(
    id: string,
    next: string,
    patch: Record<string, unknown>,
  ): Promise<TrainingRequestDocument> {
    const request = await this.requestRepository.findByIdOrFail(id);
    await this.assertRequestVisible(request);

    const allowed = REQUEST_TRANSITIONS[request.status] ?? [];

    if (!allowed.includes(next)) {
      throw new InvalidStateTransitionError(request.status, next, 'training request');
    }

    const updated = await this.requestRepository.updateByIdOrFail(id, {
      $set: { status: next, ...patch },
    });

    await this.auditService.log({
      action: `training.request_${next}`,
      category: 'admin',
      severity: next === 'rejected' || next === 'cancelled' ? 'warning' : 'info',
      entity: { type: 'TrainingRequest', id: updated._id, label: updated.reference },
      changes: [{ field: 'status', from: request.status, to: next }],
      metadata: patch,
    });

    return updated;
  }

  private async assertRequestVisible(request: TrainingRequestDocument): Promise<void> {
    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (!allowed) return;
    if (request.departmentIds.length === 0) return;

    const allowedSet = new Set(allowed.map(String));
    if (!request.departmentIds.some((id) => allowedSet.has(String(id)))) {
      // 404 rather than 403: a 403 would confirm the request exists.
      throw new NotFoundError('Training request');
    }
  }

  private async assertSessionVisible(session: TrainingSessionDocument): Promise<void> {
    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (!allowed) return;
    if (session.departmentIds.length === 0) return;

    const allowedSet = new Set(allowed.map(String));
    if (!session.departmentIds.some((id) => allowedSet.has(String(id)))) {
      throw new NotFoundError('Training session');
    }
  }

  private async assertRelationsExist(
    departmentIds?: string[],
    batchIds?: string[],
  ): Promise<void> {
    if (departmentIds?.length) {
      const departments = await this.departmentRepository.findMany({
        _id: { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (departments.length !== departmentIds.length) {
        throw new ValidationError('One or more departments could not be found.', [
          { field: 'departmentIds', message: 'Unknown department' },
        ]);
      }
    }

    if (batchIds?.length) {
      const batches = await this.batchRepository.findMany({
        _id: { $in: batchIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (batches.length !== batchIds.length) {
        throw new ValidationError('One or more batches could not be found.', [
          { field: 'batchIds', message: 'Unknown batch' },
        ]);
      }
    }
  }

  private async assertTrainersExist(trainerIds: string[]): Promise<void> {
    if (trainerIds.length === 0) return;

    const trainers = await this.facultyRepository.findMany({
      _id: { $in: trainerIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: 'active',
    });

    if (trainers.length !== trainerIds.length) {
      throw new ValidationError('One or more trainers could not be found or are inactive.', [
        { field: 'trainerIds', message: 'Unknown or inactive staff member' },
      ]);
    }
  }

  /**
   * A trainer double-booked across two overlapping sessions is a scheduling
   * error that surfaces on the day, so it is caught here instead.
   */
  private async assertNoTrainerConflict(
    trainerIds: string[],
    startDate: Date,
    endDate: Date,
    excludeSessionId?: string,
  ): Promise<void> {
    if (trainerIds.length === 0) return;

    const conflicts = await this.sessionRepository.findTrainerConflicts(
      trainerIds.map((id) => new mongoose.Types.ObjectId(id)),
      startDate,
      endDate,
      excludeSessionId,
    );

    if (conflicts.length > 0) {
      throw new BusinessRuleError(
        `A selected trainer is already committed to "${conflicts[0]!.title}" during those dates.`,
      );
    }
  }

  private async notifyApprovers(request: TrainingRequestDocument): Promise<void> {
    const hods = await this.departmentRepository.findMany({
      _id: { $in: request.departmentIds },
    });

    const approverIds = hods
      .map((department) => department.hodId)
      .filter((id): id is mongoose.Types.ObjectId => id !== null);

    if (approverIds.length === 0) return;

    await this.notificationService.notifySafely({
      userIds: approverIds,
      type: 'training.request_submitted',
      category: 'academic',
      priority: request.priority === 'urgent' ? 'urgent' : 'normal',
      title: 'A training request needs review',
      message: `${request.reference}: "${request.title}" is awaiting approval.`,
      actionUrl: `/college/training/requests/${String(request._id)}`,
      entity: { type: 'TrainingRequest', id: request._id },
    });
  }

  private async notifyRequester(
    request: TrainingRequestDocument,
    title: string,
    message: string,
  ): Promise<void> {
    if (!request.requestedBy) return;

    await this.notificationService.notifySafely({
      userIds: [request.requestedBy],
      type: 'training.request_reviewed',
      category: 'academic',
      title,
      message,
      actionUrl: `/college/training/requests/${String(request._id)}`,
      entity: { type: 'TrainingRequest', id: request._id },
    });
  }
}
