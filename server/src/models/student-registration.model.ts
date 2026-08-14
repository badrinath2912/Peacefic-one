import { APPROVAL_STATUS, type ApprovalStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

/**
 * A student's application to join an institution by join code.
 *
 * **Why this exists rather than fields on `User`.** Authentication already has a
 * home: `verifyEmail` resolves the account with `findByEmail` and throws when
 * there is none, and it already moves `pending_verification → pending_approval`
 * with a comment naming this exact flow. So a self-registering student *is* a
 * `User` from the first request, and their credentials, email verification and
 * login refusal all reuse the existing machinery untouched — no second password
 * hasher, no second verification path.
 *
 * What has no home is the **academic** side of the application: the roll number
 * the applicant typed, who reviewed it, and why it was refused. Those are not
 * authentication concerns and do not belong on `User`. They live here, shaped
 * after `TrainingRequestDocument`, which is this codebase's established
 * request/approval record.
 *
 * `Student` is deliberately **not** created here. It requires `departmentId`,
 * `batchId`, `admissionNumber` and `admissionDate`, none of which an applicant
 * can know — so it is created only at approval, once a reviewer supplies them.
 * There is no placeholder document at any point.
 *
 * No password, hash, OTP or token is stored on this record.
 */
export interface StudentRegistrationDocument extends BaseFields {
  _id: Types.ObjectId;
  /** Derived from the join code on the server; never accepted from a client. */
  collegeId: Types.ObjectId;
  /** The account holding credentials and verification state. */
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  rollNumber: string;
  approvalStatus: ApprovalStatus;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  /** The Student created on approval, so the link is auditable afterwards. */
  studentId: Types.ObjectId | null;
}

const studentRegistrationSchema = new Schema<StudentRegistrationDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  rollNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  approvalStatus: { type: String, enum: APPROVAL_STATUS, default: 'pending', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null, maxlength: 1000 },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
});

applyBasePlugin(studentRegistrationSchema);
applyToJsonTransform(studentRegistrationSchema);

// The reviewer's queue: pending applications for one college, oldest first.
studentRegistrationSchema.index({ collegeId: 1, approvalStatus: 1, createdAt: 1 });

/**
 * One live application per roll number per college. Partial so that a rejected
 * or withdrawn application does not permanently burn the roll number, and so a
 * soft-deleted row never blocks a genuine re-application.
 */
studentRegistrationSchema.index(
  { collegeId: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { approvalStatus: 'pending', deletedAt: null } },
);

export const StudentRegistrationModel: Model<StudentRegistrationDocument> =
  mongoose.models.StudentRegistration ??
  mongoose.model<StudentRegistrationDocument>('StudentRegistration', studentRegistrationSchema);
