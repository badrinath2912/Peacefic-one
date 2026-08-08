import {
  GENDER,
  SKILL_LEVEL,
  STUDENT_STATUS,
  type Gender,
  type SkillLevel,
  type StudentStatus,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { addressSchemaDefinition, type AddressSubdocument } from './college.model';
import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface StudentSkill {
  name: string;
  level: SkillLevel;
  verified: boolean;
  verifiedVia: Types.ObjectId | null;
}

export interface StudentDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  userId: Types.ObjectId;
  departmentId: Types.ObjectId;
  batchId: Types.ObjectId;
  rollNumber: string;
  registerNumber: string | null;
  admissionNumber: string;
  photoUrl: string | null;
  alternatePhone: string | null;
  programme: string | null;
  section: string | null;
  /**
   * Never the full number. Aadhaar is regulated personal data, so only the
   * last four digits (for display) and a salted hash (for duplicate detection)
   * are persisted — a database dump cannot yield anyone's Aadhaar.
   */
  aadhaar: { last4: string; hash: string } | null;
  admissionDate: Date;
  currentSemester: number;
  dateOfBirth: Date | null;
  gender: Gender | null;
  bloodGroup: string | null;
  category: string | null;
  address: AddressSubdocument | null;
  guardian: {
    name: string;
    relation: string;
    phone: string;
    email: string | null;
  } | null;
  academics: {
    tenthPercent: number | null;
    twelfthPercent: number | null;
    diplomaPercent: number | null;
    currentCgpa: number | null;
    semesterGpas: Array<{ semester: number; gpa: number; credits: number }>;
    activeBacklogs: number;
    totalBacklogs: number;
    yearGap: number;
  };
  skills: StudentSkill[];
  resumeUrl: string | null;
  resumeFileKey: string | null;
  resumeUpdatedAt: Date | null;
  portfolioLinks: {
    github: string | null;
    linkedin: string | null;
    portfolio: string | null;
    other: string[];
  };
  placement: {
    isEligible: boolean;
    eligibilityNote: string | null;
    isPlaced: boolean;
    placementCount: number;
    highestPackage: number | null;
  };
  status: StudentStatus;
}

const studentSkillSchema = new Schema<StudentSkill>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    level: { type: String, enum: SKILL_LEVEL, default: 'beginner' },
    verified: { type: Boolean, default: false },
    verifiedVia: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const studentSchema = new Schema<StudentDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  rollNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  registerNumber: { type: String, default: null, trim: true, maxlength: 40 },
  admissionNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  photoUrl: { type: String, default: null },
  alternatePhone: { type: String, default: null, trim: true, maxlength: 20 },
  programme: { type: String, default: null, trim: true, maxlength: 120 },
  section: { type: String, default: null, trim: true, maxlength: 10 },
  aadhaar: {
    type: new Schema(
      {
        last4: { type: String, required: true, maxlength: 4 },
        // `select: false`: the hash is only ever read by the duplicate check.
        hash: { type: String, required: true, select: false },
      },
      { _id: false },
    ),
    default: null,
  },
  admissionDate: { type: Date, required: true },
  currentSemester: { type: Number, default: 1, min: 1, max: 12 },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, enum: [...GENDER, null], default: null },
  bloodGroup: { type: String, default: null, maxlength: 5 },
  category: { type: String, default: null, maxlength: 30 },
  address: { type: addressSchemaDefinition, default: null },
  guardian: {
    type: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      relation: { type: String, required: true, trim: true, maxlength: 50 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      email: { type: String, default: null, lowercase: true, trim: true },
    },
    default: null,
  },
  academics: {
    tenthPercent: { type: Number, default: null, min: 0, max: 100 },
    twelfthPercent: { type: Number, default: null, min: 0, max: 100 },
    diplomaPercent: { type: Number, default: null, min: 0, max: 100 },
    currentCgpa: { type: Number, default: null, min: 0, max: 10 },
    semesterGpas: {
      type: [
        new Schema(
          {
            semester: { type: Number, required: true, min: 1, max: 12 },
            gpa: { type: Number, required: true, min: 0, max: 10 },
            credits: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    activeBacklogs: { type: Number, default: 0, min: 0 },
    totalBacklogs: { type: Number, default: 0, min: 0 },
    yearGap: { type: Number, default: 0, min: 0 },
  },
  skills: { type: [studentSkillSchema], default: [] },
  resumeUrl: { type: String, default: null },
  resumeFileKey: { type: String, default: null },
  resumeUpdatedAt: { type: Date, default: null },
  portfolioLinks: {
    github: { type: String, default: null },
    linkedin: { type: String, default: null },
    portfolio: { type: String, default: null },
    other: { type: [String], default: [] },
  },
  placement: {
    // Cached rather than computed per query: placement listings filter on this
    // constantly. Recomputed on CGPA/backlog changes and by a nightly job.
    isEligible: { type: Boolean, default: true },
    eligibilityNote: { type: String, default: null, maxlength: 500 },
    isPlaced: { type: Boolean, default: false },
    placementCount: { type: Number, default: 0, min: 0 },
    highestPackage: { type: Number, default: null, min: 0 },
  },
  status: { type: String, enum: STUDENT_STATUS, default: 'active' },
});

applyBasePlugin(studentSchema);
// The Aadhaar hash never leaves the server: exposing it would let anyone test
// whether a given Aadhaar is registered.
applyToJsonTransform(studentSchema, ['aadhaar.hash']);

studentSchema.index(
  { collegeId: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
studentSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
studentSchema.index(
  { collegeId: 1, admissionNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Sparse: most colleges will not collect Aadhaar, and a null must not collide.
studentSchema.index(
  { collegeId: 1, 'aadhaar.hash': 1 },
  { unique: true, partialFilterExpression: { 'aadhaar.hash': { $type: 'string' }, deletedAt: null } },
);
studentSchema.index({ collegeId: 1, batchId: 1, status: 1 });
studentSchema.index({ collegeId: 1, departmentId: 1, status: 1 });
studentSchema.index({ collegeId: 1, 'placement.isEligible': 1, 'placement.isPlaced': 1 });
studentSchema.index({ collegeId: 1, 'academics.currentCgpa': -1 });
studentSchema.index({ collegeId: 1, 'skills.name': 1 });
studentSchema.index({ collegeId: 1, currentSemester: 1 });

export const StudentModel = (mongoose.models.Student as Model<StudentDocument>) ??
  mongoose.model<StudentDocument>('Student', studentSchema);
