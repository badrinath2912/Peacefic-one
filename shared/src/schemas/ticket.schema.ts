import { z } from 'zod';

import { PRIORITY, TICKET_CATEGORY, TICKET_STATUS } from '../constants/enums';

import {
  attachmentSchema,
  objectIdSchema,
  paginationQuerySchema,
} from './common.schema';

export const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORY),
  subject: z.string().trim().min(5, 'Subject is required').max(200),
  description: z.string().trim().min(20, 'Describe the issue in at least 20 characters').max(10000),
  priority: z.enum(PRIORITY).default('medium'),
  attachments: z.array(attachmentSchema).max(5).default([]),
  entity: z
    .object({ type: z.string().trim().max(40), id: objectIdSchema })
    .nullable()
    .optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORY).optional(),
  priority: z.enum(PRIORITY).optional(),
  status: z.enum(TICKET_STATUS).optional(),
});

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(10000),
  attachments: z.array(attachmentSchema).max(5).default([]),
  isInternal: z.boolean().default(false),
});
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

export const assignTicketSchema = z.object({
  assignedTo: objectIdSchema.nullable(),
});

export const resolveTicketSchema = z.object({
  summary: z.string().trim().min(10, 'Summarise the resolution').max(5000),
});

export const rateTicketSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const reopenTicketSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

export const ticketListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TICKET_STATUS).optional(),
  category: z.enum(TICKET_CATEGORY).optional(),
  priority: z.enum(PRIORITY).optional(),
  assignedTo: objectIdSchema.optional(),
  raisedBy: objectIdSchema.optional(),
});
