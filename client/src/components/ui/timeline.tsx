import { cn, toTitleCase } from '@/lib/utils';

export interface TimelineEntry {
  id: string;
  title: string;
  actor?: string | null;
  at: string;
  detail?: string | null;
  tone?: 'default' | 'warning' | 'danger';
}

const DOT_TONES = {
  default: 'bg-primary',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative space-y-4 pl-6">
      {/* The rail sits behind the dots and is purely decorative. */}
      <span className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />

      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className={cn(
              'absolute -left-[19px] top-1.5 size-2.5 rounded-full ring-4 ring-background',
              DOT_TONES[entry.tone ?? 'default'],
            )}
            aria-hidden
          />

          <p className="text-sm font-medium capitalize">{toTitleCase(entry.title)}</p>

          <p className="text-xs text-muted-foreground">
            {entry.at}
            {entry.actor ? ` · ${entry.actor}` : ''}
          </p>

          {entry.detail ? (
            <p className="mt-1 break-words text-xs text-muted-foreground">{entry.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
