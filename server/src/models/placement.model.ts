import { PLACEMENT_STATUS, type PlacementStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface PlacementStatusEvent {
  from: PlacementStatus | null;
  to: PlacementStatus;
  /** Null when the student answered their own offer. */
  actedBy: Types.ObjectId | null;
  actedByRole: 'student' | 'staff';
  at: Date;
  reason: string | null;
}

/**
 * An employment offer.
 *
 * Named `Placement` rather than `JobOffer` because the shared contracts, the
 * `PLACEMENT_STATUS` enum, the `placement:*` permissions and
 * `StudentRepository.recordPlacement` already describe this record under that
 * name. A second concept covering the same thing would leave two half-used
 * vocabularies in one module.
 */
export interface PlacementDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  studentId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobPostingId: Types.ObjectId;
  companyId: Types.ObjectId;
  /** Denormalised so placement reports group without joining through Student. */
  departmentId: Types.ObjectId;
  batchId: Types.ObjectId;

  offerDate: Date;
  joiningDate: Date | null;
  designation: string;
  location: string;
  jobType: 'full_time' | 'internship' | 'internship_ppo';

  package: {
    currency: string;
    ctc: number;
    fixed: number | null;
    variable: number | null;
    stipendPerMonth: number | null;
    bondMonths: number | null;
  };

  /**
   * The offer a student intends to take, where they hold several. Placement
   * statistics count primary offers so one student with three offers is one
   * placement, not three.
   */
  isPrimaryOffer: boolean;
  academicYear: string;
  status: PlacementStatus;

  /** The signed letter, uploaded through the existing storage abstraction. */
  offerLetter: {
    url: string;
    fileName: string;
    fileKey: string;
    sizeBytes: number;
    mimeType: string;
  } | null;

  respondedAt: Date | null;
  declineReason: string | null;
  revokeReason: string | null;
  joinedAt: Date | null;
  notes: string | null;

  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;

  history: PlacementStatusEvent[];
}

const statusEventSchema = new Schema<PlacementStatusEvent>(
  {
    from: { type: String, enum: [...PLACEMENT_STATUS, null], default: null },
    to: { type: String, enum: PLACEMENT_STATUS, required: true },
    actedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actedByRole: { type: String, enum: ['student', 'staff'], required: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false },
);

const placementSchema = new Schema<PlacementDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'JobApplication', required: true },
  jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },

  offerDate: { type: Date, required: true },
  joiningDate: { type: Date, default: null },
  designation: { type: String, required: true, trim: true, maxlength: 160 },
  location: { type: String, required: true, trim: true, maxlength: 160 },
  jobType: {
    type: String,
    enum: ['full_time', 'internship', 'internship_ppo'],
    required: true,
  },

  package: {
    currency: { type: String, default: 'INR', maxlength: 3 },
    ctc: { type: Number, required: true, min: 0 },
    fixed: { type: Number, default: null, min: 0 },
    variable: { type: Number, default: null, min: 0 },
    stipendPerMonth: { type: Number, default: null, min: 0 },
    bondMonths: { type: Number, default: null, min: 0, max: 120 },
  },

  isPrimaryOffer: { type: Boolean, default: true },
  academicYear: { type: String, required: true, maxlength: 9 },
  status: { type: String, enum: PLACEMENT_STATUS, default: 'offered' },

  offerLetter: {
    type: new Schema(
      {
        url: { type: String, required: true },
        fileName: { type: String, required: true, maxlength: 255 },
        fileKey: { type: String, required: true },
        sizeBytes: { type: Number, required: true, min: 0 },
        mimeType: { type: String, required: true, maxlength: 120 },
      },
      { _id: false },
    ),
    default: null,
  },

  respondedAt: { type: Date, default: null },
  declineReason: { type: String, default: null, maxlength: 1000 },
  revokeReason: { type: String, default: null, maxlength: 1000 },
  joinedAt: { type: Date, default: null },
  notes: { type: String, default: null, maxlength: 1000 },

  isVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  history: { type: [statusEventSchema], default: [] },
});

applyBasePlugin(placementSchema);
applyToJsonTransform(placementSchema);

/**
 * One offer per application.
 *
 * Enforced at the database rather than only in the service: two requests that
 * arrive together would both pass a "does an offer exist?" check and both
 * insert, leaving a student with duplicate offers for one selection.
 */
placementSchema.index(
  { collegeId: 1, applicationId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

/**
 * At most one primary offer per student per academic year. Partial, so the
 * non-primary offers a student is weighing up never collide.
 */
placementSchema.index(
  { collegeId: 1, studentId: 1, academicYear: 1, isPrimaryOffer: 1 },
  { unique: true, partialFilterExpression: { isPrimaryOffer: true, deletedAt: null } },
);

placementSchema.index({ collegeId: 1, studentId: 1, status: 1 });
placementSchema.index({ collegeId: 1, companyId: 1, status: 1 });
placementSchema.index({ collegeId: 1, departmentId: 1, academicYear: 1 });
placementSchema.index({ collegeId: 1, batchId: 1, academicYear: 1 });
placementSchema.index({ collegeId: 1, status: 1, offerDate: -1 });
// Serves the highest/average CTC figures on the placement report.
placementSchema.index({ collegeId: 1, academicYear: 1, 'package.ctc': -1 });

export const PlacementModel = (mongoose.models.Placement as Model<PlacementDocument>) ??
  mongoose.model<PlacementDocument>('Placement', placementSchema);
