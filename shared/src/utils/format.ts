/** Money is stored in minor units (paise). Never store a float. */
export function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/** Formats an Indian-style CTC: 1250000 paise -> "₹12.5 LPA". */
export function formatPackage(minorUnits: number, currency = 'INR'): string {
  const major = fromMinorUnits(minorUnits);
  if (currency === 'INR') {
    if (major >= 10_000_000) return `₹${(major / 10_000_000).toFixed(2)} Cr`;
    if (major >= 100_000) return `₹${(major / 100_000).toFixed(2)} LPA`;
    return `₹${major.toLocaleString('en-IN')}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

export function formatCurrency(minorUnits: number, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(fromMinorUnits(minorUnits));
}

/** Percentages are 0-100 with one decimal place throughout the product. */
export function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculatePercentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundPercent((part / total) * 100);
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}

/** Academic year label from a date and the college's start month. */
export function academicYearFor(date: Date, startMonth: number): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= startMonth ? year : year - 1;
  return `${start}-${start + 1}`;
}

/** UTC midnight for a calendar day: how all date-only values are stored. */
export function toUtcDateOnly(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
