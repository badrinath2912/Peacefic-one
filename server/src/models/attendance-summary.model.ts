import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export type SummaryPeriod = 'month' | 'semester' | 'overall';

export interface AttendanceSummaryDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  studentId: Types.ObjectId;
  batchId: Types.ObjectId;
  courseId: Types.ObjectId | null;
  period: SummaryPeriod;
  periodKey: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  onDutyCount: number;
  percentage: number;
  isBelowThreshold: boolean;
  computedAt: Date;
}

/**
 * Materialised rollup. The attendance percentage appears on both dashboards,
 * every eligibility check and every defaulter report; recomputing it from
 * millions of records on each read is not viable.
 */
const attendanceSummarySchema = new Schema<AttendanceSummaryDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
  period: { type: String, enum: ['month', 'semester', 'overall'], required: true },
  periodKey: { type: String, required: true, maxlength: 20 },
  totalSessions: { type: Number, default: 0, min: 0 },
  presentCount: { type: Number, default: 0, min: 0 },
  absentCount: { type: Number, default: 0, min: 0 },
  lateCount: { type: Number, default: 0, min: 0 },
  excusedCount: { type: Number, default: 0, min: 0 },
  onDutyCount: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  isBelowThreshold: { type: Boolean, default: false },
  computedAt: { type: Date, default: Date.now },
});

applyBasePlugin(attendanceSummarySchema);
applyToJsonTransform(attendanceSummarySchema);

attendanceSummarySchema.index(
  { collegeId: 1, studentId: 1, period: 1, periodKey: 1, courseId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
attendanceSummarySchema.index({ collegeId: 1, batchId: 1, isBelowThreshold: 1 });
attendanceSummarySchema.index({ collegeId: 1, period: 1, percentage: 1 });

export const AttendanceSummaryModel =
  (mongoose.models.AttendanceSummary as Model<AttendanceSummaryDocument>) ??
  mongoose.model<AttendanceSummaryDocument>('AttendanceSummary', attendanceSummarySchema);
