'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', invalid, leadingIcon, trailingSlot, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leadingIcon ? (
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4"
          aria-hidden
        >
          {leadingIcon}
        </span>
      ) : null}

      <input
        ref={ref}
        type={type}
        // Communicated to assistive tech, not only through colour.
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-xs transition-colors',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          leadingIcon && 'pl-9',
          trailingSlot && 'pr-10',
          invalid && 'border-danger focus-visible:ring-danger',
          className,
        )}
        {...props}
      />

      {trailingSlot ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailingSlot}</span>
      ) : null}
    </div>
  );
});
