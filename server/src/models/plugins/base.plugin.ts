import type { Schema, Query, Document } from 'mongoose';
import mongoose from 'mongoose';

import { requestContext } from '@/config/request-context';

export interface BaseFields {
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId | null;
  updatedBy: mongoose.Types.ObjectId | null;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  version: number;
}

export const baseSchemaFields = {
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
} as const;

function currentUserObjectId(): mongoose.Types.ObjectId | null {
  const userId = requestContext.tryGet()?.userId;
  if (!userId || !mongoose.isValidObjectId(userId)) return null;
  return new mongoose.Types.ObjectId(userId);
}

/**
 * Applies audit fields, timestamps, soft-delete state and optimistic
 * concurrency to every schema. Nothing redefines these individually.
 */
export function applyBasePlugin(schema: Schema): void {
  schema.add(baseSchemaFields);

  schema.set('timestamps', true);
  schema.set('optimisticConcurrency', true);
  schema.set('versionKey', 'version');

  schema.pre('save', function (next) {
    const actor = currentUserObjectId();
    if (actor) {
      if (this.isNew && !this.get('createdBy')) this.set('createdBy', actor);
      if (!this.isNew) this.set('updatedBy', actor);
    }
    next();
  });

  // Mongoose's typings accept one hook name (or a RegExp) per call, so these
  // are registered individually rather than as an array.
  const stampUpdatedBy = function (
    this: Query<unknown, Document>,
    next: (error?: Error) => void,
  ): void {
    const actor = currentUserObjectId();
    if (actor) {
      this.set({ updatedBy: actor });
    }
    next();
  };

  schema.pre('updateOne', stampUpdatedBy);
  schema.pre('updateMany', stampUpdatedBy);
  schema.pre('findOneAndUpdate', stampUpdatedBy);

  schema.methods.softDelete = function softDelete(): Promise<Document> {
    this.set('deletedAt', new Date());
    this.set('deletedBy', currentUserObjectId());
    return this.save();
  };

  schema.methods.restore = function restore(): Promise<Document> {
    this.set('deletedAt', null);
    this.set('deletedBy', null);
    return this.save();
  };

  schema.virtual('isDeleted').get(function (this: Document & { deletedAt: Date | null }) {
    return this.deletedAt !== null;
  });
}

/**
 * Removes a possibly nested path, e.g. `aadhaar.hash`. Needed because
 * `select: false` does not apply to a document that was just created — the
 * in-memory instance still carries the field, so it would be serialised into
 * the create response.
 */
function deletePath(target: Record<string, unknown>, path: string): void {
  const segments = path.split('.');
  const last = segments.pop();
  if (!last) return;

  let cursor: Record<string, unknown> | undefined = target;
  for (const segment of segments) {
    const next = cursor?.[segment];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown>;
  }

  delete cursor?.[last];
}

/** Serializer defaults: `_id` becomes `id`, internals are dropped. */
export function applyToJsonTransform(schema: Schema, hiddenFields: string[] = []): void {
  const transform = (
    _doc: unknown,
    ret: Record<string, unknown>,
  ): Record<string, unknown> => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.deletedAt;
    delete ret.deletedBy;
    for (const field of hiddenFields) deletePath(ret, field);
    return ret;
  };

  schema.set('toJSON', { virtuals: true, transform });
  schema.set('toObject', { virtuals: true, transform });
}
