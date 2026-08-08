import { APPLICATION_STATUS, type ApplicationStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface ApplicationStatusEvent {
  from: ApplicationStatus | null;
  to: ApplicationStatus;
  /** Null when the student acted on their own application. */
  actedBy: Types.ObjectId | null;
  actedByRole: 'student' | 'staff';
  at: Date;
  reason: string | null;
  roundOrder: number | null;
}

export interface JobApplicationDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  jobPostingId: Types.ObjectId;
  companyId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Denormalised so office filters do not join through Student on every query. */
  departmentId: Types.ObjectId;
  batchId: Types.ObjectId;

  status: ApplicationStatus;
  /** 0 until the first round; then the round the candidate has reached. */
  currentRound: number;

  coverLetter: string | null;
  answers: Array<{ question: string; answer: string }>;
  /** Copied from the student's profile at apply time, not linked. */
  resumeUrl: string | null;

  /**
   * What the student's record said when they applied.
   *
   * Frozen deliberately: a CGPA that changes after the fact must not rewrite
   * the basis on which someone was admitted to a drive, and a dispute months
   * later needs the figures as they stood.
   */
  eligibilitySnapshot: {
    cgpa: number | null;
    activeBacklogs: number;
    totalBacklogs: number;
    attendancePercent: number | null;
    capturedAt: Date;
  };

  appliedAt: Date;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  selectedAt: Date | null;

  /** Every status change, oldest first. */
  history: ApplicationStatusEvent[];
}

const statusEventSchema = new Schema<ApplicationStatusEvent>(
  {
    from: { type: String, enum: [...APPLICATION_STATUS, null], default: null },
    to: { type: String, enum: APPLICATION_STATUS, required: true },
    actedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actedByRole: { type: String, enum: ['student', 'staff'], required: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: null, maxlength: 1000 },
    roundOrder: { type: Number, default: null, min: 0, max: 20 },
  },
  { _id: false },
);

const jobApplicationSchema = new Schema<JobApplicationDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },

  status: { type: String, enum: APPLICATION_STATUS, default: 'applied' },
  currentRound: { type: Number, default: 0, min: 0, max: 20 },

  coverLetter: { type: String, default: null, maxlength: 5000 },
  answers: {
    type: [
      new Schema(
        {
          question: { type: String, required: true, maxlength: 500 },
          answer: { type: String, required: true, maxlength: 5000 },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  resumeUrl: { type: String, default: null },

  eligibilitySnapshot: {
    cgpa: { type: Number, default: null },
    activeBacklogs: { type: Number, default: 0 },
    totalBacklogs: { type: Number, default: 0 },
    attendancePercent: { type: Number, default: null },
    capturedAt: { type: Date, default: Date.now },
  },

  appliedAt: { type: Date, default: Date.now },
  withdrawnAt: { type: Date, default: null },
  withdrawalReason: { type: String, default: null, maxlength: 1000 },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null, maxlength: 1000 },
  selectedAt: { type: Date, default: null },

  history: { type: [statusEventSchema], default: [] },
});

applyBasePlugin(jobApplicationSchema);
applyToJsonTransform(jobApplicationSchema);

/**
 * One application per student per posting.
 *
 * Enforced at the database rather than only in the service: two requests that
 * arrive together would both pass a "have you applied?" check and both insert,
 * and a duplicate application means a student appears twice on a shortlist.
 */
jobApplicationSchema.index(
  { collegeId: 1, jobPostingId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
jobApplicationSchema.index({ collegeId: 1, jobPostingId: 1, status: 1 });
jobApplicationSchema.index({ collegeId: 1, studentId: 1, appliedAt: -1 });
jobApplicationSchema.index({ collegeId: 1, companyId: 1, status: 1 });
jobApplicationSchema.index({ collegeId: 1, departmentId: 1, status: 1 });
jobApplicationSchema.index({ collegeId: 1, batchId: 1, status: 1 });

export const JobApplicationModel =
  (mongoose.models.JobApplication as Model<JobApplicationDocument>) ??
  mongoose.model<JobApplicationDocument>('JobApplication', jobApplicationSchema);
