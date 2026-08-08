import { z } from 'zod';

import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_PRIORITY,
} from '../constants/enums';
import { ROLE_KEY_VALUES } from '../constants/roles';

import {
  attachmentSchema,
  booleanQuery,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const notificationListQuerySchema = paginationQuerySchema.extend({
  category: z.enum(NOTIFICATION_CATEGORY).optional(),
  unread: booleanQuery.optional(),
  priority: z.enum(NOTIFICATION_PRIORITY).optional(),
});

export const audienceSchema = z
  .object({
    type: z.enum(['all', 'role', 'department', 'batch', 'custom']),
    roleKeys: z.array(z.enum(ROLE_KEY_VALUES as [string, ...string[]])).max(10).default([]),
    departmentIds: z.array(objectIdSchema).max(50).default([]),
    batchIds: z.array(objectIdSchema).max(100).default([]),
    userIds: z.array(objectIdSchema).max(1000).default([]),
  })
  .refine(
    (a) => {
      if (a.type === 'role') return a.roleKeys.length > 0;
      if (a.type === 'department') return a.departmentIds.length > 0;
      if (a.type === 'batch') return a.batchIds.length > 0;
      if (a.type === 'custom') return a.userIds.length > 0;
      return true;
    },
    { message: 'Select at least one recipient group', path: ['type'] },
  );
export type AudienceInput = z.infer<typeof audienceSchema>;

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(200),
  content: z.string().trim().min(10, 'Content is required').max(50000),
  audience: audienceSchema,
  attachments: z.array(attachmentSchema).max(10).default([]),
  priority: z.enum(NOTIFICATION_PRIORITY).default('normal'),
  isPinned: z.boolean().default(false),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  sendEmail: z.boolean().default(false),
  status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const announcementListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  priority: z.enum(NOTIFICATION_PRIORITY).optional(),
  isPinned: booleanQuery.optional(),
});

export const previewAudienceSchema = z.object({
  audience: audienceSchema,
});
