import type {
  AttendanceReportQuery,
  CreateAttendanceSessionInput,
  MarkAttendanceInput,
  UpdateAttendanceRecordInput,
} from '@peacefic/shared';
import { calculatePercentage } from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { config } from '@/config/env';
import { requestContext } from '@/config/request-context';
import {
  AuthorizationError,
  BusinessRuleError,
  DuplicateResourceError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { AttendanceRecordDocument } from '@/models/attendance-record.model';
import type { AttendanceSessionDocument } from '@/models/attendance-session.model';
import type {
  AttendanceCounts,
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AttendanceSummaryRepository,
} from '@/repositories/attendance.repository';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import { monthKey, semesterKey, startOfUtcDay, toUtcDateOnly } from '@/utils/date';

export interface MarkResult {
  sessionId: string;
  stats: AttendanceSessionDocument['stats'];
  belowThreshold: Array<{ studentId: string; rollNumber: string; percentage: number }>;
}

export class AttendanceService {
  constructor(
    private readonly sessionRepository: AttendanceSessionRepository,
    private readonly recordRepository: AttendanceRecordRepository,
    private readonly summaryRepository: AttendanceSummaryRepository,
    private readonly studentRepository: StudentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* -------------------------------- sessions ------------------------------- */

  async listSessions(options: ListOptions): Promise<PaginatedResult<AttendanceSessionDocument>> {
    const allowedBatches = await this.scopeGuard.accessibleBatchIds();
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };

    if (allowedBatches) filter.batchId = { $in: allowedBatches };

    return this.sessionRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'batchId,markedByFacultyId',
    });
  }

  async getSession(id: string): Promise<AttendanceSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id, { include: 'batchId' });
    await this.scopeGuard.assertCanAccessBatch(session.batchId);
    return session;
  }

  async createSession(input: CreateAttendanceSessionInput): Promise<AttendanceSessionDocument> {
    await this.scopeGuard.assertCanAccessBatch(input.batchId);
    const batch = await this.batchRepository.findByIdOrFail(input.batchId);

    const date = toUtcDateOnly(input.date);

    // Attendance cannot be recorded for a day that has not happened.
    if (date.getTime() > startOfUtcDay().getTime()) {
      throw new BusinessRuleError('Attendance cannot be scheduled for marking on a future date.');
    }

    const periodNumber = input.periodNumber ?? null;

    if (
      await this.sessionRepository.sessionExists(
        batch._id,
        date,
        periodNumber,
        input.context,
        input.contextId ?? null,
      )
    ) {
      throw new DuplicateResourceError(
        'A session already exists for that batch, date and period.',
        [{ field: 'periodNumber', message: 'Already recorded' }],
      );
    }

    const faculty = await this.currentFacultyOrNull();

    const session = await this.sessionRepository.create({
      batchId: batch._id,
      courseId: input.courseId ? new mongoose.Types.ObjectId(input.courseId) : null,
      date,
      periodNumber,
      startTime: input.startTime,
      endTime: input.endTime,
      type: input.type,
      context: input.context,
      contextId: input.contextId ? new mongoose.Types.ObjectId(input.contextId) : null,
      topic: input.topic ?? null,
      markedByFacultyId: faculty?._id ?? null,
      source: 'manual',
      status: 'pending_marking',
      stats: {
        totalStudents: batch.stats.totalStudents,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0,
        onDutyCount: 0,
        percentage: 0,
      },
    } as Partial<AttendanceSessionDocument>);

    await this.auditService.log({
      action: AUDIT_ACTIONS.ATTENDANCE_SESSION_CREATED,
      category: 'data',
      entity: { type: 'AttendanceSession', id: session._id, label: batch.code },
    });

    return session;
  }

  /**
   * Marks the whole roster in one request. A 60-student roster must never be
   * 60 separate mutations.
   */
  async markSession(sessionId: string, input: MarkAttendanceInput): Promise<MarkResult> {
    const session = await this.sessionRepository.findByIdOrFail(sessionId);
    await this.scopeGuard.assertCanAccessBatch(session.batchId);

    if (session.status === 'cancelled') {
      throw new BusinessRuleError('That session was cancelled and cannot be marked.');
    }

    if (session.isLocked) {
      throw new BusinessRuleError(
        'That session is locked. An administrator must unlock it before it can be changed.',
      );
    }

    // Every submitted student must actually be enrolled in the batch.
    const enrolledIds = await this.studentRepository.findIdsByBatch(session.batchId);
    const enrolled = new Set(enrolledIds.map(String));

    const unknown = input.entries.filter((entry) => !enrolled.has(entry.studentId));
    if (unknown.length > 0) {
      throw new ValidationError('Some students are not enrolled in this batch.', [
        {
          field: 'entries',
          message: `Not in this batch: ${unknown.slice(0, 5).map((e) => e.studentId).join(', ')}`,
        },
      ]);
    }

    const duplicates = input.entries.length - new Set(input.entries.map((e) => e.studentId)).size;
    if (duplicates > 0) {
      throw new ValidationError('The same student appears more than once.', [
        { field: 'entries', message: 'Duplicate student entries' },
      ]);
    }

    const faculty = await this.currentFacultyOrNull();
    const actorId = new mongoose.Types.ObjectId(requestContext.get().userId as string);
    const counts = this.tally(input.entries.map((entry) => entry.status));

    await withTransaction(async (transaction) => {
      await this.recordRepository.upsertSessionRecords(
        session._id,
        session.batchId,
        session.date,
        input.entries.map((entry) => ({
          studentId: new mongoose.Types.ObjectId(entry.studentId),
          status: entry.status,
          remarks: entry.remarks ?? null,
        })),
        actorId,
        transaction,
      );

      await this.sessionRepository.updateStats(session._id, counts, transaction);

      await this.sessionRepository.updateById(
        session._id,
        {
          $set: {
            status: input.lockAfterMarking ? 'locked' : 'marked',
            isLocked: input.lockAfterMarking,
            lockedAt: input.lockAfterMarking ? new Date() : null,
            markedAt: new Date(),
            markedByFacultyId: faculty?._id ?? session.markedByFacultyId,
          },
        },
        { session: transaction },
      );
    });

    // Summaries are the read path for every attendance figure in the product,
    // so they are refreshed as part of marking rather than lazily.
    const belowThreshold = await this.refreshSummariesForBatch(session.batchId);

    await this.auditService.log({
      action: AUDIT_ACTIONS.ATTENDANCE_MARKED,
      category: 'data',
      entity: { type: 'AttendanceSession', id: session._id },
      metadata: { marked: input.entries.length, ...counts },
    });

    await this.warnStudentsBelowThreshold(belowThreshold);

    const updated = await this.sessionRepository.findByIdOrFail(sessionId);

    return {
      sessionId: String(session._id),
      stats: updated.stats,
      belowThreshold,
    };
  }

  /** Correcting one record after the fact, with a mandatory reason. */
  async correctRecord(
    sessionId: string,
    recordId: string,
    input: UpdateAttendanceRecordInput,
  ): Promise<AttendanceRecordDocument> {
    const session = await this.sessionRepository.findByIdOrFail(sessionId);
    await this.scopeGuard.assertCanAccessBatch(session.batchId);

    const record = await this.recordRepository.findByIdOrFail(recordId);
    if (String(record.sessionId) !== String(session._id)) {
      throw new NotFoundError('Attendance record');
    }

    if (session.isLocked && !this.canOverrideLock()) {
      throw new AuthorizationError(
        'That session is locked. Changing it requires the override permission.',
      );
    }

    if (record.status === input.status) {
      throw new BusinessRuleError('That record already has this status.');
    }

    const actorId = new mongoose.Types.ObjectId(requestContext.get().userId as string);

    const updated = await this.recordRepository.updateByIdOrFail(recordId, {
      $set: { status: input.status, remarks: input.remarks ?? record.remarks },
      $push: {
        modifiedHistory: {
          from: record.status,
          to: input.status,
          by: actorId,
          at: new Date(),
          reason: input.reason,
        },
      },
    });

    const records = await this.recordRepository.findBySession(session._id);
    await this.sessionRepository.updateStats(
      session._id,
      this.tally(records.map((r) => r.status)),
    );

    const belowThreshold = await this.refreshSummariesForBatch(session.batchId);

    await this.auditService.log({
      action: AUDIT_ACTIONS.ATTENDANCE_CORRECTED,
      category: 'data',
      severity: 'warning',
      entity: { type: 'AttendanceRecord', id: updated._id },
      changes: [{ field: 'status', from: record.status, to: input.status }],
      metadata: { reason: input.reason, sessionId: String(session._id) },
    });

    await this.warnStudentsBelowThreshold(belowThreshold);

    return updated;
  }

  async lockSession(id: string): Promise<AttendanceSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessBatch(session.batchId);

    if (session.status === 'pending_marking') {
      throw new BusinessRuleError('That session has not been marked yet.');
    }
    if (session.isLocked) {
      throw new BusinessRuleError('That session is already locked.');
    }

    const updated = await this.sessionRepository.updateByIdOrFail(id, {
      $set: { isLocked: true, lockedAt: new Date(), status: 'locked' },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.ATTENDANCE_LOCKED,
      category: 'data',
      entity: { type: 'AttendanceSession', id: updated._id },
    });

    return updated;
  }

  async unlockSession(id: string, reason: string): Promise<AttendanceSessionDocument> {
    const session = await this.sessionRepository.findByIdOrFail(id);
    await this.scopeGuard.assertCanAccessBatch(session.batchId);

    if (!session.isLocked) {
      throw new BusinessRuleError('That session is not locked.');
    }

    const updated = await this.sessionRepository.updateByIdOrFail(id, {
      $set: { isLocked: false, lockedAt: null, status: 'marked' },
    });

    // Unlocking is the escape hatch on an immutability rule, so it is always
    // recorded at warning severity with the stated reason.
    await this.auditService.log({
      action: AUDIT_ACTIONS.ATTENDANCE_UNLOCKED,
      category: 'admin',
      severity: 'warning',
      entity: { type: 'AttendanceSession', id: updated._id },
      metadata: { reason },
    });

    return updated;
  }

  /** The roster for a marking sheet, with any existing marks pre-filled. */
  async getSessionSheet(sessionId: string) {
    const session = await this.getSession(sessionId);

    const [students, records] = await Promise.all([
      this.studentRepository.findByBatch(session.batchId),
      this.recordRepository.findBySession(session._id),
    ]);

    const byStudent = new Map(records.map((record) => [String(record.studentId), record]));

    return {
      session: {
        id: String(session._id),
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        type: session.type,
        topic: session.topic,
        status: session.status,
        isLocked: session.isLocked,
        stats: session.stats,
      },
      roster: students.map((student) => {
        const record = byStudent.get(String(student._id));
        return {
          studentId: String(student._id),
          rollNumber: student.rollNumber,
          status: record?.status ?? null,
          remarks: record?.remarks ?? null,
          recordId: record ? String(record._id) : null,
        };
      }),
    };
  }

  /* --------------------------------- reads --------------------------------- */

  async getStudentAttendance(
    studentId: string,
    options: { from?: Date; to?: Date; period?: 'month' | 'semester' | 'overall' } = {},
  ) {
    await this.scopeGuard.assertCanAccessStudent(studentId);
    return this.buildStudentAttendance(studentId, options);
  }

  /** Student-portal read: the id comes from the token, never the client. */
  async getOwnAttendance(options: { from?: Date; to?: Date } = {}) {
    const student = await this.scopeGuard.requireOwnStudent();
    return this.buildStudentAttendance(String(student._id), options);
  }

  private async buildStudentAttendance(
    studentId: string,
    options: { from?: Date; to?: Date; period?: 'month' | 'semester' | 'overall' } = {},
  ) {
    const student = await this.studentRepository.findByIdOrFail(studentId);
    const threshold = await this.thresholdFor();

    const [records, summary] = await Promise.all([
      this.recordRepository.findByStudentRange(student._id, options.from, options.to),
      this.summaryRepository.findForStudent(student._id, 'overall', 'overall'),
    ]);

    const counts =
      options.from || options.to
        ? this.tally(records.map((r) => r.status))
        : this.countsFromSummary(summary);

    const attended = counts.present + counts.late + counts.onDuty;
    const percentage = calculatePercentage(attended, counts.total);

    return {
      studentId: String(student._id),
      rollNumber: student.rollNumber,
      threshold,
      percentage,
      isBelowThreshold: counts.total > 0 && percentage < threshold,
      counts,
      // The number students actually want: how many more sessions to recover.
      sessionsNeededForThreshold: this.sessionsNeeded(attended, counts.total, threshold),
      sessions: records.map((record) => ({
        id: String(record._id),
        sessionId: String(record.sessionId),
        date: record.date,
        status: record.status,
        remarks: record.remarks,
        wasModified: record.modifiedHistory.length > 0,
      })),
    };
  }

  async batchReport(batchId: string, query: AttendanceReportQuery) {
    await this.scopeGuard.assertCanAccessBatch(batchId);
    const batch = await this.batchRepository.findByIdOrFail(batchId);
    const threshold = query.threshold ?? (await this.thresholdFor());

    const [counts, perStudent, students] = await Promise.all([
      this.recordRepository.countsForBatch(batch._id, query.from, query.to),
      this.recordRepository.aggregateByStudent({ batchId: batch._id }),
      this.studentRepository.findByBatch(batch._id),
    ]);

    const rollNumbers = new Map(students.map((s) => [String(s._id), s.rollNumber]));

    const rows = perStudent
      .map((entry) => {
        const attended = entry.counts.present + entry.counts.late + entry.counts.onDuty;
        const percentage = calculatePercentage(attended, entry.counts.total);
        return {
          studentId: entry.studentId,
          rollNumber: rollNumbers.get(entry.studentId) ?? 'unknown',
          percentage,
          isBelowThreshold: entry.counts.total > 0 && percentage < threshold,
          ...entry.counts,
        };
      })
      .sort((a, b) => a.percentage - b.percentage);

    const attended = counts.present + counts.late + counts.onDuty;

    return {
      batch: { id: String(batch._id), name: batch.name, code: batch.code },
      threshold,
      overallPercentage: calculatePercentage(attended, counts.total),
      counts,
      defaulterCount: rows.filter((row) => row.isBelowThreshold).length,
      students: rows,
    };
  }

  async defaulters(query: AttendanceReportQuery) {
    const threshold = query.threshold ?? (await this.thresholdFor());
    const allowedBatches = await this.scopeGuard.accessibleBatchIds();

    const filter: Record<string, unknown> = {};
    if (query.batchId) filter.batchId = new mongoose.Types.ObjectId(query.batchId);
    else if (allowedBatches) filter.batchId = { $in: allowedBatches };

    const summaries = await this.summaryRepository.findDefaulters(threshold, filter);
    const students = await this.studentRepository.findMany({
      _id: { $in: summaries.map((summary) => summary.studentId) },
    });

    const byId = new Map(students.map((student) => [String(student._id), student]));

    return {
      threshold,
      count: summaries.length,
      students: summaries.map((summary) => {
        const student = byId.get(String(summary.studentId));
        return {
          studentId: String(summary.studentId),
          rollNumber: student?.rollNumber ?? 'unknown',
          batchId: String(summary.batchId),
          percentage: summary.percentage,
          totalSessions: summary.totalSessions,
          presentCount: summary.presentCount,
          absentCount: summary.absentCount,
          sessionsNeededForThreshold: this.sessionsNeeded(
            summary.presentCount + summary.lateCount + summary.onDutyCount,
            summary.totalSessions,
            threshold,
          ),
        };
      }),
    };
  }

  async trend(from: Date, to: Date, batchId?: string) {
    const allowedBatches = await this.scopeGuard.accessibleBatchIds();
    const filter: Record<string, unknown> = {};

    if (batchId) {
      await this.scopeGuard.assertCanAccessBatch(batchId);
      filter.batchId = new mongoose.Types.ObjectId(batchId);
    } else if (allowedBatches) {
      filter.batchId = { $in: allowedBatches };
    }

    return this.recordRepository.dailyTrend(from, to, filter);
  }

  /* -------------------------------- internals ------------------------------ */

  /**
   * Rebuilds every summary for a batch from the records. Returns the students
   * who are now below the college threshold.
   */
  async refreshSummariesForBatch(
    batchId: mongoose.Types.ObjectId,
  ): Promise<Array<{ studentId: string; rollNumber: string; percentage: number }>> {
    const threshold = await this.thresholdFor();
    const perStudent = await this.recordRepository.aggregateByStudent({ batchId });

    if (perStudent.length === 0) return [];

    const batch = await this.batchRepository.findById(batchId);
    const students = await this.studentRepository.findMany({
      _id: { $in: perStudent.map((entry) => new mongoose.Types.ObjectId(entry.studentId)) },
    });
    const rollNumbers = new Map(students.map((s) => [String(s._id), s.rollNumber]));

    const below: Array<{ studentId: string; rollNumber: string; percentage: number }> = [];

    for (const entry of perStudent) {
      const studentId = new mongoose.Types.ObjectId(entry.studentId);

      await this.summaryRepository.upsert(
        studentId,
        batchId,
        'overall',
        'overall',
        entry.counts,
        threshold,
      );

      if (batch) {
        await this.summaryRepository.upsert(
          studentId,
          batchId,
          'semester',
          semesterKey(batch.currentSemester),
          entry.counts,
          threshold,
        );
      }

      const attended = entry.counts.present + entry.counts.late + entry.counts.onDuty;
      const percentage = calculatePercentage(attended, entry.counts.total);

      if (entry.counts.total > 0 && percentage < threshold) {
        below.push({
          studentId: entry.studentId,
          rollNumber: rollNumbers.get(entry.studentId) ?? 'unknown',
          percentage,
        });
      }
    }

    return below;
  }

  /** Rebuilds the current month's summary. Used by the nightly job. */
  async refreshMonthlySummary(batchId: mongoose.Types.ObjectId, month: Date): Promise<void> {
    const threshold = await this.thresholdFor();
    const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

    const perStudent = await this.recordRepository.aggregateByStudent({
      batchId,
      date: { $gte: start, $lt: end },
    });

    for (const entry of perStudent) {
      await this.summaryRepository.upsert(
        new mongoose.Types.ObjectId(entry.studentId),
        batchId,
        'month',
        monthKey(start),
        entry.counts,
        threshold,
      );
    }
  }

  private async warnStudentsBelowThreshold(
    below: Array<{ studentId: string; rollNumber: string; percentage: number }>,
  ): Promise<void> {
    if (below.length === 0) return;

    const threshold = await this.thresholdFor();
    const students = await this.studentRepository.findMany({
      _id: { $in: below.map((entry) => new mongoose.Types.ObjectId(entry.studentId)) },
    });

    for (const student of students) {
      const entry = below.find((item) => item.studentId === String(student._id));
      if (!entry) continue;

      await this.notificationService.notifySafely({
        userIds: [student.userId],
        type: 'attendance.below_threshold',
        category: 'attendance',
        priority: 'high',
        title: 'Your attendance is below the required level',
        message: `Your attendance is ${entry.percentage}%, below the required ${threshold}%.`,
        actionUrl: '/student/attendance',
        actionLabel: 'View attendance',
        entity: { type: 'Student', id: student._id },
        email: {
          template: 'attendance-warning',
          data: {
            percentage: entry.percentage,
            threshold,
            sessionsNeeded: this.sessionsNeeded(0, 0, threshold),
          },
        },
      });
    }
  }

  private async thresholdFor(): Promise<number> {
    const collegeId = requestContext.get().collegeId;
    if (!collegeId) return config.rules.defaultAttendanceThreshold;

    return this.collegeRepository.getAttendanceThreshold(
      new mongoose.Types.ObjectId(collegeId),
    );
  }

  private async currentFacultyOrNull() {
    const userId = requestContext.get().userId;
    if (!userId) return null;
    return this.facultyRepository.findByUserId(userId);
  }

  private canOverrideLock(): boolean {
    const permissions = requestContext.get().permissions;
    return permissions.includes('attendance:override_lock') || permissions.includes('*:*');
  }

  private tally(statuses: string[]): AttendanceCounts {
    const counts: AttendanceCounts = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      onDuty: 0,
      total: statuses.length,
    };

    for (const status of statuses) {
      if (status === 'present') counts.present += 1;
      else if (status === 'absent') counts.absent += 1;
      else if (status === 'late') counts.late += 1;
      else if (status === 'excused') counts.excused += 1;
      else if (status === 'on_duty') counts.onDuty += 1;
    }

    return counts;
  }

  private countsFromSummary(
    summary: { presentCount: number; absentCount: number; lateCount: number; excusedCount: number; onDutyCount: number; totalSessions: number } | null,
  ): AttendanceCounts {
    if (!summary) {
      return { present: 0, absent: 0, late: 0, excused: 0, onDuty: 0, total: 0 };
    }

    return {
      present: summary.presentCount,
      absent: summary.absentCount,
      late: summary.lateCount,
      excused: summary.excusedCount,
      onDuty: summary.onDutyCount,
      total: summary.totalSessions,
    };
  }

  /**
   * How many consecutive future sessions must be attended to reach the
   * threshold. Solves (attended + n) / (total + n) >= threshold/100.
   */
  private sessionsNeeded(attended: number, total: number, threshold: number): number {
    if (total === 0) return 0;
    if (calculatePercentage(attended, total) >= threshold) return 0;
    if (threshold >= 100) return Number.POSITIVE_INFINITY;

    const ratio = threshold / 100;
    const needed = Math.ceil((ratio * total - attended) / (1 - ratio));
    return Math.max(0, needed);
  }
}
