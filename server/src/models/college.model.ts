import {
  COLLEGE_STATUS,
  COLLEGE_TYPE,
  GRADING_SCALE,
  type CollegeStatus,
  type CollegeType,
  type GradingScale,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface AddressSubdocument {
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  state: string;
  country: string;
  pincode: string;
}

export interface CollegeDocument extends BaseFields {
  _id: Types.ObjectId;
  name: string;
  code: string;
  type: CollegeType;
  affiliatedTo: string | null;
  accreditation: string[];
  establishedYear: number;
  logoUrl: string | null;
  website: string | null;
  email: string;
  phone: string;
  address: AddressSubdocument;
  timezone: string;
  academicYearStartMonth: number;
  status: CollegeStatus;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  primaryContact: {
    name: string;
    email: string;
    phone: string;
    designation: string;
  };
  settings: {
    allowStudentSelfRegistration: boolean;
    joinCode: string | null;
    attendanceThresholdPercent: number;
    gradingScale: GradingScale;
    certificateSignatory: {
      name: string;
      designation: string;
      signatureUrl: string | null;
    };
  };
  stats: {
    totalStudents: number;
    totalFaculty: number;
    totalDepartments: number;
    totalBatches: number;
  };
}

export const addressSchemaDefinition = {
  line1: { type: String, required: true, trim: true, maxlength: 200 },
  line2: { type: String, default: null, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  district: { type: String, default: null, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  country: { type: String, default: 'India', trim: true, maxlength: 100 },
  pincode: { type: String, required: true, trim: true, maxlength: 12 },
} as const;

const collegeSchema = new Schema<CollegeDocument>({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  type: { type: String, enum: COLLEGE_TYPE, required: true },
  affiliatedTo: { type: String, default: null, trim: true, maxlength: 200 },
  accreditation: { type: [String], default: [] },
  establishedYear: { type: Number, required: true, min: 1800 },
  logoUrl: { type: String, default: null },
  website: { type: String, default: null },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  address: { type: addressSchemaDefinition, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  academicYearStartMonth: { type: Number, default: 6, min: 1, max: 12 },
  status: { type: String, enum: COLLEGE_STATUS, default: 'pending', required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null, maxlength: 1000 },
  primaryContact: {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true, maxlength: 120 },
  },
  settings: {
    allowStudentSelfRegistration: { type: Boolean, default: false },
    // Rotatable: a leaked join code is otherwise an open door into a tenant.
    joinCode: { type: String, default: null, select: false },
    attendanceThresholdPercent: { type: Number, default: 75, min: 0, max: 100 },
    gradingScale: { type: String, enum: GRADING_SCALE, default: 'gpa_10' },
    certificateSignatory: {
      name: { type: String, default: '' },
      designation: { type: String, default: '' },
      signatureUrl: { type: String, default: null },
    },
  },
  // Denormalised counters, maintained transactionally and reconciled nightly.
  stats: {
    totalStudents: { type: Number, default: 0, min: 0 },
    totalFaculty: { type: Number, default: 0, min: 0 },
    totalDepartments: { type: Number, default: 0, min: 0 },
    totalBatches: { type: Number, default: 0, min: 0 },
  },
});

applyBasePlugin(collegeSchema);
applyToJsonTransform(collegeSchema);

collegeSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
collegeSchema.index({ status: 1, createdAt: -1 });
collegeSchema.index({ name: 'text', code: 'text' });

export const CollegeModel = (mongoose.models.College as Model<CollegeDocument>) ??
  mongoose.model<CollegeDocument>('College', collegeSchema);
