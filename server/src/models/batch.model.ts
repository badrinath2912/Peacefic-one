import { BATCH_STATUS, type BatchStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface BatchDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  departmentId: Types.ObjectId;
  name: string;
  code: string;
  admissionYear: number;
  graduationYear: number;
  currentSemester: number;
  section: string | null;
  classAdvisorId: Types.ObjectId | null;
  capacity: number;
  status: BatchStatus;
  stats: { totalStudents: number };
}

const batchSchema = new Schema<BatchDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  admissionYear: { type: Number, required: true, min: 1980 },
  graduationYear: { type: Number, required: true, min: 1980 },
  currentSemester: { type: Number, default: 1, min: 1, max: 12 },
  section: { type: String, default: null, trim: true, maxlength: 10 },
  classAdvisorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  capacity: { type: Number, required: true, min: 1, max: 1000 },
  status: { type: String, enum: BATCH_STATUS, default: 'active' },
  stats: {
    totalStudents: { type: Number, default: 0, min: 0 },
  },
});

applyBasePlugin(batchSchema);
applyToJsonTransform(batchSchema);

batchSchema.index(
  { collegeId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
batchSchema.index({ collegeId: 1, departmentId: 1, status: 1 });
batchSchema.index({ collegeId: 1, graduationYear: 1 });
batchSchema.index({ collegeId: 1, classAdvisorId: 1 });

batchSchema.pre('validate', function (next) {
  if (this.graduationYear <= this.admissionYear) {
    next(new Error('Graduation year must be after the admission year'));
    return;
  }
  next();
});

export const BatchModel = (mongoose.models.Batch as Model<BatchDocument>) ??
  mongoose.model<BatchDocument>('Batch', batchSchema);
