import { DEPARTMENT_STATUS, type DepartmentStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface DepartmentDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  name: string;
  code: string;
  hodId: Types.ObjectId | null;
  description: string | null;
  establishedYear: number | null;
  status: DepartmentStatus;
  stats: {
    totalStudents: number;
    totalFaculty: number;
    totalBatches: number;
  };
}

const departmentSchema = new Schema<DepartmentDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  hodId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  description: { type: String, default: null, maxlength: 1000 },
  establishedYear: { type: Number, default: null, min: 1800 },
  status: { type: String, enum: DEPARTMENT_STATUS, default: 'active' },
  stats: {
    totalStudents: { type: Number, default: 0, min: 0 },
    totalFaculty: { type: Number, default: 0, min: 0 },
    totalBatches: { type: Number, default: 0, min: 0 },
  },
});

applyBasePlugin(departmentSchema);
applyToJsonTransform(departmentSchema);

departmentSchema.index(
  { collegeId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
departmentSchema.index({ collegeId: 1, status: 1 });
departmentSchema.index({ collegeId: 1, hodId: 1 });
departmentSchema.index({ collegeId: 1, name: 1 });

export const DepartmentModel = (mongoose.models.Department as Model<DepartmentDocument>) ??
  mongoose.model<DepartmentDocument>('Department', departmentSchema);
