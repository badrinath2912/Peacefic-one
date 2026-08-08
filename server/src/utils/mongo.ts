import mongoose from 'mongoose';

/**
 * Our document interfaces are plain TypeScript shapes rather than
 * `extends Document`, which keeps the model layer readable but means
 * `toObject()` is not on the static type. This converts a hydrated document
 * (or an already-plain object) into a record suitable for diffing and logging.
 */
export function toPlain(document: unknown): Record<string, unknown> {
  if (document === null || typeof document !== 'object') return {};

  const candidate = document as { toObject?: (options?: unknown) => Record<string, unknown> };
  if (typeof candidate.toObject === 'function') {
    return candidate.toObject({ depopulate: true });
  }

  return document as Record<string, unknown>;
}

export function toObjectId(
  value: string | mongoose.Types.ObjectId | null | undefined,
): mongoose.Types.ObjectId | null {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

export function toObjectIds(values: Array<string | mongoose.Types.ObjectId>): mongoose.Types.ObjectId[] {
  return values
    .map((value) => toObjectId(value))
    .filter((value): value is mongoose.Types.ObjectId => value !== null);
}

/**
 * Reads a field from a relation that may or may not be populated. An
 * unpopulated path is an ObjectId, so the field simply is not there — this
 * returns null rather than throwing or requiring a cast at each call site.
 */
export function populatedField(relation: unknown, field: string): string | null {
  if (!relation || typeof relation !== 'object') return null;
  if (relation instanceof mongoose.Types.ObjectId) return null;

  const value = (relation as Record<string, unknown>)[field];
  return value === null || value === undefined ? null : String(value);
}

/** Convenience for the common "first last" case on a populated user. */
export function populatedName(relation: unknown): string | null {
  const first = populatedField(relation, 'firstName');
  const last = populatedField(relation, 'lastName');
  if (!first && !last) return null;
  return `${first ?? ''} ${last ?? ''}`.trim();
}

export function idsEqual(
  a: string | mongoose.Types.ObjectId | null | undefined,
  b: string | mongoose.Types.ObjectId | null | undefined,
): boolean {
  if (!a || !b) return false;
  return String(a) === String(b);
}
