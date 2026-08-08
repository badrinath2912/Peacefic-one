import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind classes so a later class actually wins a conflict. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Coarse relative time. Precision beyond this is noise in a activity feed. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return formatDate(date);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

export function initials(first?: string | null, last?: string | null): string {
  const a = first?.trim().charAt(0) ?? '';
  const b = last?.trim().charAt(0) ?? '';
  return (a + b).toUpperCase() || '?';
}

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Builds a query string, dropping empty values so URLs stay readable. */
export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
      continue;
    }
    if (value instanceof Date) {
      search.set(key, value.toISOString());
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
