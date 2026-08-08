'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

/**
 * Wires label, hint and error to the control via ids so screen readers announce
 * them. Doing this by hand at every call site is where accessibility quietly
 * rots, so the control is a render prop and receives the ids it needs.
 */
export function Field({
  label,
  children,
  error,
  hint,
  required,
  className,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <LabelPrimitive.Root
        htmlFor={id}
        className="text-sm font-medium leading-none text-foreground peer-disabled:opacity-70"
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </LabelPrimitive.Root>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` so the message is announced when it appears.
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
