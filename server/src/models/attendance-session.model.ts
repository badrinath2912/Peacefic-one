import {
  ATTENDANCE_CONTEXT,
  ATTENDANCE_SESSION_STATUS,
  ATTENDANCE_SESSION_TYPE,
  ATTENDANCE_SOURCE,
  type AttendanceContext,
  type AttendanceSessionStatus,
  type AttendanceSessionType,
  type AttendanceSource,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface AttendanceSessionDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  batchId: Types.ObjectId;
  courseId: Types.ObjectId | null;
  liveClassId: Types.ObjectId | null;
  date: Date;
  periodNumber: number | null;
  startTime: string;
  endTime: string;
  type: AttendanceSessionType;
  /**
   * Which subsystem owns this session. `contextId` points at the owning record
   * — null for ordinary class attendance, a `TrainingSession` id for training.
   * Reusing this model keeps one set of marking, locking and summary rules.
   */
  context: AttendanceContext;
  contextId: Types.ObjectId | null;
  topic: string | null;
  markedByFacultyId: Types.ObjectId | null;
  markedAt: Date | null;
  source: AttendanceSource;
  isLocked: boolean;
  lockedAt: Date | null;
  stats: {
    totalStudents: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    onDutyCount: number;
    percentage: number;
  };
  status: AttendanceSessionStatus;
}

const attendanceSessionSchema = new Schema<AttendanceSessionDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
  liveClassId: { type: Schema.Types.ObjectId, ref: 'LiveClass', default: null },
  // UTC midnight of the college-local day.
  date: { type: Date, required: true },
  periodNumber: { type: Number, default: null, min: 1, max: 12 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  type: { type: String, enum: ATTENDANCE_SESSION_TYPE, default: 'lecture' },
  context: { type: String, enum: ATTENDANCE_CONTEXT, default: 'class' },
  contextId: { type: Schema.Types.ObjectId, default: null },
  topic: { type: String, default: null, maxlength: 300 },
  markedByFacultyId: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null },
  markedAt: { type: Date, default: null },
  source: { type: String, enum: ATTENDANCE_SOURCE, default: 'manual' },
  isLocked: { type: Boolean, default: false },
  lockedAt: { type: Date, default: null },
  stats: {
    totalStudents: { type: Number, default: 0, min: 0 },
    presentCount: { type: Number, default: 0, min: 0 },
    absentCount: { type: Number, default: 0, min: 0 },
    lateCount: { type: Number, default: 0, min: 0 },
    excusedCount: { type: Number, default: 0, min: 0 },
    onDutyCount: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
  },
  status: { type: String, enum: ATTENDANCE_SESSION_STATUS, default: 'pending_marking' },
});

applyBasePlugin(attendanceSessionSchema);
applyToJsonTransform(attendanceSessionSchema);

attendanceSessionSchema.index(
  { collegeId: 1, batchId: 1, date: 1, periodNumber: 1, context: 1, contextId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
attendanceSessionSchema.index({ collegeId: 1, context: 1, contextId: 1, date: -1 });
attendanceSessionSchema.index({ collegeId: 1, batchId: 1, date: -1 });
attendanceSessionSchema.index({ collegeId: 1, date: -1, status: 1 });
attendanceSessionSchema.index({ collegeId: 1, markedByFacultyId: 1, date: -1 });
attendanceSessionSchema.index({ collegeId: 1, isLocked: 1, date: 1 });

export const AttendanceSessionModel =
  (mongoose.models.AttendanceSession as Model<AttendanceSessionDocument>) ??
  mongoose.model<AttendanceSessionDocument>('AttendanceSession', attendanceSessionSchema);
