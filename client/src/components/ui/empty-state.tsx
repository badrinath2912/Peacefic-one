import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * An error state is not an empty state: it says what failed, offers a retry,
 * and shows the request id so a support ticket can be traced.
 */
export function ErrorState({
  title = 'Could not load this',
  message,
  requestId,
  onRetry,
}: {
  title?: string;
  message?: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-danger-subtle text-danger">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {message ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
        ) : null}
        {requestId ? (
          <p className="font-mono text-2xs text-muted-foreground">Reference: {requestId}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
