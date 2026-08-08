import {
  APPROVAL_STATUS,
  PRIORITY,
  TRAINING_STATUS,
  TRAINING_TYPE,
  type ApprovalStatus,
  type Priority,
  type TrainingStatus,
  type TrainingType,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface TrainingRequestDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  reference: string;
  title: string;
  description: string;
  trainingType: TrainingType;
  departmentIds: Types.ObjectId[];
  batchIds: Types.ObjectId[];
  expectedParticipants: number;
  preferredStartDate: Date;
  preferredEndDate: Date;
  durationHours: number;
  mode: 'online' | 'offline' | 'hybrid';
  topics: string[];
  objectives: string | null;
  budget: { currency: string; amount: number } | null;
  attachments: Array<{
    url: string;
    fileName: string;
    fileKey: string;
    sizeBytes: number;
    mimeType: string;
  }>;
  priority: Priority;
  status: TrainingStatus;
  approvalStatus: ApprovalStatus;
  requestedBy: Types.ObjectId | null;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  reviewComments: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  /** Sessions created to deliver this request. */
  sessionIds: Types.ObjectId[];
}

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    fileKey: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, maxlength: 120 },
  },
  { _id: false },
);

const trainingRequestSchema = new Schema<TrainingRequestDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  // Human-quotable in emails and meetings: TR-2608-0042.
  reference: { type: String, required: true, maxlength: 20 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 10000 },
  trainingType: { type: String, enum: TRAINING_TYPE, required: true },
  departmentIds: { type: [Schema.Types.ObjectId], ref: 'Department', default: [] },
  batchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
  expectedParticipants: { type: Number, required: true, min: 1, max: 10000 },
  preferredStartDate: { type: Date, required: true },
  preferredEndDate: { type: Date, required: true },
  durationHours: { type: Number, required: true, min: 1, max: 2000 },
  mode: { type: String, enum: ['online', 'offline', 'hybrid'], default: 'offline' },
  topics: { type: [String], default: [] },
  objectives: { type: String, default: null, maxlength: 5000 },
  budget: {
    type: new Schema(
      {
        currency: { type: String, default: 'INR', maxlength: 3 },
        // Minor units. Never a float.
        amount: { type: Number, required: true, min: 0 },
      },
      { _id: false },
    ),
    default: null,
  },
  attachments: { type: [attachmentSchema], default: [] },
  priority: { type: String, enum: PRIORITY, default: 'medium' },
  status: { type: String, enum: TRAINING_STATUS, default: 'draft' },
  approvalStatus: { type: String, enum: APPROVAL_STATUS, default: 'pending' },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewComments: { type: String, default: null, maxlength: 2000 },
  rejectionReason: { type: String, default: null, maxlength: 2000 },
  cancellationReason: { type: String, default: null, maxlength: 1000 },
  sessionIds: { type: [Schema.Types.ObjectId], ref: 'TrainingSession', default: [] },
});

applyBasePlugin(trainingRequestSchema);
applyToJsonTransform(trainingRequestSchema);

trainingRequestSchema.index(
  { collegeId: 1, reference: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
trainingRequestSchema.index({ collegeId: 1, status: 1, createdAt: -1 });
trainingRequestSchema.index({ collegeId: 1, approvalStatus: 1, priority: -1 });
trainingRequestSchema.index({ collegeId: 1, departmentIds: 1 });
trainingRequestSchema.index({ collegeId: 1, requestedBy: 1, createdAt: -1 });

trainingRequestSchema.pre('validate', function (next) {
  if (this.preferredEndDate < this.preferredStartDate) {
    next(new Error('The end date must be on or after the start date'));
    return;
  }
  next();
});

export const TrainingRequestModel =
  (mongoose.models.TrainingRequest as Model<TrainingRequestDocument>) ??
  mongoose.model<TrainingRequestDocument>('TrainingRequest', trainingRequestSchema);
