import { MARKS_ENTRY_STATUS, type MarksEntryStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface MarksEntryDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Denormalised from the exam so transcripts need no join per subject. */
  courseId: Types.ObjectId;
  semester: number;
  credits: number;
  attempt: number;

  /** Raw marks as entered. Null means not yet entered for that component. */
  theory: number | null;
  practical: number | null;
  internal: number | null;

  /** Derived, recomputed on every save — never entered by hand. */
  rawTotal: number;
  attendanceBonus: number;
  graceMarks: number;
  finalTotal: number;
  maxTotal: number;
  percentage: number;
  letter: string;
  gradePoint: number;
  isPass: boolean;
  isAbsent: boolean;
  isRepeat: boolean;
  /** True while the student is excluded from a publication. */
  isWithheld: boolean;

  status: MarksEntryStatus;
  remarks: string | null;
  enteredBy: Types.ObjectId | null;
  enteredAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  verifiedAt: Date | null;

  /** Which result version this entry was last published under. */
  publishedVersion: number | null;

  /**
   * Every change after first entry. Marks are the single most disputed record
   * a college holds, so the prior value, who changed it and why are all kept.
   */
  history: Array<{
    version: number;
    theory: number | null;
    practical: number | null;
    internal: number | null;
    graceMarks: number;
    finalTotal: number;
    percentage: number;
    letter: string;
    changedBy: Types.ObjectId | null;
    changedAt: Date;
    reason: string;
  }>;
}

const historySchema = new Schema(
  {
    version: { type: Number, required: true, min: 1 },
    theory: { type: Number, default: null },
    practical: { type: Number, default: null },
    internal: { type: Number, default: null },
    graceMarks: { type: Number, default: 0 },
    finalTotal: { type: Number, required: true },
    percentage: { type: Number, required: true },
    letter: { type: String, required: true, maxlength: 4 },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

const marksEntrySchema = new Schema<MarksEntryDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  semester: { type: Number, required: true, min: 1, max: 12 },
  credits: { type: Number, required: true, min: 0, max: 20 },
  attempt: { type: Number, default: 1, min: 1, max: 20 },

  theory: { type: Number, default: null, min: 0 },
  practical: { type: Number, default: null, min: 0 },
  internal: { type: Number, default: null, min: 0 },

  rawTotal: { type: Number, default: 0, min: 0 },
  attendanceBonus: { type: Number, default: 0, min: 0 },
  graceMarks: { type: Number, default: 0, min: 0 },
  finalTotal: { type: Number, default: 0, min: 0 },
  maxTotal: { type: Number, required: true, min: 1 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  letter: { type: String, default: '', maxlength: 4 },
  gradePoint: { type: Number, default: 0, min: 0, max: 10 },
  isPass: { type: Boolean, default: false },
  isAbsent: { type: Boolean, default: false },
  isRepeat: { type: Boolean, default: false },
  isWithheld: { type: Boolean, default: false },

  status: { type: String, enum: MARKS_ENTRY_STATUS, default: 'draft' },
  remarks: { type: String, default: null, maxlength: 300 },
  enteredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  enteredAt: { type: Date, default: null },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  publishedVersion: { type: Number, default: null },

  history: { type: [historySchema], default: [] },
});

applyBasePlugin(marksEntrySchema);
applyToJsonTransform(marksEntrySchema);

// One entry per student per exam per attempt: a resit is a new row, not an edit.
marksEntrySchema.index(
  { collegeId: 1, examId: 1, studentId: 1, attempt: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
marksEntrySchema.index({ collegeId: 1, examId: 1, status: 1 });
marksEntrySchema.index({ collegeId: 1, studentId: 1, semester: 1 });
// Serves transcript generation: every counted result for one student.
marksEntrySchema.index({ collegeId: 1, studentId: 1, isPass: 1, semester: 1 });
marksEntrySchema.index({ collegeId: 1, courseId: 1, semester: 1 });

export const MarksEntryModel = (mongoose.models.MarksEntry as Model<MarksEntryDocument>) ??
  mongoose.model<MarksEntryDocument>('MarksEntry', marksEntrySchema);
