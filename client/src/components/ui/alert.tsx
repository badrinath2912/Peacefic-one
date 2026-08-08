import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex gap-3 rounded-md border px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:mt-0.5',
  {
    variants: {
      tone: {
        info: 'border-info/25 bg-info-subtle text-info',
        success: 'border-success/25 bg-success-subtle text-success',
        warning: 'border-warning/25 bg-warning-subtle text-warning',
        danger: 'border-danger/25 bg-danger-subtle text-danger',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
} as const;

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  children: ReactNode;
}

export function Alert({ className, tone = 'info', title, children, ...props }: AlertProps) {
  const Icon = ICONS[tone ?? 'info'];

  return (
    <div
      // Errors and warnings interrupt; informational messages do not.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon aria-hidden />
      <div className="space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && 'text-foreground/80')}>{children}</div>
      </div>
    </div>
  );
}
