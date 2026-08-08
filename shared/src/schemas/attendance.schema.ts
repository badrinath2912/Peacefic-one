import { z } from 'zod';

import {
  ATTENDANCE_CONTEXT,
  ATTENDANCE_SESSION_STATUS,
  ATTENDANCE_SESSION_TYPE,
  ATTENDANCE_STATUS,
} from '../constants/enums';

import {
  objectIdSchema,
  paginationQuerySchema,
  time24Schema,
} from './common.schema';

export const createAttendanceSessionSchema = z
  .object({
    batchId: objectIdSchema,
    courseId: objectIdSchema.nullable().optional(),
    date: z.coerce.date(),
    periodNumber: z.number().int().min(1).max(12).nullable().optional(),
    startTime: time24Schema,
    endTime: time24Schema,
    type: z.enum(ATTENDANCE_SESSION_TYPE).default('lecture'),
    // Which subsystem owns this session. Defaults to ordinary class attendance.
    context: z.enum(ATTENDANCE_CONTEXT).default('class'),
    contextId: objectIdSchema.nullable().optional(),
    topic: z.string().trim().max(300).nullable().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  })
  .refine((data) => data.date.getTime() <= Date.now() + 365 * 24 * 60 * 60 * 1000, {
    message: 'Session date is too far in the future',
    path: ['date'],
  });
export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

export const markAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: objectIdSchema,
        status: z.enum(ATTENDANCE_STATUS),
        remarks: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1, 'At least one student must be marked')
    .max(1000),
  lockAfterMarking: z.boolean().default(false),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const updateAttendanceRecordSchema = z.object({
  status: z.enum(ATTENDANCE_STATUS),
  reason: z.string().trim().min(3, 'A reason is required for a correction').max(300),
  remarks: z.string().trim().max(300).nullable().optional(),
});
export type UpdateAttendanceRecordInput = z.infer<typeof updateAttendanceRecordSchema>;

export const unlockSessionSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(500),
});

export const attendanceSessionListQuerySchema = paginationQuerySchema.extend({
  batchId: objectIdSchema.optional(),
  courseId: objectIdSchema.optional(),
  status: z.enum(ATTENDANCE_SESSION_STATUS).optional(),
  type: z.enum(ATTENDANCE_SESSION_TYPE).optional(),
  context: z.enum(ATTENDANCE_CONTEXT).optional(),
  contextId: objectIdSchema.optional(),
  date: z.coerce.date().optional(),
  markedByFacultyId: objectIdSchema.optional(),
});

export const attendanceReportQuerySchema = z.object({
  batchId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  courseId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  threshold: z.coerce.number().min(0).max(100).optional(),
});
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;

export const studentAttendanceQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  courseId: objectIdSchema.optional(),
  period: z.enum(['month', 'semester', 'overall']).default('overall'),
});
