import {
  TRAINING_MODE,
  TRAINING_SESSION_STATUS,
  TRAINING_TYPE,
  type TrainingMode,
  type TrainingSessionStatus,
  type TrainingType,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface TrainingSessionDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  requestId: Types.ObjectId | null;
  title: string;
  description: string | null;
  trainingType: TrainingType;
  departmentIds: Types.ObjectId[];
  batchIds: Types.ObjectId[];
  /** Faculty ids, matching how courses store instructors. */
  trainerIds: Types.ObjectId[];
  startDate: Date;
  endDate: Date;
  capacity: number;
  mode: TrainingMode;
  location: string | null;
  meetingLink: string | null;
  learningObjectives: string[];
  topics: string[];
  status: TrainingSessionStatus;
  cancellationReason: string | null;
  completedAt: Date | null;
  feedbackScore: number | null;
  report: string | null;
  stats: {
    enrolledCount: number;
    completedCount: number;
    withdrawnCount: number;
  };
  /**
   * Extension points for modules not yet built. Kept as nullable references so
   * Examinations and Certificates can attach without a migration.
   * See PROJECT_PROGRESS.md → "Remaining dependencies".
   */
  assessmentExamId: Types.ObjectId | null;
  certificateTemplateId: Types.ObjectId | null;
}

const trainingSessionSchema = new Schema<TrainingSessionDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  requestId: { type: Schema.Types.ObjectId, ref: 'TrainingRequest', default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: null, maxlength: 10000 },
  trainingType: { type: String, enum: TRAINING_TYPE, required: true },
  departmentIds: { type: [Schema.Types.ObjectId], ref: 'Department', default: [] },
  batchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
  trainerIds: { type: [Schema.Types.ObjectId], ref: 'Faculty', default: [] },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  capacity: { type: Number, required: true, min: 1, max: 10000 },
  mode: { type: String, enum: TRAINING_MODE, default: 'offline' },
  location: { type: String, default: null, maxlength: 300 },
  meetingLink: { type: String, default: null },
  learningObjectives: { type: [String], default: [] },
  topics: { type: [String], default: [] },
  status: { type: String, enum: TRAINING_SESSION_STATUS, default: 'scheduled' },
  cancellationReason: { type: String, default: null, maxlength: 500 },
  completedAt: { type: Date, default: null },
  feedbackScore: { type: Number, default: null, min: 0, max: 5 },
  report: { type: String, default: null, maxlength: 20000 },
  // Denormalised so a list of sessions does not need a count per row.
  stats: {
    enrolledCount: { type: Number, default: 0, min: 0 },
    completedCount: { type: Number, default: 0, min: 0 },
    withdrawnCount: { type: Number, default: 0, min: 0 },
  },
  assessmentExamId: { type: Schema.Types.ObjectId, default: null },
  certificateTemplateId: { type: Schema.Types.ObjectId, default: null },
});

applyBasePlugin(trainingSessionSchema);
applyToJsonTransform(trainingSessionSchema);

trainingSessionSchema.index({ collegeId: 1, startDate: 1, status: 1 });
trainingSessionSchema.index({ collegeId: 1, trainerIds: 1, startDate: 1 });
trainingSessionSchema.index({ collegeId: 1, departmentIds: 1 });
trainingSessionSchema.index({ collegeId: 1, batchIds: 1 });
trainingSessionSchema.index({ collegeId: 1, requestId: 1 });
// Serves the calendar: a date-range scan bounded by tenant.
trainingSessionSchema.index({ collegeId: 1, startDate: 1, endDate: 1 });

trainingSessionSchema.pre('validate', function (next) {
  if (this.endDate < this.startDate) {
    next(new Error('The end date must be on or after the start date'));
    return;
  }
  next();
});

export const TrainingSessionModel =
  (mongoose.models.TrainingSession as Model<TrainingSessionDocument>) ??
  mongoose.model<TrainingSessionDocument>('TrainingSession', trainingSessionSchema);
