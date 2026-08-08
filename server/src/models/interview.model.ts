import {
  INTERVIEW_MODE,
  INTERVIEW_RESULT_STATUS,
  INTERVIEW_STATUS,
  SELECTION_ROUND_TYPE,
  type InterviewMode,
  type InterviewResultStatus,
  type InterviewStatus,
  type SelectionRoundType,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface InterviewStatusEvent {
  from: InterviewStatus | null;
  to: InterviewStatus;
  /** Null when the student acted on their own interview. */
  actedBy: Types.ObjectId | null;
  actedByRole: 'student' | 'staff';
  at: Date;
  reason: string | null;
}

/**
 * One round of one application's selection process.
 *
 * Every field here comes from a contract that already existed:
 * `scheduleInterviewSchema` supplies the slot and panel, `INTERVIEW_STATUS` the
 * lifecycle, `recordInterviewResultSchema` the outcome and
 * `requestRescheduleSchema` the student's request. Nothing was invented to fill
 * the shape out.
 *
 * The round is identified by `roundOrder`, matching `JobPosting.selectionRounds`
 * and `JobApplication.currentRound`, so the three agree on what "round 2" means
 * without another join.
 */
export interface InterviewDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  applicationId: Types.ObjectId;
  /** Denormalised from the application so the student's list needs no join. */
  studentId: Types.ObjectId;
  jobPostingId: Types.ObjectId;
  companyId: Types.ObjectId;

  roundOrder: number;
  roundName: string;
  type: SelectionRoundType;
  mode: InterviewMode;

  scheduledAt: Date;
  durationMinutes: number;
  venue: string | null;
  meetingLink: string | null;

  interviewers: Array<{ name: string; designation: string; email: string | null }>;
  panelNumber: string | null;
  instructions: string | null;

  status: InterviewStatus;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;

  /**
   * The outcome of the round. `pending` until someone records it — an
   * interview that has happened but has no verdict yet is a real state, not a
   * missing value.
   */
  result: {
    status: InterviewResultStatus;
    score: number | null;
    maxScore: number | null;
    feedback: string | null;
    strengths: string[];
    improvements: string[];
    recordedAt: Date | null;
    recordedBy: Types.ObjectId | null;
  };

  /**
   * What the student asked for, if anything. Kept separate from the schedule
   * itself: a request is not a change, and only the office may move the slot.
   */
  rescheduleRequest: {
    reason: string;
    preferredSlots: Date[];
    requestedAt: Date;
  } | null;

  history: InterviewStatusEvent[];
}

const statusEventSchema = new Schema<InterviewStatusEvent>(
  {
    from: { type: String, enum: [...INTERVIEW_STATUS, null], default: null },
    to: { type: String, enum: INTERVIEW_STATUS, required: true },
    actedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actedByRole: { type: String, enum: ['student', 'staff'], required: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false },
);

const interviewSchema = new Schema<InterviewDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'JobApplication', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },

  roundOrder: { type: Number, required: true, min: 1, max: 20 },
  roundName: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: SELECTION_ROUND_TYPE, required: true },
  mode: { type: String, enum: INTERVIEW_MODE, default: 'online' },

  scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 45, min: 5, max: 600 },
  venue: { type: String, default: null, maxlength: 300 },
  meetingLink: { type: String, default: null },

  interviewers: {
    type: [
      new Schema(
        {
          name: { type: String, required: true, maxlength: 120 },
          designation: { type: String, default: '', maxlength: 120 },
          email: { type: String, default: null, maxlength: 160 },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  panelNumber: { type: String, default: null, maxlength: 40 },
  instructions: { type: String, default: null, maxlength: 2000 },

  status: { type: String, enum: INTERVIEW_STATUS, default: 'scheduled' },
  confirmedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: null, maxlength: 1000 },

  result: {
    status: { type: String, enum: INTERVIEW_RESULT_STATUS, default: 'pending' },
    score: { type: Number, default: null, min: 0, max: 1000 },
    maxScore: { type: Number, default: null, min: 0, max: 1000 },
    feedback: { type: String, default: null, maxlength: 5000 },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    recordedAt: { type: Date, default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },

  rescheduleRequest: {
    type: new Schema(
      {
        reason: { type: String, required: true, maxlength: 1000 },
        preferredSlots: { type: [Date], default: [] },
        requestedAt: { type: Date, default: Date.now },
      },
      { _id: false },
    ),
    default: null,
  },

  history: { type: [statusEventSchema], default: [] },
});

applyBasePlugin(interviewSchema);
applyToJsonTransform(interviewSchema);

/**
 * One interview per round per application.
 *
 * Enforced at the database rather than only in the service: bulk scheduling
 * writes many rows at once, and two overlapping requests would each pass a
 * "does this round already have an interview?" check and both insert, leaving
 * a candidate with two slots for the same round.
 */
interviewSchema.index(
  { collegeId: 1, applicationId: 1, roundOrder: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

/** The student's own list, in date order — `GET /interviews/me`. */
interviewSchema.index({ collegeId: 1, studentId: 1, scheduledAt: -1 });

/** The office list, which filters by drive and status before anything else. */
interviewSchema.index({ collegeId: 1, jobPostingId: 1, status: 1 });

/** The day view, and the upcoming-interview queries behind it. */
interviewSchema.index({ collegeId: 1, scheduledAt: 1, status: 1 });

export const InterviewModel = (mongoose.models.Interview as Model<InterviewDocument>) ??
  mongoose.model<InterviewDocument>('Interview', interviewSchema);
