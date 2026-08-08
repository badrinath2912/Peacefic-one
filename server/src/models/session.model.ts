import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export type SessionRevokeReason =
  | 'logout'
  | 'rotated'
  | 'reuse_detected'
  | 'password_change'
  | 'admin_revoke'
  | 'device_limit';

export interface SessionDocument extends BaseFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  family: string;
  userAgent: string;
  ip: string;
  deviceLabel: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevokeReason | null;
  lastUsedAt: Date;
}

const sessionSchema = new Schema<SessionDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // SHA-256 of the token. A fast hash is correct here: the input already
  // carries 256 bits of entropy, so the slow-hash argument for passwords
  // does not apply.
  refreshTokenHash: { type: String, required: true },
  family: { type: String, required: true, index: true },
  userAgent: { type: String, default: '', maxlength: 500 },
  ip: { type: String, default: '', maxlength: 60 },
  deviceLabel: { type: String, default: 'Unknown device', maxlength: 120 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedReason: {
    type: String,
    enum: ['logout', 'rotated', 'reuse_detected', 'password_change', 'admin_revoke', 'device_limit'],
    default: null,
  },
  lastUsedAt: { type: Date, default: Date.now },
});

applyBasePlugin(sessionSchema);
applyToJsonTransform(sessionSchema, ['refreshTokenHash', 'family']);

sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = (mongoose.models.Session as Model<SessionDocument>) ??
  mongoose.model<SessionDocument>('Session', sessionSchema);
