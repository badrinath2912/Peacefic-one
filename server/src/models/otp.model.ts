import { OTP_PURPOSE, type OtpPurpose } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface OtpDocument extends BaseFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId | null;
  identifier: string;
  codeHash: string;
  purpose: OtpPurpose;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
}

const otpSchema = new Schema<OtpDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  identifier: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  // Hashed for the same reason passwords are: a database read must not hand
  // over a working second factor.
  codeHash: { type: String, required: true, select: false },
  purpose: { type: String, enum: OTP_PURPOSE, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  consumedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

applyBasePlugin(otpSchema);
applyToJsonTransform(otpSchema, ['codeHash']);

otpSchema.index({ identifier: 1, purpose: 1, consumedAt: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = (mongoose.models.Otp as Model<OtpDocument>) ??
  mongoose.model<OtpDocument>('Otp', otpSchema);
