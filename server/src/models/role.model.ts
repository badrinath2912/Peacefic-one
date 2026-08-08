import { ROLE_KEY_VALUES, ROLE_SCOPES, type RoleScope } from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface RoleDocument extends BaseFields {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  scope: RoleScope;
  isSystem: boolean;
  collegeId: Types.ObjectId | null;
}

const roleSchema = new Schema<RoleDocument>({
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  permissions: { type: [String], default: [] },
  scope: {
    type: String,
    enum: Object.values(ROLE_SCOPES),
    default: ROLE_SCOPES.COLLEGE,
    required: true,
  },
  isSystem: { type: Boolean, default: false },
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', default: null, index: true },
});

applyBasePlugin(roleSchema);
applyToJsonTransform(roleSchema);

roleSchema.index(
  { key: 1, collegeId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
roleSchema.index({ collegeId: 1, isSystem: 1 });

roleSchema.pre('validate', function (next) {
  if (this.isSystem && !ROLE_KEY_VALUES.includes(this.key as never)) {
    next(new Error(`"${this.key}" is not a recognised system role key`));
    return;
  }
  next();
});

export const RoleModel = (mongoose.models.Role as Model<RoleDocument>) ??
  mongoose.model<RoleDocument>('Role', roleSchema);
