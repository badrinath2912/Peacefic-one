import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_PRIORITY,
  type NotificationCategory,
  type NotificationPriority,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface NotificationDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId | null;
  userId: Types.ObjectId;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  entity: { type: string; id: Types.ObjectId } | null;
  channels: { inApp: boolean; email: boolean; push: boolean };
  deliveryStatus: {
    inApp: 'pending' | 'delivered' | 'failed';
    email: 'pending' | 'sent' | 'delivered' | 'failed' | 'skipped';
    push: 'pending' | 'sent' | 'failed' | 'skipped';
  };
  readAt: Date | null;
  archivedAt: Date | null;
  expiresAt: Date | null;
  createdByUserId: Types.ObjectId | null;
}

/** See the note in `activity-log.model.ts`: a field named `type` needs its own schema. */
const entityRefSchema = new Schema(
  {
    type: { type: String, maxlength: 60 },
    id: { type: Schema.Types.ObjectId },
  },
  { _id: false },
);

const notificationSchema = new Schema<NotificationDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', default: null, index: true },
  // One document per recipient: a fan-out write. The commonest query is
  // "my unread notifications, newest first", which this keeps index-only.
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, maxlength: 80 },
  category: { type: String, enum: NOTIFICATION_CATEGORY, required: true },
  priority: { type: String, enum: NOTIFICATION_PRIORITY, default: 'normal' },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 2000 },
  actionUrl: { type: String, default: null, maxlength: 500 },
  actionLabel: { type: String, default: null, maxlength: 60 },
  entity: { type: entityRefSchema, default: null },
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false },
  },
  deliveryStatus: {
    inApp: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    email: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'skipped'],
      default: 'skipped',
    },
    push: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'skipped' },
  },
  readAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

applyBasePlugin(notificationSchema);
applyToJsonTransform(notificationSchema);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ collegeId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationModel = (mongoose.models.Notification as Model<NotificationDocument>) ??
  mongoose.model<NotificationDocument>('Notification', notificationSchema);
