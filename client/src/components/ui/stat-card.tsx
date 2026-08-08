import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn, formatNumber } from '@/lib/utils';

import { Card } from './card';

interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  /** Percentage-point change against the previous period. */
  delta?: number | null;
  deltaLabel?: string;
  suffix?: string;
  isLoading?: boolean;
  /** Set when a higher number is worse — backlogs, defaulters. */
  invertDelta?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  suffix,
  isLoading,
  invertDelta = false,
}: StatCardProps) {
  const display = typeof value === 'number' ? formatNumber(value) : (value ?? '—');
  const improved = delta === undefined || delta === null ? null : invertDelta ? delta < 0 : delta > 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </div>

      {isLoading ? (
        <div className="skeleton mt-3 h-8 w-24" />
      ) : (
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight">
          {display}
          {suffix ? <span className="ml-0.5 text-base font-normal text-muted-foreground">{suffix}</span> : null}
        </p>
      )}

      {delta !== undefined && delta !== null && !isLoading ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs',
            improved ? 'text-success' : 'text-danger',
          )}
        >
          {delta > 0 ? (
            <TrendingUp className="size-3.5" aria-hidden />
          ) : (
            <TrendingDown className="size-3.5" aria-hidden />
          )}
          <span className="tabular">
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}
          </span>
          {deltaLabel ? <span className="text-muted-foreground">{deltaLabel}</span> : null}
        </p>
      ) : null}
    </Card>
  );
}
