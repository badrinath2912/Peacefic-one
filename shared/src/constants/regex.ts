export const REGEX = {
  objectId: /^[0-9a-fA-F]{24}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phoneE164: /^\+?[1-9]\d{7,14}$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  code: /^[A-Z0-9][A-Z0-9-_]{1,19}$/,
  time24: /^([01]\d|2[0-3]):([0-5]\d)$/,
  pincode: /^\d{4,10}$/,
  hexColor: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
  academicYear: /^\d{4}-\d{4}$/,
  otp: /^\d{6}$/,
} as const;

/** Escapes regex metacharacters so user input can never build a pattern. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
