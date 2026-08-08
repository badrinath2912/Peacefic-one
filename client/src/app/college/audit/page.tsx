'use client';

import { AUDIT_CATEGORY, AUDIT_SEVERITY } from '@peacefic/shared';
import { Download, Search, ShieldAlert, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useAuditLogs, useExportAuditLogs, type AuditEntry } from '@/api/audit-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { AuditDetailDialog } from '@/components/audit/audit-detail-dialog';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_SEVERITY_LABELS,
  AUDIT_SEVERITY_TONES,
  actionLabel,
} from '@/lib/audit-display';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const CATEGORY_OPTIONS = AUDIT_CATEGORY.map((value) => ({
  value,
  label: AUDIT_CATEGORY_LABELS[value],
}));

const SEVERITY_OPTIONS = AUDIT_SEVERITY.map((value) => ({
  value,
  label: AUDIT_SEVERITY_LABELS[value],
}));

const OUTCOME_OPTIONS = [
  { value: 'success', label: 'Succeeded' },
  { value: 'failure', label: 'Failed' },
];

/**
 * The audit log.
 *
 * Read-only, because the record is append-only: the model rejects updates and
 * deletes, and the API exposes no verb to attempt one.
 *
 * The filters here are exactly those the request can carry end to end. There is
 * no entity filter, because `express-mongo-sanitize` rewrites the dot in
 * `entity.type` before any route sees it; the date range uses `from`/`to`
 * rather than the repository's operator syntax, which Express reshapes into
 * something the query parser never matches.
 */
export default function AuditPage() {
  const { user } = useAuth();

  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: '-createdAt' });

  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const mayRead = can(user?.permissions, 'audit:read');
  const mayExport = can(user?.permissions, 'audit:export');

  const entries = useAuditLogs(params, mayRead);
  const exportEntries = useExportAuditLogs();

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<AuditEntry>[] = [
    {
      key: 'createdAt',
      header: 'When',
      sortable: true,
      render: (entry) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(entry.createdAt)}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Who',
      render: (entry) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{entry.userEmail ?? 'System'}</p>
          <p className="truncate text-xs text-muted-foreground">{entry.userRole ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (entry) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{actionLabel(entry.action)}</p>
          <p className="truncate font-mono text-2xs text-muted-foreground">{entry.action}</p>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Subject',
      render: (entry) =>
        entry.entity ? (
          <div className="min-w-0">
            <p className="truncate text-sm">{entry.entity.type}</p>
            {entry.entity.label ? (
              <p className="truncate text-xs text-muted-foreground">{entry.entity.label}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (entry) => (
        <Badge tone="neutral">{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (entry) => (
        <Badge tone={AUDIT_SEVERITY_TONES[entry.severity]}>
          {AUDIT_SEVERITY_LABELS[entry.severity]}
        </Badge>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (entry) =>
        entry.outcome === 'success' ? (
          <Badge tone="success">Succeeded</Badge>
        ) : (
          <Badge tone="danger">Failed</Badge>
        ),
    },
  ];

  function clearAll(): void {
    setFrom('');
    setTo('');
    resetFilters();
  }

  /**
   * A date input reports every keystroke, so a half-typed value arrives here as
   * something `new Date()` cannot parse — and `toISOString()` throws on an
   * invalid date. The filter is only sent once the value is a real date.
   */
  function setDateFilter(key: 'from' | 'to', value: string): void {
    if (!value) {
      setFilter(key, '');
      return;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;

    setFilter(key, parsed.toISOString());
  }

  return (
    <RouteGuard permissions={['audit:read']}>
      <Breadcrumbs items={[{ label: 'Audit log' }]} />

      <PageHeader
        title="Audit log"
        description="Every recorded action in your college, oldest entries retained unchanged."
        actions={
          mayExport ? (
            <Button
              variant="outline"
              onClick={() => exportEntries.mutate({ format: 'xlsx', filters: params })}
              isLoading={exportEntries.isPending}
              loadingText="Exporting"
            >
              <Download aria-hidden />
              Export
            </Button>
          ) : null
        }
      />

      <Alert tone="info" title="This record cannot be edited" className="mb-4">
        Audit entries are append-only: they cannot be changed or removed, by anyone, including from
        here. Sensitive values such as passwords and tokens are replaced before an entry is stored.
      </Alert>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="search"
            placeholder="Search action or user email"
            leadingIcon={<Search />}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            aria-label="Search audit entries"
          />

          <Select
            placeholder="All categories"
            value={(params.category as string) ?? ''}
            onChange={(event) => setFilter('category', event.target.value)}
            aria-label="Filter by category"
            options={CATEGORY_OPTIONS}
          />

          <Select
            placeholder="All severities"
            value={(params.severity as string) ?? ''}
            onChange={(event) => setFilter('severity', event.target.value)}
            aria-label="Filter by severity"
            options={SEVERITY_OPTIONS}
          />

          <Select
            placeholder="All outcomes"
            value={(params.outcome as string) ?? ''}
            onChange={(event) => setFilter('outcome', event.target.value)}
            aria-label="Filter by outcome"
            options={OUTCOME_OPTIONS}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              aria-label="From date"
              onChange={(event) => {
                setFrom(event.target.value);
                setDateFilter('from', event.target.value);
              }}
              className="h-9 rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              value={to}
              aria-label="To date"
              onChange={(event) => {
                setTo(event.target.value);
                setDateFilter('to', event.target.value);
              }}
              className="h-9 rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {activeFilterCount > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">
                {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
              </span>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X aria-hidden />
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={entries.data?.items}
        rowKey={(entry) => entry.id}
        pagination={entries.data?.pagination}
        isLoading={entries.isLoading}
        isFetching={entries.isFetching}
        error={entries.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void entries.refetch()}
        onRowClick={(entry) => setSelected(entry)}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No entries match those filters' : 'Nothing recorded yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Actions across the college are recorded here as they happen.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Only entries for your own college are shown. Filtering narrows within that — it cannot
          reach another college&apos;s records.
        </span>
      </p>

      <AuditDetailDialog entry={selected} onClose={() => setSelected(null)} />
    </RouteGuard>
  );
}
