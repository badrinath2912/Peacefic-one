import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import { ExamAttendanceModel, type ExamAttendanceDocument } from '@/models/exam-attendance.model';
import { ExamPaperModel, type ExamPaperDocument } from '@/models/exam-paper.model';
import {
  ExamRegistrationModel,
  type ExamRegistrationDocument,
} from '@/models/exam-registration.model';
import { ExamModel, type ExamDocument } from '@/models/exam.model';
import { GradeScaleModel, type GradeScaleDocument } from '@/models/grade-scale.model';
import { MarksEntryModel, type MarksEntryDocument } from '@/models/marks-entry.model';
import { TranscriptModel, type TranscriptDocument } from '@/models/transcript.model';


export class GradeScaleRepository extends BaseRepository<GradeScaleDocument> {
  constructor() {
    super(GradeScaleModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'name', 'code', 'status'],
      searchableFields: ['name', 'code'],
      filterableFields: ['status', 'isDefault'],
      populatableFields: [],
      defaultSort: 'name',
    });
  }

  async findDefault(): Promise<GradeScaleDocument | null> {
    return this.findOne({ isDefault: true, status: 'active' });
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<GradeScaleDocument> = { code: code.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  /** Clears the existing default so the unique partial index never trips. */
  async clearDefault(exceptId?: mongoose.Types.ObjectId, session?: ClientSession): Promise<void> {
    const filter: FilterQuery<GradeScaleDocument> = { isDefault: true };
    if (exceptId) filter._id = { $ne: exceptId };
    await this.updateMany(filter, { $set: { isDefault: false } }, session);
  }
}

export class ExamRepository extends BaseRepository<ExamDocument> {
  constructor() {
    super(ExamModel, {
      tenantScoped: true,
      sortableFields: ['createdAt', 'title', 'code', 'scheduledAt', 'semester', 'status'],
      searchableFields: ['title', 'code'],
      filterableFields: [
        'examType',
        'status',
        'courseId',
        'departmentId',
        'batchIds',
        'semester',
        'academicYear',
        'trainingSessionId',
        'scheduledAt',
      ],
      populatableFields: ['courseId', 'departmentId', 'batchIds', 'gradeScaleId'],
      defaultSort: '-scheduledAt',
    });
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<ExamDocument> = { code: code.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async findByTrainingSession(
    trainingSessionId: mongoose.Types.ObjectId,
  ): Promise<ExamDocument | null> {
    return this.findOne({ trainingSessionId });
  }

  /** Every published exam a student has a counted result in. */
  async findPublishedForSemesters(semesters: number[]): Promise<ExamDocument[]> {
    return this.findMany({ status: 'results_published', semester: { $in: semesters } });
  }

  async appendPublication(
    examId: mongoose.Types.ObjectId,
    publication: ExamDocument['publications'][number],
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scope({ _id: examId }),
        {
          $push: { publications: publication },
          $set: { currentResultVersion: publication.version },
        },
        { session },
      )
      .exec();
  }

  async populateRelations(exams: ExamDocument[]): Promise<void> {
    await ExamModel.populate(exams, [
      { path: 'courseId', select: 'title code credits' },
      { path: 'departmentId', select: 'name code' },
      { path: 'batchIds', select: 'name code' },
      { path: 'gradeScaleId', select: 'name code' },
    ]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }
}

export class ExamPaperRepository extends BaseRepository<ExamPaperDocument> {
  constructor() {
    super(ExamPaperModel, {
      tenantScoped: true,
      sortableFields: ['revision', 'createdAt'],
      searchableFields: ['title'],
      filterableFields: ['examId', 'isReleased'],
      populatableFields: [],
      defaultSort: '-revision',
    });
  }

  async latestRevision(examId: mongoose.Types.ObjectId): Promise<number> {
    const [latest] = await this.findMany({ examId }, { sort: '-revision', limit: 1 });
    return latest?.revision ?? 0;
  }

  async findReleased(examId: mongoose.Types.ObjectId): Promise<ExamPaperDocument | null> {
    return this.findOne({ examId, isReleased: true });
  }
}

export class ExamRegistrationRepository extends BaseRepository<ExamRegistrationDocument> {
  constructor() {
    super(ExamRegistrationModel, {
      tenantScoped: true,
      sortableFields: ['hallTicketNumber', 'registeredAt', 'status'],
      searchableFields: ['hallTicketNumber'],
      filterableFields: ['examId', 'studentId', 'batchId', 'status'],
      populatableFields: ['studentId', 'batchId'],
      defaultSort: 'hallTicketNumber',
    });
  }

  async findByExam(examId: mongoose.Types.ObjectId): Promise<ExamRegistrationDocument[]> {
    return this.findMany({ examId, status: { $in: ['registered', 'approved'] } });
  }

  async findStudentIds(examId: mongoose.Types.ObjectId): Promise<string[]> {
    const rows = await this.model
      .find(this.scope({ examId, status: { $ne: 'withdrawn' } }))
      .select('studentId')
      .lean()
      .exec();

    return rows.map((row) => String(row.studentId));
  }

  async countForExam(examId: mongoose.Types.ObjectId): Promise<number> {
    return this.count({ examId, status: { $in: ['registered', 'approved'] } });
  }

  /** Highest attempt a student has taken of the same course. */
  async highestAttempt(
    studentId: mongoose.Types.ObjectId,
    examIds: mongoose.Types.ObjectId[],
  ): Promise<number> {
    if (examIds.length === 0) return 0;

    const rows = await this.findMany(
      { studentId, examId: { $in: examIds } },
      { sort: '-createdAt' },
    );

    return rows.reduce((highest, row) => Math.max(highest, row.attempt), 0);
  }

  async populateRelations(registrations: ExamRegistrationDocument[]): Promise<void> {
    await ExamRegistrationModel.populate(registrations, [
      {
        path: 'studentId',
        select: 'rollNumber userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
      { path: 'batchId', select: 'name code' },
    ]);
  }
}

export class ExamAttendanceRepository extends BaseRepository<ExamAttendanceDocument> {
  constructor() {
    super(ExamAttendanceModel, {
      tenantScoped: true,
      sortableFields: ['markedAt', 'status'],
      searchableFields: [],
      filterableFields: ['examId', 'studentId', 'status'],
      populatableFields: ['studentId'],
      defaultSort: '-markedAt',
    });
  }

  async findByExam(examId: mongoose.Types.ObjectId): Promise<ExamAttendanceDocument[]> {
    return this.findMany({ examId });
  }

  /** Replaces a whole hall's attendance in one write. */
  async upsertMany(
    examId: mongoose.Types.ObjectId,
    entries: Array<{
      studentId: mongoose.Types.ObjectId;
      registrationId: mongoose.Types.ObjectId;
      status: string;
      remarks?: string | null;
    }>,
    markedBy: mongoose.Types.ObjectId | null,
    session?: ClientSession,
  ): Promise<void> {
    if (entries.length === 0) return;

    const collegeId = this.tenantId();
    const now = new Date();

    const operations = entries.map((entry) => ({
      updateOne: {
        filter: { collegeId, examId, studentId: entry.studentId, deletedAt: null },
        update: {
          $set: {
            status: entry.status,
            remarks: entry.remarks ?? null,
            registrationId: entry.registrationId,
            markedBy,
            markedAt: now,
          },
          $setOnInsert: { collegeId, examId, studentId: entry.studentId },
        },
        upsert: true,
      },
    }));

    await this.bulkWrite(operations, session);
  }

  async countsByStatus(examId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: { examId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async populateRelations(records: ExamAttendanceDocument[]): Promise<void> {
    await ExamAttendanceModel.populate(records, [
      {
        path: 'studentId',
        select: 'rollNumber userId',
        populate: { path: 'userId', select: 'firstName lastName' },
      },
    ]);
  }
}

export class MarksEntryRepository extends BaseRepository<MarksEntryDocument> {
  constructor() {
    super(MarksEntryModel, {
      tenantScoped: true,
      sortableFields: ['percentage', 'finalTotal', 'createdAt', 'status'],
      searchableFields: [],
      filterableFields: [
        'examId',
        'studentId',
        'courseId',
        'semester',
        'status',
        'isPass',
        'isRepeat',
        'isWithheld',
      ],
      populatableFields: ['studentId', 'courseId'],
      defaultSort: '-percentage',
    });
  }

  async findByExam(examId: mongoose.Types.ObjectId): Promise<MarksEntryDocument[]> {
    return this.findMany({ examId }, { limit: 5000 });
  }

  async findForStudent(
    studentId: mongoose.Types.ObjectId,
    upToSemester?: number,
  ): Promise<MarksEntryDocument[]> {
    const filter: FilterQuery<MarksEntryDocument> = {
      studentId,
      // Only published, non-withheld results count toward a transcript.
      publishedVersion: { $ne: null },
      isWithheld: false,
    };

    if (upToSemester) filter.semester = { $lte: upToSemester };

    return this.findMany(filter, { limit: 500 });
  }

  /**
   * Results held back from a release the student's cohort has otherwise seen.
   *
   * Kept separate from `findForStudent` because these must never be counted
   * toward a GPA or shown as a grade — a student is told only that a result
   * exists and is withheld, so they know to ask rather than assuming the
   * examination was lost.
   */
  async findWithheldForStudent(
    studentId: mongoose.Types.ObjectId,
  ): Promise<MarksEntryDocument[]> {
    return this.findMany({ studentId, isWithheld: true }, { limit: 500 });
  }

  async findByExamAndStudent(
    examId: mongoose.Types.ObjectId,
    studentId: mongoose.Types.ObjectId,
    attempt: number,
  ): Promise<MarksEntryDocument | null> {
    return this.findOne({ examId, studentId, attempt });
  }

  async statsForExam(examId: mongoose.Types.ObjectId): Promise<{
    count: number;
    passCount: number;
    failCount: number;
    averagePercent: number;
    highestPercent: number;
  }> {
    const rows = await this.aggregate<{
      _id: null;
      count: number;
      passCount: number;
      averagePercent: number;
      highestPercent: number;
    }>([
      { $match: { examId, isAbsent: false } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          passCount: { $sum: { $cond: ['$isPass', 1, 0] } },
          averagePercent: { $avg: '$percentage' },
          highestPercent: { $max: '$percentage' },
        },
      },
    ]);

    const row = rows[0];

    return {
      count: row?.count ?? 0,
      passCount: row?.passCount ?? 0,
      failCount: (row?.count ?? 0) - (row?.passCount ?? 0),
      averagePercent: row?.averagePercent ? Math.round(row.averagePercent * 100) / 100 : 0,
      highestPercent: row?.highestPercent ?? 0,
    };
  }

  async markPublished(
    examId: mongoose.Types.ObjectId,
    version: number,
    withheldStudentIds: mongoose.Types.ObjectId[],
    session?: ClientSession,
  ): Promise<number> {
    // Withheld students are flagged and left unpublished.
    if (withheldStudentIds.length > 0) {
      await this.updateMany(
        { examId, studentId: { $in: withheldStudentIds } },
        { $set: { isWithheld: true, publishedVersion: null } },
        session,
      );
    }

    return this.updateMany(
      { examId, studentId: { $nin: withheldStudentIds } },
      { $set: { publishedVersion: version, isWithheld: false } },
      session,
    );
  }

  async markUnpublished(
    examId: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    return this.updateMany({ examId }, { $set: { publishedVersion: null } }, session);
  }

  async populateRelations(entries: MarksEntryDocument[]): Promise<void> {
    await MarksEntryModel.populate(entries, [
      {
        path: 'studentId',
        select: 'rollNumber userId',
        populate: { path: 'userId', select: 'firstName lastName' },
      },
      { path: 'courseId', select: 'title code' },
    ]);
  }
}

export class TranscriptRepository extends BaseRepository<TranscriptDocument> {
  constructor() {
    super(TranscriptModel, {
      tenantScoped: true,
      sortableFields: ['generatedAt', 'cgpa', 'revision'],
      searchableFields: [],
      filterableFields: ['studentId', 'isCurrent', 'upToSemester'],
      populatableFields: ['studentId'],
      defaultSort: '-generatedAt',
    });
  }

  async findCurrent(studentId: mongoose.Types.ObjectId): Promise<TranscriptDocument | null> {
    return this.findOne({ studentId, isCurrent: true });
  }

  async latestRevision(studentId: mongoose.Types.ObjectId): Promise<number> {
    const [latest] = await this.findMany({ studentId }, { sort: '-revision', limit: 1 });
    return latest?.revision ?? 0;
  }

  /** Retires the previous current transcript before a new one is written. */
  async clearCurrent(
    studentId: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.updateMany({ studentId, isCurrent: true }, { $set: { isCurrent: false } }, session);
  }
}
