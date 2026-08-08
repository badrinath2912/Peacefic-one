/** Date-only values are stored at UTC midnight and rendered in college time. */
export function toUtcDateOnly(input: Date | string): Date {
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function startOfUtcDay(input: Date = new Date()): Date {
  return toUtcDateOnly(input);
}

export function endOfUtcDay(input: Date = new Date()): Date {
  const start = toUtcDateOnly(input);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function semesterKey(semester: number): string {
  return `sem-${semester}`;
}

export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function academicYearFor(date: Date, startMonth: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= startMonth ? year : year - 1;
  return `${start}-${start + 1}`;
}

/** Parses a permissive date string from an import file. */
export function parseImportDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (iso) return new Date(`${trimmed}T00:00:00.000Z`);

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : toUtcDateOnly(parsed);
}
