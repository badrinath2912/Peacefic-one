import {
  calculateCgpa,
  calculateGrade,
  type CorrectMarksInput,
  type EnterMarksInput,
  type GradeBandInput,
  type GradePolicyInput,
  type MarksEntryInput,
  type PublishResultsInput,
  type SubjectResult,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { ExaminationService } from './examination.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { requestContext } from '@/config/request-context';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/errors';
import type { ExamDocument, ResultPublication } from '@/models/exam.model';
import type { MarksEntryDocument } from '@/models/marks-entry.model';
import type { TranscriptDocument } from '@/models/transcript.model';
import type { AttendanceSummaryRepository } from '@/repositories/attendance.repository';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { CourseRepository } from '@/repositories/course.repository';
import type {
  ExamAttendanceRepository,
  ExamRegistrationRepository,
  ExamRepository,
  MarksEntryRepository,
  TranscriptRepository,
} from '@/repositories/examination.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type { TrainingEnrollmentRepository } from '@/repositories/training.repository';
import { populatedField } from '@/utils/mongo';

/** Statuses that mean a student did not sit the paper. */
const NON_APPEARING = new Set(['absent', 'debarred', 'malpractice']);

export class ResultService {
  constructor(
    private readonly marksRepository: MarksEntryRepository,
    private readonly examRepository: ExamRepository,
    private readonly registrationRepository: ExamRegistrationRepository,
    private readonly examAttendanceRepository: ExamAttendanceRepository,
    private readonly transcriptRepository: TranscriptRepository,
    private readonly attendanceSummaryRepository: AttendanceSummaryRepository,
    private readonly studentRepository: StudentRepository,
    private readonly courseRepository: CourseRepository,
    private readonly trainingEnrollmentRepository: TrainingEnrollmentRepository,
    private readonly examinationService: ExaminationService,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ---------------------------------- marks ---------------------------------- */

  async listMarks(
    examId: string,
    options: ListOptions,
  ): Promise<PaginatedResult<MarksEntryDocument>> {
    const exam = await this.examinationService.getExam(examId);

    return this.marksRepository.paginate({
      ...options,
      filter: { ...(options.filter ?? {}), examId: exam._id },
      include: options.include ?? 'studentId',
    });
  }

  /**
   * Enters or replaces marks for a set of students in one exam.
   *
   * Every derived value — total, percentage, letter, grade point, pass — is
   * computed here from the exam's grade scale. Nothing derived is ever taken
   * from the request body, so a crafted payload cannot manufacture a grade.
   */
  async enterMarks(
    examId: string,
    input: EnterMarksInput,
  ): Promise<{ saved: number; skipped: number; status: string }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (!['completed', 'marks_entered'].includes(exam.status)) {
      throw new BusinessRuleError(
        `Marks can only be entered once the exam is completed, not while it is "${exam.status.replace(/_/g, ' ')}".`,
      );
    }

    const { bands, policy } = await this.examinationService.gradingContext(exam);

    const registrations = await this.registrationRepository.findByExam(exam._id);
    const byStudent = new Map(
      registrations.map((registration) => [String(registration.studentId), registration]),
    );

    const attendance = await this.examAttendanceRepository.findByExam(exam._id);
    const attendanceByStudent = new Map(
      attendance.map((record) => [String(record.studentId), record.status]),
    );

    const studentIds = input.entries
      .map((entry) => entry.studentId)
      .filter((id) => byStudent.has(id));

    if (studentIds.length === 0) {
      throw new ValidationError('None of those students are registered for this exam.', [
        { field: 'entries', message: 'No registered students matched' },
      ]);
    }

    const attendancePercents = await this.attendancePercents(studentIds, policy);
    const existing = await this.marksRepository.findByExam(exam._id);
    const existingByKey = new Map(
      existing.map((entry) => [`${String(entry.studentId)}:${entry.attempt}`, entry]),
    );

    const userId = requestContext.get().userId;
    const enteredBy = userId ? new mongoose.Types.ObjectId(userId) : null;
    const nextStatus = input.submit ? 'submitted' : 'draft';

    let saved = 0;

    await withTransaction(async (transaction) => {
      for (const entry of input.entries) {
        const registration = byStudent.get(entry.studentId);
        if (!registration) continue;

        const computed = this.computeEntry(
          entry,
          exam,
          bands,
          policy,
          NON_APPEARING.has(attendanceByStudent.get(entry.studentId) ?? ''),
          attendancePercents.get(entry.studentId) ?? null,
        );

        const key = `${entry.studentId}:${registration.attempt}`;
        const previous = existingByKey.get(key);

        // A verified or locked mark is a finished record; changing it is a
        // correction, which is a separate, reasoned operation.
        if (previous && (previous.status === 'verified' || previous.status === 'locked')) {
          continue;
        }

        if (previous) {
          await this.marksRepository.updateById(
            previous._id,
            {
              $set: {
                ...computed,
                status: nextStatus,
                remarks: entry.remarks ?? null,
                enteredBy,
                enteredAt: new Date(),
              },
            },
            { session: transaction },
          );
        } else {
          await this.marksRepository.create(
            {
              examId: exam._id,
              studentId: registration.studentId,
              courseId: exam.courseId,
              semester: exam.semester,
              credits: exam.credits,
              attempt: registration.attempt,
              isRepeat: registration.attempt > 1,
              ...computed,
              status: nextStatus,
              remarks: entry.remarks ?? null,
              enteredBy,
              enteredAt: new Date(),
            } as Partial<MarksEntryDocument>,
            transaction,
          );
        }

        saved += 1;
      }
    });

    await this.auditService.log({
      action: input.submit ? 'examination.marks_submitted' : 'examination.marks_saved',
      category: 'data',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { saved, submitted: input.submit, skipped: input.entries.length - saved },
    });

    return { saved, skipped: input.entries.length - saved, status: nextStatus };
  }

  /**
   * Verifies submitted marks. Verification is what makes a mark eligible for
   * publication, and it is deliberately a different permission from entry so
   * one person cannot both set and approve a grade.
   */
  async verifyMarks(examId: string, studentIds?: string[]): Promise<{ verified: number }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (!['completed', 'marks_entered'].includes(exam.status)) {
      throw new BusinessRuleError(
        `Marks cannot be verified while the exam is "${exam.status.replace(/_/g, ' ')}".`,
      );
    }

    const userId = requestContext.get().userId;

    const filter: Record<string, unknown> = { examId: exam._id, status: 'submitted' };
    if (studentIds?.length) {
      filter.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const verified = await this.marksRepository.updateMany(filter, {
      $set: {
        status: 'verified',
        verifiedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
        verifiedAt: new Date(),
      },
    });

    if (verified === 0) {
      throw new BusinessRuleError('There are no submitted marks awaiting verification.');
    }

    await this.auditService.log({
      action: 'examination.marks_verified',
      category: 'admin',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { verified },
    });

    return { verified };
  }

  /**
   * Corrects a single mark after verification or publication.
   *
   * The prior values are pushed onto the entry's history with the reason and
   * the actor before the new ones are written, so a disputed grade can always
   * be traced back to what it was and who changed it.
   */
  async correctMark(examId: string, input: CorrectMarksInput): Promise<MarksEntryDocument> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (exam.status === 'archived') {
      throw new BusinessRuleError('An archived exam cannot have its marks corrected.');
    }

    const registration = await this.registrationRepository.findOne({
      examId: exam._id,
      studentId: new mongoose.Types.ObjectId(input.studentId),
    });

    if (!registration) throw new NotFoundError('Exam registration');

    const entry = await this.marksRepository.findByExamAndStudent(
      exam._id,
      new mongoose.Types.ObjectId(input.studentId),
      registration.attempt,
    );

    if (!entry) throw new NotFoundError('Marks entry');

    const { bands, policy } = await this.examinationService.gradingContext(exam);
    const attendancePercents = await this.attendancePercents([input.studentId], policy);
    const attendanceRecord = await this.examAttendanceRepository.findOne({
      examId: exam._id,
      studentId: entry.studentId,
    });

    const computed = this.computeEntry(
      input,
      exam,
      bands,
      policy,
      NON_APPEARING.has(attendanceRecord?.status ?? ''),
      attendancePercents.get(input.studentId) ?? null,
    );

    const userId = requestContext.get().userId;

    const historyEntry = {
      version: entry.history.length + 1,
      theory: entry.theory,
      practical: entry.practical,
      internal: entry.internal,
      graceMarks: entry.graceMarks,
      finalTotal: entry.finalTotal,
      percentage: entry.percentage,
      letter: entry.letter,
      changedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
      changedAt: new Date(),
      reason: input.reason,
    };

    const updated = await this.marksRepository.updateByIdOrFail(entry._id, {
      $set: {
        ...computed,
        remarks: input.remarks ?? entry.remarks,
        // A correction re-enters the verification queue rather than
        // inheriting the sign-off the old value carried.
        status: 'submitted',
        verifiedBy: null,
        verifiedAt: null,
      },
      $push: { history: historyEntry },
    });

    await this.auditService.log({
      action: 'examination.mark_corrected',
      category: 'data',
      severity: 'warning',
      entity: { type: 'MarksEntry', id: entry._id, label: exam.code },
      changes: [
        { field: 'finalTotal', from: entry.finalTotal, to: updated.finalTotal },
        { field: 'letter', from: entry.letter, to: updated.letter },
      ],
      metadata: { reason: input.reason, studentId: input.studentId },
    });

    // A student holding a published result needs to know it changed.
    if (entry.publishedVersion !== null) {
      const student = await this.studentRepository.findById(entry.studentId);
      if (student) {
        await this.notificationService.notifySafely({
          userIds: [student.userId],
          type: 'examination.result_corrected',
          category: 'academic',
          priority: 'high',
          title: 'A published result was corrected',
          message: `Your result for "${exam.title}" has been revised. Reason: ${input.reason}`,
          entity: { type: 'Exam', id: exam._id },
        });
      }
    }

    return updated;
  }

  /* -------------------------------- publication ------------------------------- */

  /**
   * Releases results to students and records the publication as a new version.
   *
   * Withheld students keep their marks but are excluded from the release, which
   * is how a pending disciplinary or fee matter is handled without deleting a
   * legitimately computed result.
   */
  async publishResults(
    examId: string,
    input: PublishResultsInput,
  ): Promise<{ exam: ExamDocument; publication: ResultPublication }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (exam.status !== 'marks_entered') {
      throw new BusinessRuleError(
        `Results can only be published from "marks entered", not "${exam.status.replace(/_/g, ' ')}".`,
      );
    }

    const unverified = await this.marksRepository.count({
      examId: exam._id,
      status: { $in: ['draft', 'submitted'] },
    });

    if (unverified > 0) {
      throw new BusinessRuleError(
        `${unverified} mark(s) are still unverified, so results cannot be published.`,
      );
    }

    const withheldIds = input.withholdStudentIds.map((id) => new mongoose.Types.ObjectId(id));
    const version = exam.currentResultVersion + 1;

    const publication = await withTransaction(async (transaction) => {
      const published = await this.marksRepository.markPublished(
        exam._id,
        version,
        withheldIds,
        transaction,
      );

      // Locking prevents a published mark being edited through the normal
      // entry path; only a reasoned correction can move it now.
      await this.marksRepository.updateMany(
        { examId: exam._id, publishedVersion: version },
        { $set: { status: 'locked' } },
        transaction,
      );

      const stats = await this.marksRepository.statsForExam(exam._id);

      const entry: ResultPublication = {
        version,
        action: 'published',
        actedBy: this.actor(),
        actedAt: new Date(),
        reason: input.reason ?? null,
        studentCount: published,
        passCount: stats.passCount,
        failCount: stats.failCount,
        withheldCount: withheldIds.length,
        averagePercent: stats.averagePercent,
      };

      await this.examRepository.appendPublication(exam._id, entry, transaction);

      await this.examRepository.updateById(
        exam._id,
        {
          $set: {
            status: 'results_published',
            resultsPublishedAt: new Date(),
            'stats.passCount': stats.passCount,
            'stats.failCount': stats.failCount,
            'stats.averagePercent': stats.averagePercent,
            'stats.highestPercent': stats.highestPercent,
          },
        },
        { session: transaction },
      );

      return entry;
    });

    await this.auditService.log({
      action: 'examination.results_published',
      category: 'admin',
      severity: 'warning',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      changes: [{ field: 'status', from: exam.status, to: 'results_published' }],
      metadata: {
        version,
        studentCount: publication.studentCount,
        withheldCount: publication.withheldCount,
        reason: input.reason ?? null,
      },
    });

    await this.linkTrainingAttempts(exam, withheldIds);
    await this.notifyPublished(exam, withheldIds);

    const updated = await this.examRepository.findByIdOrFail(examId);
    return { exam: updated, publication };
  }

  /**
   * Fills in `assessmentAttemptId` on each training enrolment — the extension
   * point Training reserved for its assessment result. Only published,
   * non-withheld marks are linked, so a training record never shows a result a
   * student cannot yet see.
   */
  private async linkTrainingAttempts(
    exam: ExamDocument,
    withheldIds: mongoose.Types.ObjectId[],
  ): Promise<void> {
    if (!exam.trainingSessionId) return;

    const withheld = new Set(withheldIds.map(String));

    const entries = (await this.marksRepository.findByExam(exam._id)).filter(
      (entry) => !withheld.has(String(entry.studentId)),
    );

    if (entries.length === 0) return;

    await this.trainingEnrollmentRepository.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: {
            collegeId: exam.collegeId,
            sessionId: exam.trainingSessionId,
            studentId: entry.studentId,
            deletedAt: null,
          },
          update: { $set: { assessmentAttemptId: entry._id } },
        },
      })),
    );
  }

  /**
   * Withdraws a published result. The marks survive untouched; only their
   * visibility and the exam's state change, and the withdrawal itself becomes
   * the next entry in the version history.
   */
  async unpublishResults(examId: string, reason: string): Promise<ExamDocument> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (exam.status !== 'results_published') {
      throw new BusinessRuleError('These results are not currently published.');
    }

    const version = exam.currentResultVersion + 1;

    await withTransaction(async (transaction) => {
      const affected = await this.marksRepository.markUnpublished(exam._id, transaction);

      // Unlocked so corrections can be made before the next release.
      await this.marksRepository.updateMany(
        { examId: exam._id, status: 'locked' },
        { $set: { status: 'verified' } },
        transaction,
      );

      await this.examRepository.appendPublication(
        exam._id,
        {
          version,
          action: 'unpublished',
          actedBy: this.actor(),
          actedAt: new Date(),
          reason,
          studentCount: affected,
          passCount: 0,
          failCount: 0,
          withheldCount: 0,
          averagePercent: 0,
        },
        transaction,
      );

      await this.examRepository.updateById(
        exam._id,
        { $set: { status: 'marks_entered', resultsPublishedAt: null } },
        { session: transaction },
      );
    });

    await this.auditService.log({
      action: 'examination.results_unpublished',
      category: 'admin',
      severity: 'critical',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      changes: [{ field: 'status', from: 'results_published', to: 'marks_entered' }],
      metadata: { version, reason },
    });

    await this.notifyCandidates(
      exam,
      'A published result was withdrawn',
      `Results for "${exam.title}" have been temporarily withdrawn. Reason: ${reason}`,
    );

    return this.examRepository.findByIdOrFail(examId);
  }

  /**
   * Re-grades every entry against the exam's current scale.
   *
   * Needed when a scale is corrected or grace is applied after the fact. Raw
   * component marks are the input and are never altered; only the derived
   * grade changes, and each entry keeps its prior values in history.
   */
  async recalculateResults(
    examId: string,
    reason: string,
  ): Promise<{ recalculated: number; changed: number; version: number }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.examinationService.assertExamVisible(exam);

    if (exam.status === 'archived') {
      throw new BusinessRuleError('An archived exam cannot be recalculated.');
    }

    const { bands, policy } = await this.examinationService.gradingContext(exam);
    const entries = await this.marksRepository.findByExam(exam._id);

    if (entries.length === 0) {
      throw new BusinessRuleError('There are no marks to recalculate.');
    }

    const attendance = await this.examAttendanceRepository.findByExam(exam._id);
    const attendanceByStudent = new Map(
      attendance.map((record) => [String(record.studentId), record.status]),
    );

    const attendancePercents = await this.attendancePercents(
      entries.map((entry) => String(entry.studentId)),
      policy,
    );

    const actor = this.actor();
    const version = exam.currentResultVersion + 1;
    let changed = 0;

    await withTransaction(async (transaction) => {
      for (const entry of entries) {
        const computed = this.computeEntry(
          {
            theory: entry.theory,
            practical: entry.practical,
            internal: entry.internal,
            graceMarks: entry.graceMarks,
          },
          exam,
          bands,
          policy,
          NON_APPEARING.has(attendanceByStudent.get(String(entry.studentId)) ?? ''),
          attendancePercents.get(String(entry.studentId)) ?? null,
        );

        // Unchanged entries are left alone so the history records real
        // revisions rather than a row per recalculation run.
        if (
          computed.finalTotal === entry.finalTotal &&
          computed.letter === entry.letter &&
          computed.isPass === entry.isPass
        ) {
          continue;
        }

        await this.marksRepository.updateById(
          entry._id,
          {
            $set: computed,
            $push: {
              history: {
                version: entry.history.length + 1,
                theory: entry.theory,
                practical: entry.practical,
                internal: entry.internal,
                graceMarks: entry.graceMarks,
                finalTotal: entry.finalTotal,
                percentage: entry.percentage,
                letter: entry.letter,
                changedBy: actor,
                changedAt: new Date(),
                reason: `Recalculated: ${reason}`,
              },
            },
          },
          { session: transaction },
        );

        changed += 1;
      }

      const stats = await this.marksRepository.statsForExam(exam._id);

      await this.examRepository.appendPublication(
        exam._id,
        {
          version,
          action: 'recalculated',
          actedBy: actor,
          actedAt: new Date(),
          reason,
          studentCount: entries.length,
          passCount: stats.passCount,
          failCount: stats.failCount,
          withheldCount: 0,
          averagePercent: stats.averagePercent,
        },
        transaction,
      );

      await this.examRepository.updateById(
        exam._id,
        {
          $set: {
            'stats.passCount': stats.passCount,
            'stats.failCount': stats.failCount,
            'stats.averagePercent': stats.averagePercent,
            'stats.highestPercent': stats.highestPercent,
          },
        },
        { session: transaction },
      );
    });

    await this.auditService.log({
      action: 'examination.results_recalculated',
      category: 'admin',
      severity: 'warning',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { version, recalculated: entries.length, changed, reason },
    });

    return { recalculated: entries.length, changed, version };
  }

  /** The full publication history for an exam, newest first. */
  async publicationHistory(examId: string): Promise<ResultPublication[]> {
    const exam = await this.examinationService.getExam(examId);
    return [...exam.publications].sort((a, b) => b.version - a.version);
  }

  /* --------------------------------- students -------------------------------- */

  /** One student's published results, for the student portal and staff views. */
  async studentResults(studentId: string) {
    await this.scopeGuard.assertCanAccessStudent(studentId);

    const entries = await this.marksRepository.findForStudent(
      new mongoose.Types.ObjectId(studentId),
    );

    await this.marksRepository.populateRelations(entries);

    const policy = await this.defaultPolicy();
    const cgpa = calculateCgpa(this.toSubjectResults(entries), policy);

    return {
      results: entries,
      summary: {
        cgpa: cgpa.cgpa,
        totalCreditsEarned: cgpa.totalCreditsEarned,
        totalCreditsAttempted: cgpa.totalCreditsAttempted,
        activeBacklogs: cgpa.activeBacklogs,
        semesters: cgpa.semesters.map((semester) => ({
          semester: semester.semester,
          gpa: semester.gpa,
          creditsEarned: semester.creditsEarned,
          creditsAttempted: semester.creditsAttempted,
          subjectCount: semester.subjectCount,
          failedCount: semester.failedCount,
        })),
      },
    };
  }

  /* ------------------------------- self-service ------------------------------ */

  /**
   * The signed-in student's own results.
   *
   * The student id comes from the token via `requireOwnStudent`, never from the
   * request — there is no parameter here to tamper with, which is why this is a
   * separate endpoint rather than a relaxed guard on the staff one.
   *
   * The payload is a deliberate projection, not the stored document: correction
   * history, examiner remarks, workflow status and the ids of whoever entered
   * or verified a mark are the examination office's record, not the student's.
   */
  async ownResults() {
    const student = await this.scopeGuard.requireOwnStudent();

    const [published, withheld] = await Promise.all([
      this.marksRepository.findForStudent(student._id),
      this.marksRepository.findWithheldForStudent(student._id),
    ]);

    await this.marksRepository.populateRelations(published);
    await this.marksRepository.populateRelations(withheld);

    const examsById = await this.examTitles([...published, ...withheld]);
    const policy = await this.defaultPolicy();
    const cgpa = calculateCgpa(this.toSubjectResults(published), policy);

    return {
      results: published.map((entry) => this.toStudentResult(entry, examsById)),

      /**
       * Identity only — no marks, no grade, no percentage. A student learns
       * that a result exists and is being held so they know to ask, without
       * the figure leaking before the office releases it.
       */
      withheld: withheld
        .filter((entry) => examsById.get(String(entry.examId))?.isPublished)
        .map((entry) => ({
          examId: String(entry.examId),
          examTitle: examsById.get(String(entry.examId))?.title ?? '',
          examCode: examsById.get(String(entry.examId))?.code ?? '',
          courseCode: populatedField(entry.courseId, 'code'),
          courseTitle: populatedField(entry.courseId, 'title'),
          semester: entry.semester,
          credits: entry.credits,
          attempt: entry.attempt,
        })),

      summary: {
        cgpa: cgpa.cgpa,
        totalCreditsEarned: cgpa.totalCreditsEarned,
        totalCreditsAttempted: cgpa.totalCreditsAttempted,
        activeBacklogs: cgpa.activeBacklogs,
        totalBacklogs: cgpa.totalBacklogs,
        semesters: cgpa.semesters.map((semester) => ({
          semester: semester.semester,
          gpa: semester.gpa,
          creditsEarned: semester.creditsEarned,
          creditsAttempted: semester.creditsAttempted,
          subjectCount: semester.subjectCount,
          failedCount: semester.failedCount,
        })),
      },
    };
  }

  /** The signed-in student's current transcript, or null if none was issued. */
  async ownTranscript(): Promise<TranscriptDocument | null> {
    const student = await this.scopeGuard.requireOwnStudent();
    return this.transcriptRepository.findCurrent(student._id);
  }

  /** Exam identity for display, keyed by id. */
  private async examTitles(
    entries: MarksEntryDocument[],
  ): Promise<Map<string, { title: string; code: string; isPublished: boolean }>> {
    const ids = [...new Set(entries.map((entry) => String(entry.examId)))];
    if (ids.length === 0) return new Map();

    const exams = await this.examRepository.findMany(
      { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
      { limit: 500 },
    );

    return new Map(
      exams.map((exam) => [
        String(exam._id),
        {
          title: exam.title,
          code: exam.code,
          isPublished: exam.status === 'results_published' || exam.status === 'archived',
        },
      ]),
    );
  }

  /** What a student is allowed to see of their own mark. */
  private toStudentResult(
    entry: MarksEntryDocument,
    examsById: Map<string, { title: string; code: string }>,
  ) {
    const exam = examsById.get(String(entry.examId));

    return {
      id: String(entry._id),
      examId: String(entry.examId),
      examTitle: exam?.title ?? '',
      examCode: exam?.code ?? '',
      courseCode: populatedField(entry.courseId, 'code'),
      courseTitle: populatedField(entry.courseId, 'title'),
      semester: entry.semester,
      credits: entry.credits,
      attempt: entry.attempt,
      isRepeat: entry.isRepeat,

      // The components explain the total, so they stay.
      theory: entry.theory,
      practical: entry.practical,
      internal: entry.internal,
      rawTotal: entry.rawTotal,
      attendanceBonus: entry.attendanceBonus,
      graceMarks: entry.graceMarks,
      finalTotal: entry.finalTotal,
      maxTotal: entry.maxTotal,
      percentage: entry.percentage,

      letter: entry.letter,
      gradePoint: entry.gradePoint,
      isPass: entry.isPass,
      isAbsent: entry.isAbsent,
    };
  }

  /* -------------------------------- transcripts ------------------------------- */

  async getTranscript(studentId: string): Promise<TranscriptDocument> {
    await this.scopeGuard.assertCanAccessStudent(studentId);

    const transcript = await this.transcriptRepository.findCurrent(
      new mongoose.Types.ObjectId(studentId),
    );

    if (!transcript) {
      throw new NotFoundError('Transcript');
    }

    return transcript;
  }

  async listTranscriptVersions(studentId: string): Promise<TranscriptDocument[]> {
    await this.scopeGuard.assertCanAccessStudent(studentId);

    return this.transcriptRepository.findMany(
      { studentId: new mongoose.Types.ObjectId(studentId) },
      { sort: '-revision', limit: 50 },
    );
  }

  /**
   * Builds a transcript from every published, non-withheld result.
   *
   * The result is a frozen snapshot at a new version rather than an update of
   * the existing one: a transcript that has been issued must not silently
   * change under the holder.
   */
  async generateTranscript(
    studentId: string,
    upToSemester?: number | null,
  ): Promise<TranscriptDocument> {
    await this.scopeGuard.assertCanAccessStudent(studentId);

    const student = await this.studentRepository.findByIdOrFail(studentId);

    const entries = await this.marksRepository.findForStudent(
      student._id,
      upToSemester ?? undefined,
    );

    if (entries.length === 0) {
      throw new BusinessRuleError(
        'This student has no published results, so a transcript cannot be generated.',
      );
    }

    const { policy, scaleId } = await this.transcriptGradingContext();
    const subjectResults = this.toSubjectResults(entries);
    const cgpa = calculateCgpa(subjectResults, policy);

    // Course codes and titles are frozen into the document so a later rename
    // does not rewrite a transcript already in a student's hands.
    const courseIds = [...new Set(entries.map((entry) => String(entry.courseId)))];
    const courses = await this.courseRepository.findMany(
      { _id: { $in: courseIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { limit: 500 },
    );
    const courseById = new Map(courses.map((course) => [String(course._id), course]));

    const subjects = entries.map((entry) => {
      const course = courseById.get(String(entry.courseId));

      return {
        courseId: entry.courseId,
        courseCode: course?.code ?? '',
        courseTitle: course?.title ?? '',
        semester: entry.semester,
        credits: entry.credits,
        letter: entry.letter,
        gradePoint: entry.gradePoint,
        percentage: entry.percentage,
        isPass: entry.isPass,
        attempt: entry.attempt,
        examId: entry.examId,
      };
    });

    const highestSemester = entries.reduce((highest, entry) => Math.max(highest, entry.semester), 1);
    const revision = (await this.transcriptRepository.latestRevision(student._id)) + 1;

    const transcript = await withTransaction(async (transaction) => {
      await this.transcriptRepository.clearCurrent(student._id, transaction);

      return this.transcriptRepository.create(
        {
          studentId: student._id,
          revision,
          isCurrent: true,
          upToSemester: upToSemester ?? highestSemester,
          gradeScaleId: scaleId,
          cgpa: cgpa.cgpa,
          totalCreditsAttempted: cgpa.totalCreditsAttempted,
          totalCreditsEarned: cgpa.totalCreditsEarned,
          activeBacklogs: cgpa.activeBacklogs,
          totalBacklogs: cgpa.totalBacklogs,
          semesters: cgpa.semesters.map((semester) => ({
            semester: semester.semester,
            creditsAttempted: semester.creditsAttempted,
            creditsEarned: semester.creditsEarned,
            gpa: semester.gpa,
            subjectCount: semester.subjectCount,
            failedCount: semester.failedCount,
          })),
          subjects,
          generatedBy: this.actor(),
          generatedAt: new Date(),
        } as Partial<TranscriptDocument>,
        transaction,
      );
    });

    // The student record carries the CGPA that placement eligibility reads,
    // so it is kept in step with the transcript that produced it.
    await this.studentRepository.updateAcademics(student._id, {
      currentCgpa: cgpa.cgpa,
      activeBacklogs: cgpa.activeBacklogs,
      totalBacklogs: cgpa.totalBacklogs,
      semesterGpas: cgpa.semesters.map((semester) => ({
        semester: semester.semester,
        gpa: semester.gpa,
        credits: semester.creditsEarned,
      })),
    });

    await this.auditService.log({
      action: 'examination.transcript_generated',
      category: 'data',
      entity: { type: 'Transcript', id: transcript._id, label: student.rollNumber },
      metadata: { revision, cgpa: cgpa.cgpa, subjects: subjects.length },
    });

    return transcript;
  }

  /* -------------------------------- internals -------------------------------- */

  /** All derived fields for one marks entry. The single grading choke point. */
  private computeEntry(
    input: Pick<MarksEntryInput, 'theory' | 'practical' | 'internal' | 'graceMarks'>,
    exam: ExamDocument,
    bands: GradeBandInput[],
    policy: GradePolicyInput,
    isAbsent: boolean,
    attendancePercent: number | null,
  ): Record<string, unknown> {
    // Checked before grading so an out-of-range mark is reported as the
    // data-entry error it is rather than silently capped into a grade.
    this.assertWithinMaximum(input, exam);

    const graded = calculateGrade(
      {
        obtained: {
          theory: input.theory ?? 0,
          practical: input.practical ?? 0,
          internal: input.internal ?? 0,
        },
        maximum: exam.maxMarks,
        graceMarks: input.graceMarks ?? 0,
        attendancePercent,
      },
      bands,
      policy,
      { isAbsent },
    );

    return {
      theory: input.theory ?? null,
      practical: input.practical ?? null,
      internal: input.internal ?? null,
      rawTotal: graded.rawTotal,
      attendanceBonus: graded.attendanceBonus,
      graceMarks: graded.graceApplied,
      finalTotal: graded.finalTotal,
      maxTotal: graded.maxTotal,
      percentage: graded.percentage,
      letter: graded.letter,
      gradePoint: graded.gradePoint,
      isPass: graded.isPass,
      isAbsent,
    };
  }

  /** A component mark above its maximum is a data-entry error, not a grade. */
  private assertWithinMaximum(
    input: Pick<MarksEntryInput, 'theory' | 'practical' | 'internal'>,
    exam: ExamDocument,
  ): void {
    const components: Array<['theory' | 'practical' | 'internal', number | null | undefined]> = [
      ['theory', input.theory],
      ['practical', input.practical],
      ['internal', input.internal],
    ];

    for (const [component, value] of components) {
      if (value === null || value === undefined) continue;

      const maximum = exam.maxMarks[component];
      if (value > maximum) {
        throw new ValidationError('A mark exceeds the maximum for its component.', [
          {
            field: component,
            message: `${component} is out of ${maximum}, but ${value} was entered`,
          },
        ]);
      }
    }
  }

  /** Overall attendance per student, only when the policy awards a bonus. */
  private async attendancePercents(
    studentIds: string[],
    policy: GradePolicyInput,
  ): Promise<Map<string, number>> {
    if (!policy.attendanceBonusEnabled || studentIds.length === 0) return new Map();

    const summaries = await this.attendanceSummaryRepository.findMany(
      {
        studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        period: 'overall',
        periodKey: 'overall',
        courseId: null,
      },
      { limit: 2000 },
    );

    return new Map(
      summaries.map((summary) => [String(summary.studentId), summary.percentage]),
    );
  }

  private toSubjectResults(entries: MarksEntryDocument[]): SubjectResult[] {
    return entries.map((entry) => ({
      courseId: String(
        typeof entry.courseId === 'object' && entry.courseId !== null && '_id' in entry.courseId
          ? (entry.courseId as { _id: unknown })._id
          : entry.courseId,
      ),
      semester: entry.semester,
      credits: entry.credits,
      gradePoint: entry.gradePoint,
      letter: entry.letter,
      isPass: entry.isPass,
      attempt: entry.attempt,
      percentage: entry.percentage,
      examId: String(entry.examId),
    }));
  }

  /**
   * A transcript spans many exams that may not share a scale, so the college
   * default supplies the CGPA policy. Per-exam scales still decide each
   * subject's letter and grade point; only the aggregation rules come from here.
   */
  private async transcriptGradingContext(): Promise<{
    policy: GradePolicyInput;
    scaleId: mongoose.Types.ObjectId | null;
  }> {
    const scale = await this.examinationService.defaultGradeScale();
    return { policy: scale.policy as unknown as GradePolicyInput, scaleId: scale._id };
  }

  private async defaultPolicy(): Promise<GradePolicyInput> {
    const { policy } = await this.transcriptGradingContext();
    return policy;
  }

  private actor(): mongoose.Types.ObjectId | null {
    const userId = requestContext.tryGet()?.userId;
    return userId ? new mongoose.Types.ObjectId(userId) : null;
  }

  private async notifyPublished(
    exam: ExamDocument,
    withheldIds: mongoose.Types.ObjectId[],
  ): Promise<void> {
    const withheld = new Set(withheldIds.map(String));
    const studentIds = (await this.registrationRepository.findStudentIds(exam._id)).filter(
      (id) => !withheld.has(id),
    );

    if (studentIds.length === 0) return;

    const students = await this.studentRepository.findMany(
      { _id: { $in: studentIds.map((entry) => new mongoose.Types.ObjectId(entry)) } },
      { limit: 2000 },
    );

    await this.notificationService.notifySafely({
      userIds: students.map((student) => student.userId),
      type: 'examination.results_published',
      category: 'academic',
      priority: 'high',
      title: 'Your exam result is available',
      message: `Results for "${exam.title}" have been published.`,
      entity: { type: 'Exam', id: exam._id },
    });
  }

  private async notifyCandidates(
    exam: ExamDocument,
    title: string,
    message: string,
  ): Promise<void> {
    const studentIds = await this.registrationRepository.findStudentIds(exam._id);
    if (studentIds.length === 0) return;

    const students = await this.studentRepository.findMany(
      { _id: { $in: studentIds.map((entry) => new mongoose.Types.ObjectId(entry)) } },
      { limit: 2000 },
    );

    await this.notificationService.notifySafely({
      userIds: students.map((student) => student.userId),
      type: 'examination.results_unpublished',
      category: 'academic',
      priority: 'high',
      title,
      message,
      entity: { type: 'Exam', id: exam._id },
    });
  }
}
