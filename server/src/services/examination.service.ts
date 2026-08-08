import type {
  BulkOperationResult,
  CreateExaminationInput,
  CreateExaminationPaperInput,
  CreateGradeScaleInput,
  ExamLifecycle,
  GradeBandInput,
  GradePolicyInput,
  MarkExamAttendanceInput,
  RegisterStudentsInput,
  UpdateExaminationInput,
  UpdateGradeScaleInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { NotificationService } from './notification.service';
import type { ScopeGuard } from './scope-guard.service';

import { withTransaction } from '@/config/database';
import { requestContext } from '@/config/request-context';
import {
  BusinessRuleError,
  DuplicateResourceError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { ExamAttendanceDocument } from '@/models/exam-attendance.model';
import type { ExamPaperDocument } from '@/models/exam-paper.model';
import type { ExamRegistrationDocument } from '@/models/exam-registration.model';
import type { ExamDocument } from '@/models/exam.model';
import type { GradeScaleDocument } from '@/models/grade-scale.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CourseRepository } from '@/repositories/course.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type {
  ExamAttendanceRepository,
  ExamPaperRepository,
  ExamRegistrationRepository,
  ExamRepository,
  GradeScaleRepository,
  MarksEntryRepository,
} from '@/repositories/examination.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type { TrainingSessionRepository } from '@/repositories/training.repository';
import { toPlain } from '@/utils/mongo';

/**
 * The examination lifecycle, enforced here rather than trusted from the client.
 *
 * draft → scheduled  a date, venue and duration are fixed
 * scheduled → published  students can see it and hall tickets are valid
 * published → completed  the sitting is over
 * completed → marks_entered  every appearing student has a verified mark
 * marks_entered → results_published  students can see their grades
 * results_published → archived  the exam is closed to further change
 *
 * Backward edges exist only where a genuine correction needs them, and each is
 * gated by an additional rule in `assertTransitionAllowed`.
 */
export const EXAM_TRANSITIONS: Record<ExamLifecycle, ExamLifecycle[]> = {
  draft: ['scheduled'],
  // Back to draft while nothing has been announced to students.
  scheduled: ['published', 'draft'],
  // An exam can be pulled back to `scheduled` if it is postponed before it runs.
  published: ['completed', 'scheduled'],
  completed: ['marks_entered'],
  // Reopened for correction only while results are unpublished.
  marks_entered: ['results_published', 'completed'],
  // Unpublishing is a separate, audited operation; archiving is terminal.
  results_published: ['archived', 'marks_entered'],
  archived: [],
};

export class ExaminationService {
  constructor(
    private readonly examRepository: ExamRepository,
    private readonly gradeScaleRepository: GradeScaleRepository,
    private readonly paperRepository: ExamPaperRepository,
    private readonly registrationRepository: ExamRegistrationRepository,
    private readonly examAttendanceRepository: ExamAttendanceRepository,
    private readonly marksRepository: MarksEntryRepository,
    private readonly courseRepository: CourseRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly studentRepository: StudentRepository,
    private readonly trainingSessionRepository: TrainingSessionRepository,
    private readonly scopeGuard: ScopeGuard,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /* ------------------------------- grade scales ------------------------------ */

  async listGradeScales(options: ListOptions): Promise<PaginatedResult<GradeScaleDocument>> {
    return this.gradeScaleRepository.paginate(options);
  }

  async getGradeScale(id: string): Promise<GradeScaleDocument> {
    return this.gradeScaleRepository.findByIdOrFail(id);
  }

  async createGradeScale(input: CreateGradeScaleInput): Promise<GradeScaleDocument> {
    if (await this.gradeScaleRepository.codeExists(input.code)) {
      throw new DuplicateResourceError(`A grade scale with the code "${input.code}" already exists.`, [
        { field: 'code', message: 'Already in use' },
      ]);
    }

    const scale = await withTransaction(async (transaction) => {
      // Clearing first keeps the partial unique index from rejecting the insert.
      if (input.isDefault) {
        await this.gradeScaleRepository.clearDefault(undefined, transaction);
      }

      return this.gradeScaleRepository.create(
        {
          name: input.name,
          code: input.code,
          description: input.description ?? null,
          bands: input.bands.map((band) => ({ ...band, description: band.description ?? null })),
          policy: input.policy,
          isDefault: input.isDefault,
          status: input.status,
        } as Partial<GradeScaleDocument>,
        transaction,
      );
    });

    await this.auditService.log({
      action: 'examination.grade_scale_created',
      category: 'admin',
      entity: { type: 'GradeScale', id: scale._id, label: scale.code },
      metadata: { bands: scale.bands.length, isDefault: scale.isDefault },
    });

    return scale;
  }

  async updateGradeScale(id: string, input: UpdateGradeScaleInput): Promise<GradeScaleDocument> {
    const existing = await this.gradeScaleRepository.findByIdOrFail(id);

    /**
     * Bands cannot change once results computed under them are published:
     * a student's letter grade would silently change after the fact.
     */
    if (input.bands || input.policy) {
      const inUse = await this.examRepository.exists({
        gradeScaleId: existing._id,
        status: { $in: ['results_published', 'archived'] },
      });

      if (inUse) {
        throw new BusinessRuleError(
          'This scale has already graded published results. Create a new scale instead of revising this one.',
        );
      }
    }

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('name', input.name);
    assign('description', input.description);
    assign('status', input.status);

    if (input.bands) {
      patch.bands = input.bands.map((band) => ({ ...band, description: band.description ?? null }));
    }
    if (input.policy) {
      // Merged, so a partial policy update does not blank the untouched keys.
      patch.policy = { ...toPlain(existing).policy as Record<string, unknown>, ...input.policy };
    }

    const updated = await withTransaction(async (transaction) => {
      if (input.isDefault === true) {
        await this.gradeScaleRepository.clearDefault(existing._id, transaction);
        patch.isDefault = true;
      } else if (input.isDefault === false) {
        patch.isDefault = false;
      }

      const result = await this.gradeScaleRepository.updateById(
        id,
        { $set: patch },
        { session: transaction },
      );

      if (!result) throw new NotFoundError('Grade scale');
      return result;
    });

    await this.auditService.log({
      action: 'examination.grade_scale_updated',
      category: 'admin',
      entity: { type: 'GradeScale', id: updated._id, label: updated.code },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  async deleteGradeScale(id: string): Promise<{ id: string; deletedAt: Date }> {
    const scale = await this.gradeScaleRepository.findByIdOrFail(id);

    if (scale.isDefault) {
      throw new BusinessRuleError(
        'The default scale cannot be deleted. Make another scale the default first.',
      );
    }

    const inUse = await this.examRepository.count({ gradeScaleId: scale._id });
    if (inUse > 0) {
      throw new BusinessRuleError(`${inUse} exam(s) use this scale, so it cannot be deleted.`);
    }

    const deleted = await this.gradeScaleRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Grade scale');

    await this.auditService.log({
      action: 'examination.grade_scale_deleted',
      category: 'admin',
      severity: 'warning',
      entity: { type: 'GradeScale', id: scale._id, label: scale.code },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /**
   * The scale an exam grades against: its own if it names one, otherwise the
   * college default. A college with neither cannot grade at all, which is a
   * configuration error worth surfacing plainly.
   */
  async resolveGradeScale(exam: ExamDocument): Promise<GradeScaleDocument> {
    if (exam.gradeScaleId) {
      const named = await this.gradeScaleRepository.findById(exam.gradeScaleId);
      if (named) return named;
    }

    return this.defaultGradeScale();
  }

  /**
   * The college's default scale. A college with none configured cannot grade
   * at all, which is a setup error worth stating plainly rather than falling
   * back to a built-in scale nobody chose.
   */
  async defaultGradeScale(): Promise<GradeScaleDocument> {
    const fallback = await this.gradeScaleRepository.findDefault();

    if (!fallback) {
      throw new BusinessRuleError(
        'No grading scale is configured for this college. Create one before grading.',
      );
    }

    return fallback;
  }

  /* ---------------------------------- exams ---------------------------------- */

  async listExams(options: ListOptions): Promise<PaginatedResult<ExamDocument>> {
    const filter: Record<string, unknown> = { ...(options.filter ?? {}) };
    const allowed = await this.scopeGuard.accessibleDepartmentIds();

    if (allowed) filter.departmentId = { $in: allowed };

    return this.examRepository.paginate({
      ...options,
      filter,
      include: options.include ?? 'courseId,departmentId',
    });
  }

  async getExam(id: string): Promise<ExamDocument> {
    const exam = await this.examRepository.findByIdOrFail(id, {
      include: 'courseId,departmentId,batchIds,gradeScaleId',
    });
    await this.assertExamVisible(exam);
    return exam;
  }

  /** Detail view: the exam, its scale, its paper and its live counts. */
  async getExamProfile(id: string) {
    const exam = await this.getExam(id);

    const [scale, paper, registrationCount, attendanceCounts, marksStats] = await Promise.all([
      this.resolveGradeScale(exam).catch(() => null),
      this.paperRepository.findReleased(exam._id),
      this.registrationRepository.countForExam(exam._id),
      this.examAttendanceRepository.countsByStatus(exam._id),
      this.marksRepository.statsForExam(exam._id),
    ]);

    return {
      exam,
      gradeScale: scale,
      paper,
      counts: {
        registered: registrationCount,
        present: attendanceCounts.present ?? 0,
        absent: attendanceCounts.absent ?? 0,
        debarred: attendanceCounts.debarred ?? 0,
        malpractice: attendanceCounts.malpractice ?? 0,
        marksEntered: marksStats.count,
      },
      results: {
        passCount: marksStats.passCount,
        failCount: marksStats.failCount,
        averagePercent: marksStats.averagePercent,
        highestPercent: marksStats.highestPercent,
        currentVersion: exam.currentResultVersion,
        publishedAt: exam.resultsPublishedAt,
      },
      allowedTransitions: EXAM_TRANSITIONS[exam.status],
    };
  }

  async createExam(input: CreateExaminationInput): Promise<ExamDocument> {
    if (await this.examRepository.codeExists(input.code)) {
      throw new DuplicateResourceError(`An exam with the code "${input.code}" already exists.`, [
        { field: 'code', message: 'Already in use' },
      ]);
    }

    await this.scopeGuard.assertCanAccessDepartment(input.departmentId);
    await this.assertRelationsExist(input);

    if (input.gradeScaleId) {
      await this.gradeScaleRepository.findByIdOrFail(input.gradeScaleId);
    }

    if (input.trainingSessionId) {
      await this.assertTrainingSessionFree(input.trainingSessionId);
    }

    const exam = await this.examRepository.create({

      title: input.title,
      code: input.code,
      examType: input.examType,
      courseId: new mongoose.Types.ObjectId(input.courseId),
      departmentId: new mongoose.Types.ObjectId(input.departmentId),
      batchIds: input.batchIds.map((id) => new mongoose.Types.ObjectId(id)),
      semester: input.semester,
      academicYear: input.academicYear,
      maxMarks: input.maxMarks,
      credits: input.credits,
      gradeScaleId: input.gradeScaleId ? new mongoose.Types.ObjectId(input.gradeScaleId) : null,
      scheduledAt: input.scheduledAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      venue: input.venue ?? null,
      instructions: input.instructions ?? null,
      trainingSessionId: input.trainingSessionId
        ? new mongoose.Types.ObjectId(input.trainingSessionId)
        : null,
      status: 'draft',
    } as Partial<ExamDocument>);

    // Closes the loop on the extension point Training reserved: the session
    // now names its assessment, so a training detail view needs no reverse scan.
    if (exam.trainingSessionId) {
      await this.trainingSessionRepository.updateById(exam.trainingSessionId, {
        $set: { assessmentExamId: exam._id },
      });
    }

    await this.auditService.log({
      action: 'examination.created',
      category: 'data',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: {
        examType: exam.examType,
        semester: exam.semester,
        trainingSessionId: exam.trainingSessionId ? String(exam.trainingSessionId) : null,
      },
    });

    return exam;
  }

  async updateExam(id: string, input: UpdateExaminationInput): Promise<ExamDocument> {
    const existing = await this.examRepository.findByIdOrFail(id);
    await this.assertExamVisible(existing);

    // Once marks exist the shape of the exam is fixed: changing the maximum
    // would silently re-scale every percentage already computed.
    const locked: ExamLifecycle[] = ['marks_entered', 'results_published', 'archived'];

    if (locked.includes(existing.status)) {
      throw new BusinessRuleError(
        `An exam that is "${existing.status.replace(/_/g, ' ')}" can no longer be edited.`,
      );
    }

    if (input.maxMarks || input.credits !== undefined || input.gradeScaleId !== undefined) {
      const enteredMarks = await this.marksRepository.count({ examId: existing._id });
      if (enteredMarks > 0) {
        throw new BusinessRuleError(
          `${enteredMarks} mark(s) have already been entered, so the marks scheme cannot be changed.`,
        );
      }
    }

    if (input.batchIds) await this.assertBatchesExist(input.batchIds);
    if (input.gradeScaleId) await this.gradeScaleRepository.findByIdOrFail(input.gradeScaleId);

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('title', input.title);
    assign('examType', input.examType);
    assign('semester', input.semester);
    assign('maxMarks', input.maxMarks);
    assign('credits', input.credits);
    assign('scheduledAt', input.scheduledAt);
    assign('durationMinutes', input.durationMinutes);
    assign('venue', input.venue);
    assign('instructions', input.instructions);

    if (input.batchIds) {
      patch.batchIds = input.batchIds.map((entry) => new mongoose.Types.ObjectId(entry));
    }
    if (input.gradeScaleId !== undefined) {
      patch.gradeScaleId = input.gradeScaleId
        ? new mongoose.Types.ObjectId(input.gradeScaleId)
        : null;
    }
    if (input.maxMarks) {
      patch.totalMarks =
        input.maxMarks.theory + input.maxMarks.practical + input.maxMarks.internal;
    }

    const updated = await this.examRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'examination.updated',
      category: 'data',
      entity: { type: 'Exam', id: updated._id, label: updated.code },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    // A schedule change after publication has to reach the candidates.
    if (existing.status === 'published' && (input.scheduledAt || input.venue)) {
      await this.notifyCandidates(
        updated,
        'An exam schedule changed',
        `"${updated.title}" has been rescheduled. Check the updated date and venue.`,
        'high',
      );
    }

    return updated;
  }

  async deleteExam(id: string): Promise<{ id: string; deletedAt: Date }> {
    const exam = await this.examRepository.findByIdOrFail(id);
    await this.assertExamVisible(exam);

    if (exam.status !== 'draft') {
      throw new BusinessRuleError(
        'Only a draft exam can be deleted. Archive it instead once it has been announced.',
      );
    }

    const registrations = await this.registrationRepository.count({ examId: exam._id });
    if (registrations > 0) {
      throw new BusinessRuleError(
        `${registrations} student(s) are registered for this exam, so it cannot be deleted.`,
      );
    }

    const deleted = await this.examRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Exam');

    // The training session must not be left pointing at a deleted assessment.
    if (exam.trainingSessionId) {
      await this.trainingSessionRepository.updateById(exam.trainingSessionId, {
        $set: { assessmentExamId: null },
      });
    }

    await this.auditService.log({
      action: 'examination.deleted',
      category: 'data',
      severity: 'warning',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  /* -------------------------------- lifecycle -------------------------------- */

  async transitionExam(id: string, to: ExamLifecycle, reason?: string): Promise<ExamDocument> {
    const exam = await this.examRepository.findByIdOrFail(id);
    await this.assertExamVisible(exam);

    const allowed = EXAM_TRANSITIONS[exam.status] ?? [];

    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(exam.status, to, 'exam');
    }

    await this.assertTransitionAllowed(exam, to);

    const patch: Record<string, unknown> = { status: to };

    // Entering `completed` freezes the appearance counts the marks are checked
    // against, so they are computed once here rather than on every read.
    if (to === 'completed') {
      const counts = await this.examAttendanceRepository.countsByStatus(exam._id);
      patch['stats.appearedCount'] = counts.present ?? 0;
      patch['stats.absentCount'] =
        (counts.absent ?? 0) + (counts.debarred ?? 0) + (counts.malpractice ?? 0);
    }

    const updated = await this.examRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: `examination.${to}`,
      category: 'admin',
      severity: to === 'archived' ? 'warning' : 'info',
      entity: { type: 'Exam', id: updated._id, label: updated.code },
      changes: [{ field: 'status', from: exam.status, to }],
      metadata: { reason: reason ?? null },
    });

    if (to === 'published') {
      await this.notifyCandidates(
        updated,
        'An exam has been published',
        `"${updated.title}" is scheduled${
          updated.scheduledAt ? ` for ${updated.scheduledAt.toDateString()}` : ''
        }.`,
      );
    }

    return updated;
  }

  /** Preconditions that a bare edge list cannot express. */
  private async assertTransitionAllowed(exam: ExamDocument, to: ExamLifecycle): Promise<void> {
    if (to === 'scheduled' && exam.status === 'draft' && !exam.scheduledAt) {
      throw new BusinessRuleError('An exam needs a date and time before it can be scheduled.');
    }

    if (to === 'published') {
      const registered = await this.registrationRepository.countForExam(exam._id);
      if (registered === 0) {
        throw new BusinessRuleError(
          'Register at least one student before publishing this exam.',
        );
      }
    }

    /**
     * The two edges either side of `results_published` are reachable only
     * through the publish and unpublish operations. Those write the version
     * history and the per-student published flags; a bare status change would
     * leave results visible with no record of who released them.
     */
    if (to === 'results_published') {
      throw new BusinessRuleError(
        'Use the publish-results operation rather than a direct status change.',
      );
    }

    if (to === 'marks_entered' && exam.status === 'results_published') {
      throw new BusinessRuleError(
        'Use the unpublish-results operation to reopen this exam for corrections.',
      );
    }

    if (to === 'marks_entered') {
      // Every student who appeared needs a verified mark; absentees do not.
      const [appeared, verified] = await Promise.all([
        this.examAttendanceRepository.count({ examId: exam._id, status: 'present' }),
        this.marksRepository.count({
          examId: exam._id,
          status: { $in: ['verified', 'locked'] },
          isAbsent: false,
        }),
      ]);

      if (appeared === 0) {
        throw new BusinessRuleError('No attendance has been marked for this exam.');
      }

      if (verified < appeared) {
        throw new BusinessRuleError(
          `${appeared - verified} of ${appeared} student(s) who appeared have no verified mark yet.`,
        );
      }
    }
  }

  /* ---------------------------------- papers --------------------------------- */

  async listPapers(examId: string): Promise<ExamPaperDocument[]> {
    const exam = await this.getExam(examId);
    return this.paperRepository.findMany({ examId: exam._id }, { sort: '-revision' });
  }

  /**
   * Papers are versioned and never edited in place. A released paper may have
   * been printed or distributed, so a correction becomes a new version and the
   * earlier one stays on record.
   */
  async createPaper(
    examId: string,
    input: CreateExaminationPaperInput,
  ): Promise<ExamPaperDocument> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.assertExamVisible(exam);

    if (exam.status === 'archived') {
      throw new BusinessRuleError('An archived exam cannot take a new paper.');
    }

    if (input.totalMarks !== exam.totalMarks) {
      throw new ValidationError('The paper total must match the exam total.', [
        {
          field: 'totalMarks',
          message: `This exam is out of ${exam.totalMarks}`,
        },
      ]);
    }

    const sectionTotal = input.sections
      .filter((section) => !section.isOptional)
      .reduce((sum, section) => sum + section.questionCount * section.marksPerQuestion, 0);

    if (input.sections.length > 0 && sectionTotal !== input.totalMarks) {
      throw new ValidationError('The compulsory sections do not add up to the paper total.', [
        { field: 'sections', message: `Sections total ${sectionTotal}, paper total is ${input.totalMarks}` },
      ]);
    }

    const userId = requestContext.get().userId;
    const nextRevision = (await this.paperRepository.latestRevision(exam._id)) + 1;

    const paper = await withTransaction(async (transaction) => {
      // Only one version is live at a time, so releasing supersedes the last.
      if (input.isReleased) {
        await this.paperRepository.updateMany(
          { examId: exam._id, isReleased: true },
          { $set: { isReleased: false } },
          transaction,
        );
      }

      return this.paperRepository.create(
        {
          examId: exam._id,
          revision: nextRevision,
          title: input.title,
          totalMarks: input.totalMarks,
          sections: input.sections,
          instructions: input.instructions ?? null,
          attachment: input.attachment ?? null,
          isReleased: input.isReleased,
          releasedAt: input.isReleased ? new Date() : null,
          releasedBy: input.isReleased && userId ? new mongoose.Types.ObjectId(userId) : null,
        } as Partial<ExamPaperDocument>,
        transaction,
      );
    });

    await this.auditService.log({
      action: 'examination.paper_created',
      category: 'data',
      entity: { type: 'ExamPaper', id: paper._id, label: `${exam.code} v${nextRevision}` },
      metadata: { revision: nextRevision, released: input.isReleased },
    });

    return paper;
  }

  /* ------------------------------- registration ------------------------------ */

  async listRegistrations(
    examId: string,
    options: ListOptions,
  ): Promise<PaginatedResult<ExamRegistrationDocument>> {
    const exam = await this.getExam(examId);

    return this.registrationRepository.paginate({
      ...options,
      filter: { ...(options.filter ?? {}), examId: exam._id },
      include: options.include ?? 'studentId,batchId',
    });
  }

  /**
   * Registers named students and whole batches. Students already registered
   * are skipped rather than failing the batch, so a re-run after adding a few
   * late entries does the obvious thing.
   */
  async registerStudents(
    examId: string,
    input: RegisterStudentsInput,
  ): Promise<{ registered: number; skipped: number; total: number }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.assertExamVisible(exam);

    if (!['draft', 'scheduled', 'published'].includes(exam.status)) {
      throw new BusinessRuleError(
        `Students cannot be registered for an exam that is "${exam.status.replace(/_/g, ' ')}".`,
      );
    }

    const candidateIds = new Set(input.studentIds);

    for (const batchId of input.batchIds) {
      const ids = await this.studentRepository.findIdsByBatch(
        new mongoose.Types.ObjectId(batchId),
      );
      for (const id of ids) candidateIds.add(String(id));
    }

    const students = await this.studentRepository.findMany(
      {
        _id: { $in: [...candidateIds].map((entry) => new mongoose.Types.ObjectId(entry)) },
        status: { $in: ['active', 'on_leave'] },
      },
      { limit: 2000 },
    );

    if (students.length === 0) {
      throw new ValidationError('None of those students could be registered.', [
        { field: 'studentIds', message: 'No active students matched' },
      ]);
    }

    const existing = new Set(await this.registrationRepository.findStudentIds(exam._id));
    const toRegister = students.filter((student) => !existing.has(String(student._id)));

    if (toRegister.length === 0) {
      return { registered: 0, skipped: students.length, total: existing.size };
    }

    // A resit of the same course counts as the next attempt, which is what
    // decides how the result is weighed later.
    const priorExams = await this.examRepository.findMany(
      { courseId: exam.courseId, _id: { $ne: exam._id } },
      { limit: 100, select: '_id' },
    );
    const priorExamIds = priorExams.map((prior) => prior._id);

    const userId = requestContext.get().userId;
    const sequenceBase = existing.size;

    const rows = await Promise.all(
      toRegister.map(async (student, index) => {
        const previous = await this.registrationRepository.highestAttempt(
          student._id,
          priorExamIds,
        );

        return {
          collegeId: exam.collegeId,
          examId: exam._id,
          studentId: student._id,
          batchId: student.batchId,
          hallTicketNumber: this.hallTicketNumber(exam.code, sequenceBase + index + 1),
          attempt: previous + 1,
          status: 'registered' as const,
          registeredBy: userId ? new mongoose.Types.ObjectId(userId) : null,
          registeredAt: new Date(),
        };
      }),
    );

    await withTransaction(async (transaction) => {
      await this.registrationRepository.createMany(
        rows as Array<Partial<ExamRegistrationDocument>>,
        transaction,
      );

      await this.examRepository.updateById(
        exam._id,
        { $inc: { 'stats.registeredCount': rows.length } },
        { session: transaction },
      );
    });

    await this.notificationService.notifySafely({
      userIds: toRegister.map((student) => student.userId),
      type: 'examination.registered',
      category: 'academic',
      title: 'You have been registered for an exam',
      message: `You are registered for "${exam.title}".`,
      entity: { type: 'Exam', id: exam._id },
    });

    await this.auditService.log({
      action: 'examination.students_registered',
      category: 'data',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { registered: rows.length, skipped: students.length - rows.length },
    });

    return {
      registered: rows.length,
      skipped: students.length - rows.length,
      total: existing.size + rows.length,
    };
  }

  async updateRegistration(
    registrationId: string,
    status: ExamRegistrationDocument['status'],
    reason?: string,
  ): Promise<ExamRegistrationDocument> {
    const registration = await this.registrationRepository.findByIdOrFail(registrationId);
    const exam = await this.examRepository.findByIdOrFail(registration.examId);
    await this.assertExamVisible(exam);

    if (exam.status === 'archived') {
      throw new BusinessRuleError('An archived exam cannot have its registrations changed.');
    }

    // Blocking a candidate keeps them off the hall list, so the reason has to
    // be on the record.
    if ((status === 'blocked' || status === 'withdrawn') && !reason) {
      throw new ValidationError('A reason is required.', [
        { field: 'reason', message: `A reason must be given to mark a student ${status}` },
      ]);
    }

    const updated = await this.registrationRepository.updateByIdOrFail(registrationId, {
      $set: { status, statusReason: reason ?? null },
    });

    await this.auditService.log({
      action: 'examination.registration_updated',
      category: 'data',
      severity: status === 'blocked' ? 'warning' : 'info',
      entity: { type: 'ExamRegistration', id: updated._id, label: updated.hallTicketNumber },
      changes: [{ field: 'status', from: registration.status, to: status }],
      metadata: { reason: reason ?? null },
    });

    return updated;
  }

  async hallTickets(examId: string): Promise<ExamRegistrationDocument[]> {
    const exam = await this.getExam(examId);

    // A hall ticket before publication is not yet valid.
    if (!['published', 'completed', 'marks_entered', 'results_published'].includes(exam.status)) {
      throw new BusinessRuleError(
        'Hall tickets become available once the exam is published.',
      );
    }

    const registrations = await this.registrationRepository.findByExam(exam._id);
    await this.registrationRepository.populateRelations(registrations);

    await this.auditService.log({
      action: 'examination.hall_tickets_generated',
      category: 'data',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { count: registrations.length },
    });

    return registrations;
  }

  /* --------------------------------- attendance ------------------------------ */

  async listExamAttendance(examId: string): Promise<ExamAttendanceDocument[]> {
    const exam = await this.getExam(examId);
    const records = await this.examAttendanceRepository.findByExam(exam._id);
    await this.examAttendanceRepository.populateRelations(records);
    return records;
  }

  async markAttendance(
    examId: string,
    input: MarkExamAttendanceInput,
  ): Promise<{ marked: number; skipped: number }> {
    const exam = await this.examRepository.findByIdOrFail(examId);
    await this.assertExamVisible(exam);

    if (!['published', 'completed'].includes(exam.status)) {
      throw new BusinessRuleError(
        `Attendance can only be marked for a published or completed exam, not one that is "${exam.status.replace(/_/g, ' ')}".`,
      );
    }

    // Only registered candidates can be marked, which also guards against a
    // student id from another exam being posted in.
    const registrations = await this.registrationRepository.findByExam(exam._id);
    const byStudent = new Map(
      registrations.map((registration) => [String(registration.studentId), registration]),
    );

    const entries = input.entries
      .map((entry) => {
        const registration = byStudent.get(entry.studentId);
        if (!registration) return null;

        return {
          studentId: registration.studentId,
          registrationId: registration._id,
          status: entry.status,
          remarks: entry.remarks ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (entries.length === 0) {
      throw new ValidationError('None of those students are registered for this exam.', [
        { field: 'entries', message: 'No registered students matched' },
      ]);
    }

    const userId = requestContext.get().userId;

    await withTransaction(async (transaction) => {
      await this.examAttendanceRepository.upsertMany(
        exam._id,
        entries,
        userId ? new mongoose.Types.ObjectId(userId) : null,
        transaction,
      );
    });

    const counts = await this.examAttendanceRepository.countsByStatus(exam._id);

    await this.examRepository.updateById(exam._id, {
      $set: {
        'stats.appearedCount': counts.present ?? 0,
        'stats.absentCount':
          (counts.absent ?? 0) + (counts.debarred ?? 0) + (counts.malpractice ?? 0),
      },
    });

    await this.auditService.log({
      action: 'examination.attendance_marked',
      category: 'data',
      entity: { type: 'Exam', id: exam._id, label: exam.code },
      metadata: { marked: entries.length, skipped: input.entries.length - entries.length },
    });

    return { marked: entries.length, skipped: input.entries.length - entries.length };
  }

  /* -------------------------------- analytics -------------------------------- */

  async analytics() {
    const [byStatus, upcoming, awaitingMarks, published] = await Promise.all([
      this.examRepository.countByStatus(),
      this.examRepository.count({ status: 'published', scheduledAt: { $gte: new Date() } }),
      this.examRepository.count({ status: 'completed' }),
      this.examRepository.count({ status: 'results_published' }),
    ]);

    const passRates = await this.examRepository.aggregate<{
      _id: null;
      avgPass: number | null;
      avgPercent: number | null;
    }>([
      { $match: { status: { $in: ['results_published', 'archived'] } } },
      {
        $group: {
          _id: null,
          avgPass: {
            $avg: {
              $cond: [
                { $gt: [{ $add: ['$stats.passCount', '$stats.failCount'] }, 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        '$stats.passCount',
                        { $add: ['$stats.passCount', '$stats.failCount'] },
                      ],
                    },
                    100,
                  ],
                },
                null,
              ],
            },
          },
          avgPercent: { $avg: '$stats.averagePercent' },
        },
      },
    ]);

    const rates = passRates[0];

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
      upcoming,
      awaitingMarks,
      published,
      passRate: rates?.avgPass ? Math.round(rates.avgPass * 10) / 10 : 0,
      averagePercent: rates?.avgPercent ? Math.round(rates.avgPercent * 10) / 10 : 0,
    };
  }

  async exportExams(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<ExamDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (allowed) query.departmentId = { $in: allowed };

    const exams = await this.examRepository.findMany(query, {
      sort: '-scheduledAt',
      limit: 2000,
    });

    await this.examRepository.populateRelations(exams);

    await this.auditService.log({
      action: 'examination.exported',
      category: 'data',
      metadata: { rows: exams.length },
    });

    return exams;
  }

  async bulkDeleteExams(ids: string[]): Promise<BulkOperationResult> {
    const results: Array<{
      index: number;
      success: boolean;
      id?: string;
      code?: string;
      message?: string;
    }> = [];

    let successCount = 0;

    // One blocked exam must not fail the whole batch, so each is reported.
    for (const [index, id] of ids.entries()) {
      try {
        await this.deleteExam(id);
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

  /** Shared with the result service so both grade against the same rules. */
  async gradingContext(
    exam: ExamDocument,
  ): Promise<{ bands: GradeBandInput[]; policy: GradePolicyInput; scaleId: mongoose.Types.ObjectId }> {
    const scale = await this.resolveGradeScale(exam);

    return {
      bands: scale.bands as unknown as GradeBandInput[],
      policy: scale.policy as unknown as GradePolicyInput,
      scaleId: scale._id,
    };
  }

  async assertExamVisible(exam: ExamDocument): Promise<void> {
    const allowed = await this.scopeGuard.accessibleDepartmentIds();
    if (!allowed) return;

    const allowedSet = new Set(allowed.map(String));
    if (!allowedSet.has(String(exam.departmentId))) {
      // 404 rather than 403: a 403 would confirm the exam exists.
      throw new NotFoundError('Exam');
    }
  }

  private hallTicketNumber(examCode: string, sequence: number): string {
    return `${examCode}-${String(sequence).padStart(4, '0')}`;
  }

  private async assertRelationsExist(input: CreateExaminationInput): Promise<void> {
    const course = await this.courseRepository.findById(input.courseId);
    if (!course) {
      throw new ValidationError('That course could not be found.', [
        { field: 'courseId', message: 'Unknown course' },
      ]);
    }

    const department = await this.departmentRepository.findById(input.departmentId);
    if (!department) {
      throw new ValidationError('That department could not be found.', [
        { field: 'departmentId', message: 'Unknown department' },
      ]);
    }

    await this.assertBatchesExist(input.batchIds);
  }

  private async assertBatchesExist(batchIds: string[]): Promise<void> {
    if (batchIds.length === 0) return;

    const batches = await this.batchRepository.findMany({
      _id: { $in: batchIds.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    if (batches.length !== batchIds.length) {
      throw new ValidationError('One or more batches could not be found.', [
        { field: 'batchIds', message: 'Unknown batch' },
      ]);
    }
  }

  /**
   * A training session has at most one assessment exam. The link is the
   * `assessmentExamId` extension point the Training module reserved.
   */
  private async assertTrainingSessionFree(trainingSessionId: string): Promise<void> {
    const existing = await this.examRepository.findByTrainingSession(
      new mongoose.Types.ObjectId(trainingSessionId),
    );

    if (existing) {
      throw new BusinessRuleError(
        `That training session already has an assessment ("${existing.title}").`,
      );
    }
  }

  private async notifyCandidates(
    exam: ExamDocument,
    title: string,
    message: string,
    priority: 'normal' | 'high' = 'normal',
  ): Promise<void> {
    const studentIds = await this.registrationRepository.findStudentIds(exam._id);
    if (studentIds.length === 0) return;

    const students = await this.studentRepository.findMany(
      { _id: { $in: studentIds.map((entry) => new mongoose.Types.ObjectId(entry)) } },
      { limit: 2000 },
    );

    await this.notificationService.notifySafely({
      userIds: students.map((student) => student.userId),
      type: 'examination.updated',
      category: 'academic',
      priority,
      title,
      message,
      entity: { type: 'Exam', id: exam._id },
    });
  }
}
