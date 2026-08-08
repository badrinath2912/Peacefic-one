import { EXAM_ATTENDANCE_STATUS, type ExamAttendanceStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface ExamAttendanceDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  registrationId: Types.ObjectId;
  status: ExamAttendanceStatus;
  remarks: string | null;
  markedBy: Types.ObjectId | null;
  markedAt: Date;
  modifiedHistory: Array<{
    from: ExamAttendanceStatus;
    to: ExamAttendanceStatus;
    by: Types.ObjectId;
    at: Date;
    reason: string;
  }>;
}

/**
 * Separate from `AttendanceSession`, deliberately.
 *
 * Class attendance is periodic and aggregates into a percentage. Exam
 * attendance is a single fact per sitting that decides whether a result exists
 * at all, and carries outcomes class attendance has no concept of — `debarred`
 * and `malpractice`. Forcing them into one model would mean one of the two
 * carrying fields that never apply to it.
 */
const examAttendanceSchema = new Schema<ExamAttendanceDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  registrationId: { type: Schema.Types.ObjectId, ref: 'ExamRegistration', required: true },
  status: { type: String, enum: EXAM_ATTENDANCE_STATUS, required: true },
  remarks: { type: String, default: null, maxlength: 300 },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  markedAt: { type: Date, default: Date.now },
  // Contested far more often than class attendance, so corrections are kept
  // on the record itself.
  modifiedHistory: {
    type: [
      new Schema(
        {
          from: { type: String, enum: EXAM_ATTENDANCE_STATUS, required: true },
          to: { type: String, enum: EXAM_ATTENDANCE_STATUS, required: true },
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

applyBasePlugin(examAttendanceSchema);
applyToJsonTransform(examAttendanceSchema);

examAttendanceSchema.index(
  { collegeId: 1, examId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examAttendanceSchema.index({ collegeId: 1, examId: 1, status: 1 });
examAttendanceSchema.index({ collegeId: 1, studentId: 1 });

export const ExamAttendanceModel =
  (mongoose.models.ExamAttendance as Model<ExamAttendanceDocument>) ??
  mongoose.model<ExamAttendanceDocument>('ExamAttendance', examAttendanceSchema);
