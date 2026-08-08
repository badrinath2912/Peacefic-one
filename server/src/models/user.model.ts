import { THEME, USER_STATUS, type UserStatus } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface OAuthProvider {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  linkedAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  locale: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface UserDocument extends BaseFields {
  _id: Types.ObjectId;
  email: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  collegeId: Types.ObjectId | null;
  roleId: Types.ObjectId;
  extraPermissions: string[];
  status: UserStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  passwordChangedAt: Date | null;
  previousPasswordHashes: string[];
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  permissionsVersion: number;
  inviteTokenId: string | null;
  oauthProviders: OAuthProvider[];
  preferences: UserPreferences;
  fullName: string;
}

export type UserModelType = Model<UserDocument>;

const oauthProviderSchema = new Schema<OAuthProvider>(
  {
    provider: { type: String, enum: ['google', 'microsoft'], required: true },
    providerId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  // Never returned unless the auth service explicitly selects it.
  passwordHash: { type: String, select: false },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, default: null, trim: true, maxlength: 20 },
  avatarUrl: { type: String, default: null },
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', default: null, index: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  extraPermissions: { type: [String], default: [] },
  status: {
    type: String,
    enum: USER_STATUS,
    default: 'pending_verification',
    required: true,
  },
  emailVerifiedAt: { type: Date, default: null },
  phoneVerifiedAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  lastLoginIp: { type: String, default: null },
  passwordChangedAt: { type: Date, default: null },
  previousPasswordHashes: { type: [String], default: [], select: false },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lockedUntil: { type: Date, default: null },
  mustChangePassword: { type: Boolean, default: false },
  permissionsVersion: { type: Number, default: 1 },
  inviteTokenId: { type: String, default: null, select: false },
  oauthProviders: { type: [oauthProviderSchema], default: [] },
  preferences: {
    theme: { type: String, enum: THEME, default: 'system' },
    locale: { type: String, default: 'en-IN' },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
  },
});

applyBasePlugin(userSchema);
applyToJsonTransform(userSchema, ['passwordHash', 'previousPasswordHashes', 'inviteTokenId']);

userSchema.virtual('fullName').get(function (this: UserDocument) {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Partial so a soft-deleted account does not permanently block its email.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
userSchema.index({ collegeId: 1, roleId: 1 });
userSchema.index({ collegeId: 1, status: 1 });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index(
  { 'oauthProviders.provider': 1, 'oauthProviders.providerId': 1 },
  { sparse: true },
);

userSchema.pre('validate', function (next) {
  if (!this.passwordHash && this.oauthProviders.length === 0 && this.status === 'active') {
    next(new Error('An active account must have a password or a linked OAuth provider'));
    return;
  }
  next();
});

export const UserModel = (mongoose.models.User as UserModelType) ??
  mongoose.model<UserDocument>('User', userSchema);
