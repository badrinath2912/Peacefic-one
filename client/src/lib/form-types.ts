/**
 * Form default values, with dates as strings.
 *
 * A Zod schema using `z.coerce.date()` outputs a `Date`, but the value a form
 * actually holds is what `<input type="date">` produces — a `yyyy-MM-dd`
 * string — and the API returns ISO strings. This maps those fields so seeding
 * a form from an API response needs no cast.
 */
export type FormDefaults<T> = {
  [K in keyof T]?: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K] extends Date | null | undefined
        ? string | null | undefined
        : T[K];
};

/** Trims an ISO timestamp to what a date input accepts. */
export function toDateInput(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}
