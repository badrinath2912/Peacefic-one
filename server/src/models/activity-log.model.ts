import {
  AUDIT_CATEGORY,
  AUDIT_SEVERITY,
  type AuditCategory,
  type AuditSeverity,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface ActivityLogDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  /** Denormalised so the entry stays meaningful after the user is anonymised. */
  userEmail: string | null;
  userRole: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  entity: { type: string; id: Types.ObjectId | null; label: string | null } | null;
  changes: Array<{ field: string; from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure';
  errorMessage: string | null;
}

/**
 * Declared as its own schema because the subdocument has a field literally
 * named `type`; inline, Mongoose reads that as the SchemaType declaration for
 * the parent path and rejects the definition.
 */
const entityRefSchema = new Schema(
  {
    type: { type: String, maxlength: 60 },
    id: { type: Schema.Types.ObjectId, default: null },
    label: { type: String, default: null, maxlength: 200 },
  },
  { _id: false },
);

const activityLogSchema = new Schema<ActivityLogDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  userEmail: { type: String, default: null, lowercase: true, maxlength: 254 },
  userRole: { type: String, default: null, maxlength: 60 },
  action: { type: String, required: true, maxlength: 100 },
  category: { type: String, enum: AUDIT_CATEGORY, required: true },
  severity: { type: String, enum: AUDIT_SEVERITY, default: 'info' },
  entity: { type: entityRefSchema, default: null },
  changes: { type: Schema.Types.Mixed, default: null },
  metadata: { type: Schema.Types.Mixed, default: null },
  ip: { type: String, default: null, maxlength: 60 },
  userAgent: { type: String, default: null, maxlength: 500 },
  requestId: { type: String, default: null, maxlength: 60 },
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
  errorMessage: { type: String, default: null, maxlength: 1000 },
});

applyBasePlugin(activityLogSchema);
applyToJsonTransform(activityLogSchema);

activityLogSchema.index({ collegeId: 1, createdAt: -1 });
activityLogSchema.index({ collegeId: 1, userId: 1, createdAt: -1 });
activityLogSchema.index({ collegeId: 1, action: 1, createdAt: -1 });
activityLogSchema.index({ collegeId: 1, 'entity.type': 1, 'entity.id': 1, createdAt: -1 });
activityLogSchema.index({ collegeId: 1, severity: 1, createdAt: -1 });

/**
 * Audit logs are append-only. Retention is handled by archival, never by
 * mutation, so these hooks reject any update or delete that reaches the model.
 */
function rejectMutation(next: (error?: Error) => void): void {
  next(new Error('Activity logs are append-only and cannot be modified or deleted.'));
}

activityLogSchema.pre('updateOne', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('updateMany', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('findOneAndUpdate', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('findOneAndDelete', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('findOneAndReplace', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('deleteOne', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('deleteMany', function (next) {
  rejectMutation(next);
});
activityLogSchema.pre('replaceOne', function (next) {
  rejectMutation(next);
});

activityLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error('Activity logs are append-only and cannot be modified.'));
    return;
  }
  next();
});

export const ActivityLogModel = (mongoose.models.ActivityLog as Model<ActivityLogDocument>) ??
  mongoose.model<ActivityLogDocument>('ActivityLog', activityLogSchema);
