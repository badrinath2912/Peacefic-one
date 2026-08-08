import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface PermissionDocument extends BaseFields {
  _id: Types.ObjectId;
  key: string;
  resource: string;
  action: string;
  description: string;
  module: string;
  isDangerous: boolean;
}

const permissionSchema = new Schema<PermissionDocument>({
  key: { type: String, required: true, trim: true, maxlength: 80 },
  resource: { type: String, required: true, trim: true, maxlength: 40 },
  action: { type: String, required: true, trim: true, maxlength: 40 },
  description: { type: String, default: '', maxlength: 300 },
  module: { type: String, required: true, trim: true, maxlength: 60 },
  isDangerous: { type: Boolean, default: false },
});

applyBasePlugin(permissionSchema);
applyToJsonTransform(permissionSchema);

permissionSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
permissionSchema.index({ module: 1, resource: 1 });

export const PermissionModel = (mongoose.models.Permission as Model<PermissionDocument>) ??
  mongoose.model<PermissionDocument>('Permission', permissionSchema);
