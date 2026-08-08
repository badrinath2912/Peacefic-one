import {
  EMPLOYMENT_TYPE,
  FACULTY_STATUS,
  FACULTY_TYPE,
  type EmploymentType,
  type FacultyStatus,
  type FacultyType,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { addressSchemaDefinition, type AddressSubdocument } from './college.model';
import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface FacultyDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  userId: Types.ObjectId;
  departmentId: Types.ObjectId;
  employeeId: string;
  designation: string;
  photoUrl: string | null;
  alternatePhone: string | null;
  address: AddressSubdocument | null;
  emergencyContact: { name: string; relation: string; phone: string } | null;
  employmentType: EmploymentType;
  /** Trainers are faculty with a different employment origin, not a separate model. */
  type: FacultyType;
  joiningDate: Date;
  qualifications: Array<{
    degree: string;
    specialization: string;
    institution: string;
    year: number;
  }>;
  experienceYears: number;
  specializations: string[];
  assignedBatchIds: Types.ObjectId[];
  status: FacultyStatus;
}

const facultySchema = new Schema<FacultyDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  employeeId: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  designation: { type: String, required: true, trim: true, maxlength: 120 },
  photoUrl: { type: String, default: null },
  alternatePhone: { type: String, default: null, trim: true, maxlength: 20 },
  address: { type: addressSchemaDefinition, default: null },
  emergencyContact: {
    type: new Schema(
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        relation: { type: String, required: true, trim: true, maxlength: 50 },
        phone: { type: String, required: true, trim: true, maxlength: 20 },
      },
      { _id: false },
    ),
    default: null,
  },
  employmentType: { type: String, enum: EMPLOYMENT_TYPE, default: 'permanent' },
  type: { type: String, enum: FACULTY_TYPE, default: 'faculty' },
  joiningDate: { type: Date, required: true },
  qualifications: {
    type: [
      new Schema(
        {
          degree: { type: String, required: true, trim: true, maxlength: 80 },
          specialization: { type: String, default: '', trim: true, maxlength: 120 },
          institution: { type: String, required: true, trim: true, maxlength: 200 },
          year: { type: Number, required: true, min: 1900 },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  experienceYears: { type: Number, default: 0, min: 0, max: 60 },
  specializations: { type: [String], default: [] },
  assignedBatchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
  status: { type: String, enum: FACULTY_STATUS, default: 'active' },
});

applyBasePlugin(facultySchema);
applyToJsonTransform(facultySchema);

facultySchema.index(
  { collegeId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
facultySchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
facultySchema.index({ collegeId: 1, departmentId: 1, status: 1 });
facultySchema.index({ collegeId: 1, type: 1, status: 1 });
facultySchema.index({ collegeId: 1, assignedBatchIds: 1 });

export const FacultyModel = (mongoose.models.Faculty as Model<FacultyDocument>) ??
  mongoose.model<FacultyDocument>('Faculty', facultySchema);
