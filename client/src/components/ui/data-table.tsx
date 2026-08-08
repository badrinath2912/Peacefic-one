'use client';

import type { PaginationMeta } from '@peacefic/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { EmptyState, ErrorState } from './empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from './table';

export interface Column<T> {
  key: string;
  header: string;
  /** Set when the API accepts this field in `sort`. */
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  pagination?: PaginationMeta;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: ApiError | null;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onPageChange?: (page: number) => void;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Enables the selection column. */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Keys to hide, from the column-visibility control. */
  hiddenColumns?: string[];
  /** Keeps the header visible while a long page scrolls. */
  stickyHeader?: boolean;
}

/**
 * Pagination and sorting are server-driven. Client-side sorting of one page is
 * a lie: it reorders 25 rows out of 4,000 and the user believes they are
 * looking at the top of the list.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pagination,
  isLoading,
  isFetching,
  error,
  sort,
  onSortChange,
  onPageChange,
  onRetry,
  onRowClick,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  selectedIds,
  onSelectionChange,
  hiddenColumns = [],
  stickyHeader = false,
}: DataTableProps<T>) {
  const descending = sort?.startsWith('-');
  const sortField = descending ? sort?.slice(1) : sort;

  const selectable = Boolean(onSelectionChange);
  const selection = new Set(selectedIds ?? []);
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(column.key));

  const pageIds = (rows ?? []).map(rowKey);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selection.has(id));
  const someOnPageSelected = pageIds.some((id) => selection.has(id)) && !allOnPageSelected;

  function toggleSort(key: string): void {
    if (!onSortChange) return;
    onSortChange(sortField === key && !descending ? `-${key}` : key);
  }

  function toggleRow(id: string): void {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.([...next]);
  }

  /** Selects the current page only — never rows the user cannot see. */
  function togglePage(): void {
    const next = new Set(selection);
    if (allOnPageSelected) {
      for (const id of pageIds) next.delete(id);
    } else {
      for (const id of pageIds) next.add(id);
    }
    onSelectionChange?.([...next]);
  }

  if (error) {
    return (
      <ErrorState message={error.message} requestId={error.requestId} onRetry={onRetry} />
    );
  }

  if (!isLoading && rows && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="space-y-3">
      <TableWrapper
        // Dimmed while refetching so the user sees the table is updating
        // without the rows disappearing and the page height jumping.
        className={cn('rounded-md border border-border', isFetching && !isLoading && 'opacity-60')}
      >
        <Table>
          <TableHeader className={cn(stickyHeader && 'sticky top-14 z-10')}>
            <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
              {selectable ? (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    checked={allOnPageSelected}
                    ref={(element) => {
                      // Indeterminate is a DOM property, not an attribute.
                      if (element) element.indeterminate = someOnPageSelected;
                    }}
                    onChange={togglePage}
                    aria-label={allOnPageSelected ? 'Clear selection on this page' : 'Select all on this page'}
                  />
                </TableHead>
              ) : null}

              {visibleColumns.map((column) => {
                const active = sortField === column.key;
                const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;

                return (
                  <TableHead
                    key={column.key}
                    className={cn(
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.className,
                    )}
                    aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active && 'text-foreground',
                        )}
                      >
                        {column.header}
                        <Icon className="size-3" aria-hidden />
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {selectable ? (
                      <TableCell>
                        <div className="skeleton size-4" />
                      </TableCell>
                    ) : null}
                    {visibleColumns.map((column) => (
                      <TableCell key={column.key}>
                        <div className="skeleton h-4 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows?.map((row) => {
                  const id = rowKey(row);
                  const isSelected = selection.has(id);

                  return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {selectable ? (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select row ${id}`}
                        />
                      </TableCell>
                    ) : null}

                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </TableWrapper>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            <span className="tabular font-medium text-foreground">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.totalItems)}
            </span>{' '}
            of <span className="tabular font-medium text-foreground">{pagination.totalItems}</span>
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPreviousPage}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>

            <span className="tabular px-2 text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
