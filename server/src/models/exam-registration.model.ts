import {
  EXAM_REGISTRATION_STATUS,
  type ExamRegistrationStatus,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface ExamRegistrationDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Denormalised so per-batch hall ticket runs need no join. */
  batchId: Types.ObjectId;
  /** Unique per exam; printed on the hall ticket. */
  hallTicketNumber: string;
  seatNumber: string | null;
  status: ExamRegistrationStatus;
  /** Which sitting this is for the student on this exam. */
  attempt: number;
  registeredAt: Date;
  registeredBy: Types.ObjectId | null;
  statusReason: string | null;
}

const examRegistrationSchema = new Schema<ExamRegistrationDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  hallTicketNumber: { type: String, required: true, maxlength: 30 },
  seatNumber: { type: String, default: null, maxlength: 20 },
  status: { type: String, enum: EXAM_REGISTRATION_STATUS, default: 'registered' },
  attempt: { type: Number, default: 1, min: 1, max: 20 },
  registeredAt: { type: Date, default: Date.now },
  registeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  statusReason: { type: String, default: null, maxlength: 500 },
});

applyBasePlugin(examRegistrationSchema);
applyToJsonTransform(examRegistrationSchema);

// One registration per student per exam.
examRegistrationSchema.index(
  { collegeId: 1, examId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examRegistrationSchema.index(
  { collegeId: 1, examId: 1, hallTicketNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examRegistrationSchema.index({ collegeId: 1, examId: 1, status: 1 });
examRegistrationSchema.index({ collegeId: 1, studentId: 1 });

export const ExamRegistrationModel =
  (mongoose.models.ExamRegistration as Model<ExamRegistrationDocument>) ??
  mongoose.model<ExamRegistrationDocument>('ExamRegistration', examRegistrationSchema);
