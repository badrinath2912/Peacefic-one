import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * The wrapper scrolls horizontally rather than letting a wide table push the
 * page sideways — a horizontally scrolling body is the classic responsive bug.
 */
export const TableWrapper = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function TableWrapper({ className, ...props }, ref) {
    return <div ref={ref} className={cn('w-full overflow-x-auto', className)} {...props} />;
  },
);

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />;
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />;
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
  },
);

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-primary-subtle',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn(
          'h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
  },
);
