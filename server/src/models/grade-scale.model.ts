import { REPEAT_POLICY, type RepeatPolicy } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface GradeBand {
  letter: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number;
  isPass: boolean;
  description: string | null;
}

export interface GradePolicy {
  passingPercent: number;
  maxGraceMarks: number;
  maxGracePerSemester: number;
  attendanceBonusEnabled: boolean;
  attendanceBonusThreshold: number;
  attendanceBonusMarks: number;
  repeatPolicy: RepeatPolicy;
  countFailedCredits: boolean;
  gpaDecimalPlaces: number;
}

export interface GradeScaleDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  name: string;
  code: string;
  description: string | null;
  bands: GradeBand[];
  policy: GradePolicy;
  /** Used by any exam that does not name a scale explicitly. */
  isDefault: boolean;
  status: 'active' | 'inactive';
}

const gradeBandSchema = new Schema<GradeBand>(
  {
    letter: { type: String, required: true, trim: true, maxlength: 4 },
    minPercent: { type: Number, required: true, min: 0, max: 100 },
    maxPercent: { type: Number, required: true, min: 0, max: 100 },
    gradePoint: { type: Number, required: true, min: 0, max: 10 },
    isPass: { type: Boolean, required: true },
    description: { type: String, default: null, maxlength: 80 },
  },
  { _id: false },
);

/**
 * Grading is configured, never hard-coded. Two colleges on the same
 * installation can run a 10-point and a 4-point scale side by side, and a
 * college can revise its scale without a code change.
 */
const gradeScaleSchema = new Schema<GradeScaleDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  description: { type: String, default: null, maxlength: 500 },
  bands: { type: [gradeBandSchema], required: true },
  policy: {
    passingPercent: { type: Number, default: 40, min: 0, max: 100 },
    maxGraceMarks: { type: Number, default: 0, min: 0, max: 50 },
    maxGracePerSemester: { type: Number, default: 0, min: 0, max: 100 },
    attendanceBonusEnabled: { type: Boolean, default: false },
    attendanceBonusThreshold: { type: Number, default: 90, min: 0, max: 100 },
    attendanceBonusMarks: { type: Number, default: 0, min: 0, max: 10 },
    repeatPolicy: { type: String, enum: REPEAT_POLICY, default: 'best_attempt' },
    countFailedCredits: { type: Boolean, default: true },
    gpaDecimalPlaces: { type: Number, default: 2, min: 0, max: 4 },
  },
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
});

applyBasePlugin(gradeScaleSchema);
applyToJsonTransform(gradeScaleSchema);

gradeScaleSchema.index(
  { collegeId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// At most one default per college. Partial so non-defaults never collide.
gradeScaleSchema.index(
  { collegeId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true, deletedAt: null } },
);
gradeScaleSchema.index({ collegeId: 1, status: 1 });

export const GradeScaleModel = (mongoose.models.GradeScale as Model<GradeScaleDocument>) ??
  mongoose.model<GradeScaleDocument>('GradeScale', gradeScaleSchema);
