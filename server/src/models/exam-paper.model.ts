import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface ExamPaperSection {
  name: string;
  instructions: string | null;
  questionCount: number;
  marksPerQuestion: number;
  isOptional: boolean;
}

export interface ExamPaperDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  examId: Types.ObjectId;
  /**
   * Bumped on every revision; released papers are never edited in place.
   * Named `revision` rather than `version` because the base plugin claims
   * `version` as the optimistic-concurrency key on every schema.
   */
  revision: number;
  title: string;
  totalMarks: number;
  sections: ExamPaperSection[];
  instructions: string | null;
  attachment: {
    url: string;
    fileName: string;
    fileKey: string;
    sizeBytes: number;
    mimeType: string;
  } | null;
  isReleased: boolean;
  releasedAt: Date | null;
  releasedBy: Types.ObjectId | null;
}

const sectionSchema = new Schema<ExamPaperSection>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    instructions: { type: String, default: null, maxlength: 2000 },
    questionCount: { type: Number, required: true, min: 1, max: 200 },
    marksPerQuestion: { type: Number, required: true, min: 0, max: 100 },
    isOptional: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * A paper is versioned rather than mutated. Once released it is what students
 * sat, and a later correction must be a new version so the original remains
 * auditable.
 */
const examPaperSchema = new Schema<ExamPaperDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  revision: { type: Number, required: true, min: 1, default: 1 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  totalMarks: { type: Number, required: true, min: 1, max: 1000 },
  sections: { type: [sectionSchema], default: [] },
  instructions: { type: String, default: null, maxlength: 10000 },
  attachment: {
    type: new Schema(
      {
        url: { type: String, required: true },
        fileName: { type: String, required: true, maxlength: 255 },
        fileKey: { type: String, required: true },
        sizeBytes: { type: Number, required: true, min: 0 },
        mimeType: { type: String, required: true, maxlength: 120 },
      },
      { _id: false },
    ),
    default: null,
  },
  isReleased: { type: Boolean, default: false },
  releasedAt: { type: Date, default: null },
  releasedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

applyBasePlugin(examPaperSchema);
applyToJsonTransform(examPaperSchema);

examPaperSchema.index(
  { collegeId: 1, examId: 1, revision: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examPaperSchema.index({ collegeId: 1, examId: 1, isReleased: 1 });

export const ExamPaperModel = (mongoose.models.ExamPaper as Model<ExamPaperDocument>) ??
  mongoose.model<ExamPaperDocument>('ExamPaper', examPaperSchema);
