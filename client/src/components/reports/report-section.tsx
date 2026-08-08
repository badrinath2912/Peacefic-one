'use client';

import type { LucideIcon } from 'lucide-react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import type { ApiError } from '@/lib/api-client';

export interface ReportFigure {
  label: string;
  value: string | number;
}

export interface ReportExport {
  label: string;
  isPending?: boolean;
  onExport: (format: 'csv' | 'xlsx') => void;
}

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Hidden entirely when the caller cannot read the module behind it. */
  visible: boolean;
  figures: ReportFigure[];
  isLoading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  exports: ReportExport[];
}

/**
 * One module's contribution to the report page.
 *
 * `visible` is a permission decision made by the caller, not a styling one — a
 * hidden section means the request behind it was never fired. Figures arrive
 * already computed; nothing is derived here.
 */
export function ReportSection({
  title,
  description,
  icon: Icon,
  visible,
  figures,
  isLoading,
  error,
  onRetry,
  exports,
}: Props) {
  if (!visible) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>

          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {exports.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {exports.map((entry) => (
              <Button
                key={entry.label}
                variant="outline"
                size="sm"
                isLoading={entry.isPending}
                loadingText="Exporting"
                onClick={() => entry.onExport('xlsx')}
              >
                <Download aria-hidden />
                {entry.label}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {error ? (
          <ErrorState
            title="Could not load these figures"
            message={error.message}
            requestId={error.requestId}
            onRetry={onRetry}
          />
        ) : isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key}>
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton mt-2 h-6 w-14 rounded" />
              </div>
            ))}
          </div>
        ) : figures.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {exports.length > 0
              ? 'No summary is published for this area — use the export for the full records.'
              : 'Nothing has been recorded here yet.'}
          </p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label} className="min-w-0">
                <dt className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                  {figure.label}
                </dt>
                <dd className="mt-0.5 text-xl font-semibold tabular">{figure.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
