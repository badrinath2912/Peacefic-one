import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />;
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}
