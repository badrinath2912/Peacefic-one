import { TRAINING_ENROLLMENT_STATUS, type TrainingEnrollmentStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface TrainingEnrollmentDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Denormalised so per-batch enrolment reports need no join. */
  batchId: Types.ObjectId;
  status: TrainingEnrollmentStatus;
  enrolledAt: Date;
  enrolledBy: Types.ObjectId | null;
  completedAt: Date | null;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  /**
   * Extension points. Attendance, assessment scores and issued certificates
   * attach here once those modules exist — see PROJECT_PROGRESS.md.
   */
  attendancePercent: number | null;
  assessmentAttemptId: Types.ObjectId | null;
  certificateId: Types.ObjectId | null;
}

/**
 * A separate collection rather than an array on the session.
 *
 * A session can hold up to 10,000 places, and an embedded array of that size
 * would be rewritten on every single enrolment. It is also where attendance,
 * assessment results and certificates will hang once those modules land.
 */
const trainingEnrollmentSchema = new Schema<TrainingEnrollmentDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'TrainingSession', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  status: { type: String, enum: TRAINING_ENROLLMENT_STATUS, default: 'enrolled' },
  enrolledAt: { type: Date, default: Date.now },
  enrolledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  completedAt: { type: Date, default: null },
  withdrawnAt: { type: Date, default: null },
  withdrawalReason: { type: String, default: null, maxlength: 500 },
  attendancePercent: { type: Number, default: null, min: 0, max: 100 },
  assessmentAttemptId: { type: Schema.Types.ObjectId, default: null },
  certificateId: { type: Schema.Types.ObjectId, default: null },
});

applyBasePlugin(trainingEnrollmentSchema);
applyToJsonTransform(trainingEnrollmentSchema);

// One enrolment per student per session.
trainingEnrollmentSchema.index(
  { collegeId: 1, sessionId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
trainingEnrollmentSchema.index({ collegeId: 1, sessionId: 1, status: 1 });
trainingEnrollmentSchema.index({ collegeId: 1, studentId: 1, status: 1 });
trainingEnrollmentSchema.index({ collegeId: 1, batchId: 1 });

export const TrainingEnrollmentModel =
  (mongoose.models.TrainingEnrollment as Model<TrainingEnrollmentDocument>) ??
  mongoose.model<TrainingEnrollmentDocument>('TrainingEnrollment', trainingEnrollmentSchema);
