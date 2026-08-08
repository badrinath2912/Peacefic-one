import {
  JOB_STATUS,
  JOB_TYPE,
  SELECTION_ROUND_TYPE,
  WORK_MODE,
  type JobStatus,
  type JobType,
  type SelectionRoundType,
  type WorkMode,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface JobEligibility {
  departmentIds: Types.ObjectId[];
  batchIds: Types.ObjectId[];
  graduationYears: number[];
  minCgpa: number | null;
  maxActiveBacklogs: number | null;
  maxTotalBacklogs: number | null;
  minTenthPercent: number | null;
  minTwelfthPercent: number | null;
  minDiplomaPercent: number | null;
  minAttendancePercent: number | null;
  maxYearGap: number | null;
  genderRestriction: 'any' | 'female_only';
  requiredSkills: string[];
  qualifications: string[];
  allowPlacedStudents: boolean;
  customCriteria: string | null;
}

export interface SelectionRound {
  order: number;
  name: string;
  type: SelectionRoundType;
  mode: 'online' | 'offline';
  durationMinutes: number | null;
  description: string | null;
}

export interface JobPostingDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  companyId: Types.ObjectId;
  title: string;
  description: string;
  jobType: JobType;
  workMode: WorkMode;
  locations: string[];
  openings: number;

  compensation: {
    currency: string;
    ctcMin: number;
    ctcMax: number;
    fixedComponent: number | null;
    variableComponent: number | null;
    stipendPerMonth: number | null;
    bondMonths: number | null;
    bondAmount: number | null;
  };

  eligibility: JobEligibility;
  selectionRounds: SelectionRound[];

  applicationOpenAt: Date;
  applicationCloseAt: Date;
  driveDate: Date | null;

  attachments: Array<{
    url: string;
    fileName: string;
    fileKey: string;
    sizeBytes: number;
    mimeType: string;
  }>;

  status: JobStatus;
  publishedAt: Date | null;
  publishedBy: Types.ObjectId | null;
  closedAt: Date | null;
  closureReason: string | null;

  stats: {
    eligibleCount: number;
    applicationCount: number;
    shortlistedCount: number;
    selectedCount: number;
    /** Recomputed when eligibility changes, so the list need not evaluate. */
    eligibilityComputedAt: Date | null;
  };
}

const eligibilitySchema = new Schema<JobEligibility>(
  {
    departmentIds: { type: [Schema.Types.ObjectId], ref: 'Department', default: [] },
    batchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
    graduationYears: { type: [Number], default: [] },
    minCgpa: { type: Number, default: null, min: 0, max: 10 },
    maxActiveBacklogs: { type: Number, default: null, min: 0, max: 50 },
    maxTotalBacklogs: { type: Number, default: null, min: 0, max: 50 },
    minTenthPercent: { type: Number, default: null, min: 0, max: 100 },
    minTwelfthPercent: { type: Number, default: null, min: 0, max: 100 },
    minDiplomaPercent: { type: Number, default: null, min: 0, max: 100 },
    minAttendancePercent: { type: Number, default: null, min: 0, max: 100 },
    maxYearGap: { type: Number, default: null, min: 0, max: 20 },
    genderRestriction: { type: String, enum: ['any', 'female_only'], default: 'any' },
    requiredSkills: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },
    allowPlacedStudents: { type: Boolean, default: false },
    customCriteria: { type: String, default: null, maxlength: 2000 },
  },
  { _id: false },
);

const selectionRoundSchema = new Schema<SelectionRound>(
  {
    order: { type: Number, required: true, min: 1, max: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: SELECTION_ROUND_TYPE, required: true },
    mode: { type: String, enum: ['online', 'offline'], default: 'online' },
    durationMinutes: { type: Number, default: null, min: 1, max: 600 },
    description: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false },
);

const jobPostingSchema = new Schema<JobPostingDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 20000 },
  jobType: { type: String, enum: JOB_TYPE, required: true },
  workMode: { type: String, enum: WORK_MODE, default: 'onsite' },
  locations: { type: [String], default: [] },
  openings: { type: Number, required: true, min: 1, max: 10000 },

  compensation: {
    currency: { type: String, default: 'INR', maxlength: 3 },
    ctcMin: { type: Number, required: true, min: 0 },
    ctcMax: { type: Number, required: true, min: 0 },
    fixedComponent: { type: Number, default: null, min: 0 },
    variableComponent: { type: Number, default: null, min: 0 },
    stipendPerMonth: { type: Number, default: null, min: 0 },
    bondMonths: { type: Number, default: null, min: 0, max: 120 },
    bondAmount: { type: Number, default: null, min: 0 },
  },

  eligibility: { type: eligibilitySchema, default: () => ({}) },
  selectionRounds: { type: [selectionRoundSchema], default: [] },

  applicationOpenAt: { type: Date, required: true },
  applicationCloseAt: { type: Date, required: true },
  driveDate: { type: Date, default: null },

  attachments: {
    type: [
      new Schema(
        {
          url: { type: String, required: true },
          fileName: { type: String, required: true, maxlength: 255 },
          fileKey: { type: String, required: true },
          sizeBytes: { type: Number, required: true, min: 0 },
          mimeType: { type: String, required: true, maxlength: 120 },
        },
        { _id: false },
      ),
    ],
    default: [],
  },

  status: { type: String, enum: JOB_STATUS, default: 'draft' },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null },
  closureReason: { type: String, default: null, maxlength: 500 },

  stats: {
    eligibleCount: { type: Number, default: 0, min: 0 },
    applicationCount: { type: Number, default: 0, min: 0 },
    shortlistedCount: { type: Number, default: 0, min: 0 },
    selectedCount: { type: Number, default: 0, min: 0 },
    eligibilityComputedAt: { type: Date, default: null },
  },
});

applyBasePlugin(jobPostingSchema);
applyToJsonTransform(jobPostingSchema);

jobPostingSchema.index({ collegeId: 1, companyId: 1, status: 1 });
jobPostingSchema.index({ collegeId: 1, status: 1, applicationCloseAt: 1 });
jobPostingSchema.index({ collegeId: 1, jobType: 1, status: 1 });
jobPostingSchema.index({ collegeId: 1, driveDate: -1 });
// Serves the student's "which drives am I eligible for" query.
jobPostingSchema.index({ collegeId: 1, 'eligibility.departmentIds': 1, status: 1 });
jobPostingSchema.index({ collegeId: 1, 'eligibility.batchIds': 1, status: 1 });
jobPostingSchema.index({ collegeId: 1, title: 'text' });

jobPostingSchema.pre('validate', function (next) {
  if (this.applicationCloseAt <= this.applicationOpenAt) {
    next(new Error('Applications must close after they open'));
    return;
  }

  if (this.compensation.ctcMax < this.compensation.ctcMin) {
    next(new Error('Maximum CTC must be at least the minimum'));
    return;
  }

  next();
});

export const JobPostingModel = (mongoose.models.JobPosting as Model<JobPostingDocument>) ??
  mongoose.model<JobPostingDocument>('JobPosting', jobPostingSchema);
