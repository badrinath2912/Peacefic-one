import { ATTENDANCE_STATUS, type AttendanceStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface AttendanceRecordDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Denormalised from the session so per-student range queries need no join. */
  batchId: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  markedBy: Types.ObjectId | null;
  markedAt: Date;
  remarks: string | null;
  modifiedHistory: Array<{
    from: AttendanceStatus;
    to: AttendanceStatus;
    by: Types.ObjectId;
    at: Date;
    reason: string;
  }>;
}

const attendanceRecordSchema = new Schema<AttendanceRecordDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ATTENDANCE_STATUS, required: true },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  markedAt: { type: Date, default: Date.now },
  remarks: { type: String, default: null, maxlength: 300 },
  // Attendance is contested; an audit trail on the record itself is more
  // useful than reconstructing it from the global activity log.
  modifiedHistory: {
    type: [
      new Schema(
        {
          from: { type: String, enum: ATTENDANCE_STATUS, required: true },
          to: { type: String, enum: ATTENDANCE_STATUS, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          at: { type: Date, default: Date.now },
          reason: { type: String, required: true, maxlength: 300 },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
});

applyBasePlugin(attendanceRecordSchema);
applyToJsonTransform(attendanceRecordSchema);

attendanceRecordSchema.index(
  { collegeId: 1, sessionId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
attendanceRecordSchema.index({ collegeId: 1, studentId: 1, date: -1 });
attendanceRecordSchema.index({ collegeId: 1, batchId: 1, date: -1, status: 1 });
attendanceRecordSchema.index({ collegeId: 1, studentId: 1, status: 1, date: -1 });

export const AttendanceRecordModel =
  (mongoose.models.AttendanceRecord as Model<AttendanceRecordDocument>) ??
  mongoose.model<AttendanceRecordDocument>('AttendanceRecord', attendanceRecordSchema);
