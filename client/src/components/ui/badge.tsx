import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary-subtle text-primary',
        success: 'border-transparent bg-success-subtle text-success',
        warning: 'border-transparent bg-warning-subtle text-warning',
        danger: 'border-transparent bg-danger-subtle text-danger',
        info: 'border-transparent bg-info-subtle text-info',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

type Tone = NonNullable<BadgeProps['tone']>;

/**
 * One mapping from domain status to visual tone, so a status never reads as
 * "success" green in one table and neutral grey in another.
 */
const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  published: 'success',
  approved: 'success',
  completed: 'success',
  marked: 'success',
  selected: 'success',
  joined: 'success',
  cleared: 'success',
  present: 'success',

  pending: 'warning',
  pending_approval: 'warning',
  pending_verification: 'warning',
  pending_marking: 'warning',
  under_review: 'warning',
  submitted: 'warning',
  in_progress: 'warning',
  shortlisted: 'warning',
  on_leave: 'warning',
  late: 'warning',

  suspended: 'danger',
  rejected: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  absent: 'danger',
  dropped: 'danger',
  blacklisted: 'danger',
  withdrawn: 'danger',
  revoked: 'danger',

  draft: 'neutral',
  archived: 'neutral',
  inactive: 'neutral',
  closed: 'neutral',
  graduated: 'info',
  locked: 'info',
  scheduled: 'info',
  excused: 'info',
  on_duty: 'info',
};

export function statusTone(status: string | null | undefined): Tone {
  if (!status) return 'neutral';
  return STATUS_TONES[status.toLowerCase()] ?? 'neutral';
}

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const label = (status ?? 'unknown').replace(/_/g, ' ');
  return (
    <Badge tone={statusTone(status)} className={cn('capitalize', className)}>
      {label}
    </Badge>
  );
}
