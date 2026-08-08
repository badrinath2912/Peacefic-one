import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface TranscriptSubject {
  courseId: Types.ObjectId;
  courseCode: string;
  courseTitle: string;
  semester: number;
  credits: number;
  letter: string;
  gradePoint: number;
  percentage: number;
  isPass: boolean;
  attempt: number;
  examId: Types.ObjectId;
}

export interface TranscriptSemester {
  semester: number;
  creditsAttempted: number;
  creditsEarned: number;
  gpa: number;
  subjectCount: number;
  failedCount: number;
}

export interface TranscriptDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  studentId: Types.ObjectId;
  /**
   * Bumped on every regeneration; earlier revisions are retained. Named
   * `revision` rather than `version` because the base plugin claims `version`
   * as the optimistic-concurrency key on every schema.
   */
  revision: number;
  isCurrent: boolean;
  upToSemester: number;
  gradeScaleId: Types.ObjectId | null;
  cgpa: number;
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  activeBacklogs: number;
  totalBacklogs: number;
  semesters: TranscriptSemester[];
  /**
   * A frozen snapshot, not a live join. A transcript must show what was true
   * when it was issued — a later mark correction produces a new version rather
   * than silently rewriting a document a student may already hold.
   */
  subjects: TranscriptSubject[];
  generatedBy: Types.ObjectId | null;
  generatedAt: Date;
}

const subjectSchema = new Schema<TranscriptSubject>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    courseCode: { type: String, required: true, maxlength: 20 },
    courseTitle: { type: String, required: true, maxlength: 200 },
    semester: { type: Number, required: true, min: 1, max: 12 },
    credits: { type: Number, required: true, min: 0 },
    letter: { type: String, required: true, maxlength: 4 },
    gradePoint: { type: Number, required: true, min: 0, max: 10 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    isPass: { type: Boolean, required: true },
    attempt: { type: Number, required: true, min: 1 },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  },
  { _id: false },
);

const semesterSchema = new Schema<TranscriptSemester>(
  {
    semester: { type: Number, required: true, min: 1, max: 12 },
    creditsAttempted: { type: Number, required: true, min: 0 },
    creditsEarned: { type: Number, required: true, min: 0 },
    gpa: { type: Number, required: true, min: 0, max: 10 },
    subjectCount: { type: Number, required: true, min: 0 },
    failedCount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const transcriptSchema = new Schema<TranscriptDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  revision: { type: Number, required: true, min: 1, default: 1 },
  isCurrent: { type: Boolean, default: true },
  upToSemester: { type: Number, required: true, min: 1, max: 12 },
  gradeScaleId: { type: Schema.Types.ObjectId, ref: 'GradeScale', default: null },
  cgpa: { type: Number, default: 0, min: 0, max: 10 },
  totalCreditsAttempted: { type: Number, default: 0, min: 0 },
  totalCreditsEarned: { type: Number, default: 0, min: 0 },
  activeBacklogs: { type: Number, default: 0, min: 0 },
  totalBacklogs: { type: Number, default: 0, min: 0 },
  semesters: { type: [semesterSchema], default: [] },
  subjects: { type: [subjectSchema], default: [] },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  generatedAt: { type: Date, default: Date.now },
});

applyBasePlugin(transcriptSchema);
applyToJsonTransform(transcriptSchema);

transcriptSchema.index(
  { collegeId: 1, studentId: 1, revision: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Exactly one current transcript per student.
transcriptSchema.index(
  { collegeId: 1, studentId: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true, deletedAt: null } },
);
transcriptSchema.index({ collegeId: 1, cgpa: -1 });

export const TranscriptModel = (mongoose.models.Transcript as Model<TranscriptDocument>) ??
  mongoose.model<TranscriptDocument>('Transcript', transcriptSchema);
