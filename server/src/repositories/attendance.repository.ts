import type { AttendanceStatus } from '@peacefic/shared';
import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import {
  AttendanceRecordModel,
  type AttendanceRecordDocument,
} from '@/models/attendance-record.model';
import {
  AttendanceSessionModel,
  type AttendanceSessionDocument,
} from '@/models/attendance-session.model';
import {
  AttendanceSummaryModel,
  type AttendanceSummaryDocument,
  type SummaryPeriod,
} from '@/models/attendance-summary.model';


export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
  onDuty: number;
  total: number;
}

export class AttendanceSessionRepository extends BaseRepository<AttendanceSessionDocument> {
  constructor() {
    super(AttendanceSessionModel, {
      tenantScoped: true,
      sortableFields: ['date', 'createdAt', 'startTime', 'status'],
      searchableFields: ['topic'],
      filterableFields: [
        'batchId',
        'courseId',
        'status',
        'type',
        'context',
        'contextId',
        'date',
        'markedByFacultyId',
        'isLocked',
      ],
      populatableFields: ['batchId', 'courseId', 'markedByFacultyId'],
      defaultSort: '-date',
    });
  }

  async findForDate(
    date: Date,
    filter: FilterQuery<AttendanceSessionDocument> = {},
  ): Promise<AttendanceSessionDocument[]> {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.findMany({ ...filter, date: { $gte: start, $lt: end } }, { sort: 'startTime' });
  }

  async sessionExists(
    batchId: mongoose.Types.ObjectId,
    date: Date,
    periodNumber: number | null,
    context: string = 'class',
    contextId: string | null = null,
    excludeId?: string,
  ): Promise<boolean> {
    // A class and a training session may share a batch, date and period.
    const filter: FilterQuery<AttendanceSessionDocument> = {
      batchId,
      date,
      periodNumber,
      context,
      contextId: contextId ? new mongoose.Types.ObjectId(contextId) : null,
    };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async updateStats(
    sessionId: mongoose.Types.ObjectId,
    counts: AttendanceCounts,
    session?: ClientSession,
  ): Promise<void> {
    const attended = counts.present + counts.late + counts.onDuty;
    const percentage = counts.total > 0 ? Math.round((attended / counts.total) * 1000) / 10 : 0;

    await this.model
      .updateOne(
        this.scope({ _id: sessionId }),
        {
          $set: {
            'stats.totalStudents': counts.total,
            'stats.presentCount': counts.present,
            'stats.absentCount': counts.absent,
            'stats.lateCount': counts.late,
            'stats.excusedCount': counts.excused,
            'stats.onDutyCount': counts.onDuty,
            'stats.percentage': percentage,
          },
        },
        { session },
      )
      .exec();
  }

  /** Sessions past the configured lock window, for the nightly auto-lock job. */
  async findUnlockedBefore(cutoff: Date): Promise<AttendanceSessionDocument[]> {
    return this.findMany({ date: { $lt: cutoff }, isLocked: false, status: 'marked' });
  }

  async findPendingMarking(
    since: Date,
    filter: FilterQuery<AttendanceSessionDocument> = {},
  ): Promise<AttendanceSessionDocument[]> {
    return this.findMany({
      ...filter,
      date: { $gte: since, $lte: new Date() },
      status: 'pending_marking',
    });
  }
}

export class AttendanceRecordRepository extends BaseRepository<AttendanceRecordDocument> {
  constructor() {
    super(AttendanceRecordModel, {
      tenantScoped: true,
      sortableFields: ['date', 'createdAt', 'status'],
      searchableFields: [],
      filterableFields: ['sessionId', 'studentId', 'batchId', 'status', 'date'],
      populatableFields: ['studentId', 'sessionId'],
      defaultSort: '-date',
    });
  }

  async findBySession(sessionId: mongoose.Types.ObjectId): Promise<AttendanceRecordDocument[]> {
    return this.findMany({ sessionId });
  }

  async findByStudentRange(
    studentId: mongoose.Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<AttendanceRecordDocument[]> {
    const filter: FilterQuery<AttendanceRecordDocument> = { studentId };
    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, Date>).$gte = from;
      if (to) (filter.date as Record<string, Date>).$lte = to;
    }
    return this.findMany(filter, { sort: '-date' });
  }

  /**
   * Replaces a whole session's records in one bulk write. Marking a 60-student
   * roster must never be 60 separate mutations.
   */
  async upsertSessionRecords(
    sessionId: mongoose.Types.ObjectId,
    batchId: mongoose.Types.ObjectId,
    date: Date,
    entries: Array<{ studentId: mongoose.Types.ObjectId; status: AttendanceStatus; remarks?: string | null }>,
    markedBy: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const collegeId = this.tenantId();
    const now = new Date();

    const operations = entries.map((entry) => ({
      updateOne: {
        filter: { collegeId, sessionId, studentId: entry.studentId, deletedAt: null },
        update: {
          $set: {
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy,
            markedAt: now,
            batchId,
            date,
          },
          $setOnInsert: { collegeId, sessionId, studentId: entry.studentId },
        },
        upsert: true,
      },
    }));

    if (operations.length === 0) return;
    await this.bulkWrite(operations, session);
  }

  async countsForStudent(
    studentId: mongoose.Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<AttendanceCounts> {
    const match: Record<string, unknown> = { studentId };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      match.date = range;
    }

    const rows = await this.aggregate<{ _id: AttendanceStatus; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return toCounts(rows);
  }

  async countsForBatch(
    batchId: mongoose.Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<AttendanceCounts> {
    const match: Record<string, unknown> = { batchId };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      match.date = range;
    }

    const rows = await this.aggregate<{ _id: AttendanceStatus; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return toCounts(rows);
  }

  /** Per-student totals for a batch, used to rebuild summaries in one pass. */
  async aggregateByStudent(
    filter: FilterQuery<AttendanceRecordDocument> = {},
  ): Promise<Array<{ studentId: string; batchId: string; counts: AttendanceCounts }>> {
    const rows = await this.aggregate<{
      _id: { studentId: mongoose.Types.ObjectId; batchId: mongoose.Types.ObjectId };
      statuses: Array<{ status: AttendanceStatus; count: number }>;
    }>([
      { $match: filter },
      {
        $group: {
          _id: { studentId: '$studentId', batchId: '$batchId', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: { studentId: '$_id.studentId', batchId: '$_id.batchId' },
          statuses: { $push: { status: '$_id.status', count: '$count' } },
        },
      },
    ]);

    return rows.map((row) => ({
      studentId: String(row._id.studentId),
      batchId: String(row._id.batchId),
      counts: toCounts(row.statuses.map((s) => ({ _id: s.status, count: s.count }))),
    }));
  }

  /** Daily series for the attendance trend chart. */
  async dailyTrend(
    from: Date,
    to: Date,
    filter: FilterQuery<AttendanceRecordDocument> = {},
  ): Promise<Array<{ date: string; percentage: number; present: number; total: number }>> {
    const rows = await this.aggregate<{
      _id: string;
      present: number;
      total: number;
    }>([
      { $match: { ...filter, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          present: {
            $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'on_duty']] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((row) => ({
      date: row._id,
      present: row.present,
      total: row.total,
      percentage: row.total > 0 ? Math.round((row.present / row.total) * 1000) / 10 : 0,
    }));
  }
}

export class AttendanceSummaryRepository extends BaseRepository<AttendanceSummaryDocument> {
  constructor() {
    super(AttendanceSummaryModel, {
      tenantScoped: true,
      sortableFields: ['percentage', 'computedAt'],
      searchableFields: [],
      filterableFields: ['studentId', 'batchId', 'courseId', 'period', 'periodKey', 'isBelowThreshold'],
      populatableFields: ['studentId', 'batchId'],
      defaultSort: '-computedAt',
    });
  }

  async findForStudent(
    studentId: mongoose.Types.ObjectId,
    period: SummaryPeriod = 'overall',
    periodKey = 'overall',
  ): Promise<AttendanceSummaryDocument | null> {
    return this.findOne({ studentId, period, periodKey, courseId: null });
  }

  async upsert(
    studentId: mongoose.Types.ObjectId,
    batchId: mongoose.Types.ObjectId,
    period: SummaryPeriod,
    periodKey: string,
    counts: AttendanceCounts,
    threshold: number,
    session?: ClientSession,
  ): Promise<void> {
    const attended = counts.present + counts.late + counts.onDuty;
    const percentage = counts.total > 0 ? Math.round((attended / counts.total) * 1000) / 10 : 0;
    const collegeId = this.tenantId();

    await this.model
      .updateOne(
        { collegeId, studentId, period, periodKey, courseId: null, deletedAt: null },
        {
          $set: {
            batchId,
            totalSessions: counts.total,
            presentCount: counts.present,
            absentCount: counts.absent,
            lateCount: counts.late,
            excusedCount: counts.excused,
            onDutyCount: counts.onDuty,
            percentage,
            isBelowThreshold: counts.total > 0 && percentage < threshold,
            computedAt: new Date(),
          },
          $setOnInsert: { collegeId, studentId, period, periodKey, courseId: null },
        },
        { upsert: true, session },
      )
      .exec();
  }

  async findDefaulters(
    threshold: number,
    filter: FilterQuery<AttendanceSummaryDocument> = {},
  ): Promise<AttendanceSummaryDocument[]> {
    return this.findMany(
      { ...filter, period: 'overall', percentage: { $lt: threshold }, totalSessions: { $gt: 0 } },
      { sort: 'percentage' },
    );
  }

  async averageForCollege(filter: FilterQuery<AttendanceSummaryDocument> = {}): Promise<number> {
    const rows = await this.aggregate<{ _id: null; avg: number }>([
      { $match: { ...filter, period: 'overall', totalSessions: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$percentage' } } },
    ]);
    return rows[0]?.avg ? Math.round(rows[0].avg * 10) / 10 : 0;
  }

  async averageByDepartment(): Promise<Array<{ departmentId: string; percentage: number }>> {
    const rows = await this.aggregate<{ _id: mongoose.Types.ObjectId; avg: number }>([
      { $match: { period: 'overall', totalSessions: { $gt: 0 } } },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      { $group: { _id: '$student.departmentId', avg: { $avg: '$percentage' } } },
      { $sort: { avg: -1 } },
    ]);

    return rows.map((r) => ({
      departmentId: String(r._id),
      percentage: Math.round(r.avg * 10) / 10,
    }));
  }
}

function toCounts(rows: Array<{ _id: AttendanceStatus; count: number }>): AttendanceCounts {
  const counts: AttendanceCounts = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    onDuty: 0,
    total: 0,
  };

  for (const row of rows) {
    switch (row._id) {
      case 'present':
        counts.present = row.count;
        break;
      case 'absent':
        counts.absent = row.count;
        break;
      case 'late':
        counts.late = row.count;
        break;
      case 'excused':
        counts.excused = row.count;
        break;
      case 'on_duty':
        counts.onDuty = row.count;
        break;
    }
    counts.total += row.count;
  }

  return counts;
}
