'use client';

import { Download, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onExport?: (format: 'csv' | 'xlsx') => void;
  onDelete?: () => void;
  isExporting?: boolean;
  /** Module-specific actions, rendered before the shared ones. */
  children?: ReactNode;
}

/**
 * The bulk toolbar shared by every list. It appears only when something is
 * selected and always states the count, so the blast radius is visible before
 * the user commits.
 */
export function SelectionBar({
  count,
  onClear,
  onExport,
  onDelete,
  isExporting,
  children,
}: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${count} selected`}
      className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-subtle px-3 py-2"
    >
      <span className="text-sm font-medium text-primary">{count} selected</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}

        {onExport ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport('csv')}
              isLoading={isExporting}
            >
              <Download aria-hidden />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('xlsx')}>
              <Download aria-hidden />
              Excel
            </Button>
          </>
        ) : null}

        {onDelete ? (
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : null}

        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
