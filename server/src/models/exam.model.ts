import { EXAM_LIFECYCLE, EXAM_TYPE, type ExamLifecycle, type ExamType } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface MarkComponentsSub {
  theory: number;
  practical: number;
  internal: number;
}

/**
 * One entry per publish, unpublish or recalculate. Results are the most
 * contested records a college holds, so every change to what students can see
 * is retained rather than overwritten.
 */
export interface ResultPublication {
  version: number;
  action: 'published' | 'unpublished' | 'recalculated';
  actedBy: Types.ObjectId | null;
  actedAt: Date;
  reason: string | null;
  studentCount: number;
  passCount: number;
  failCount: number;
  withheldCount: number;
  averagePercent: number;
}

export interface ExamDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  title: string;
  code: string;
  examType: ExamType;
  courseId: Types.ObjectId;
  departmentId: Types.ObjectId;
  batchIds: Types.ObjectId[];
  semester: number;
  academicYear: string;
  maxMarks: MarkComponentsSub;
  totalMarks: number;
  credits: number;
  /** Falls back to the college default when null. */
  gradeScaleId: Types.ObjectId | null;
  scheduledAt: Date | null;
  durationMinutes: number | null;
  venue: string | null;
  instructions: string | null;
  status: ExamLifecycle;
  /** Set when this exam is the assessment for a training session. */
  trainingSessionId: Types.ObjectId | null;
  resultsPublishedAt: Date | null;
  currentResultVersion: number;
  publications: ResultPublication[];
  stats: {
    registeredCount: number;
    appearedCount: number;
    absentCount: number;
    passCount: number;
    failCount: number;
    averagePercent: number;
    highestPercent: number;
  };
}

const publicationSchema = new Schema<ResultPublication>(
  {
    version: { type: Number, required: true, min: 1 },
    action: {
      type: String,
      enum: ['published', 'unpublished', 'recalculated'],
      required: true,
    },
    actedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actedAt: { type: Date, default: Date.now },
    reason: { type: String, default: null, maxlength: 500 },
    studentCount: { type: Number, default: 0, min: 0 },
    passCount: { type: Number, default: 0, min: 0 },
    failCount: { type: Number, default: 0, min: 0 },
    withheldCount: { type: Number, default: 0, min: 0 },
    averagePercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const examSchema = new Schema<ExamDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  examType: { type: String, enum: EXAM_TYPE, required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  batchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
  semester: { type: Number, required: true, min: 1, max: 12 },
  academicYear: { type: String, required: true, maxlength: 9 },
  maxMarks: {
    theory: { type: Number, default: 0, min: 0 },
    practical: { type: Number, default: 0, min: 0 },
    internal: { type: Number, default: 0, min: 0 },
  },
  // Denormalised sum, kept in step by a pre-validate hook.
  totalMarks: { type: Number, required: true, min: 1 },
  credits: { type: Number, required: true, min: 0, max: 20 },
  gradeScaleId: { type: Schema.Types.ObjectId, ref: 'GradeScale', default: null },
  scheduledAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: null, min: 10, max: 600 },
  venue: { type: String, default: null, maxlength: 200 },
  instructions: { type: String, default: null, maxlength: 10000 },
  status: { type: String, enum: EXAM_LIFECYCLE, default: 'draft' },
  trainingSessionId: { type: Schema.Types.ObjectId, ref: 'TrainingSession', default: null },
  resultsPublishedAt: { type: Date, default: null },
  currentResultVersion: { type: Number, default: 0, min: 0 },
  publications: { type: [publicationSchema], default: [] },
  stats: {
    registeredCount: { type: Number, default: 0, min: 0 },
    appearedCount: { type: Number, default: 0, min: 0 },
    absentCount: { type: Number, default: 0, min: 0 },
    passCount: { type: Number, default: 0, min: 0 },
    failCount: { type: Number, default: 0, min: 0 },
    averagePercent: { type: Number, default: 0, min: 0, max: 100 },
    highestPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
});

applyBasePlugin(examSchema);
applyToJsonTransform(examSchema);

examSchema.index(
  { collegeId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examSchema.index({ collegeId: 1, status: 1, scheduledAt: -1 });
examSchema.index({ collegeId: 1, courseId: 1, semester: 1 });
examSchema.index({ collegeId: 1, departmentId: 1, academicYear: 1 });
examSchema.index({ collegeId: 1, batchIds: 1, status: 1 });
examSchema.index({ collegeId: 1, trainingSessionId: 1 }, { sparse: true });

examSchema.pre('validate', function (next) {
  const { theory, practical, internal } = this.maxMarks;
  this.totalMarks = theory + practical + internal;

  if (this.totalMarks <= 0) {
    next(new Error('An exam must carry marks in at least one component'));
    return;
  }

  next();
});

export const ExamModel = (mongoose.models.Exam as Model<ExamDocument>) ??
  mongoose.model<ExamDocument>('Exam', examSchema);
