'use client';

import { ClipboardList, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useDepartments } from '@/api/queries';
import { useTrainingRequests, type TrainingRequest } from '@/api/training-queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedSearch, useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function requesterName(value: TrainingRequest['requestedBy']): string {
  if (value && typeof value === 'object') {
    return `${value.firstName} ${value.lastName}`.trim();
  }
  return '—';
}

function departmentCodes(value: TrainingRequest['departmentIds']): string {
  const codes = value
    .map((entry) => (typeof entry === 'object' && entry ? entry.code : null))
    .filter(Boolean);

  return codes.length > 0 ? codes.join(', ') : 'College-wide';
}

export default function TrainingRequestsPage() {
  const { user } = useAuth();
  const { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount } =
    useListParams({ sort: '-createdAt' });

  const requests = useTrainingRequests({ ...params, include: 'departmentIds,requestedBy' });
  const departments = useDepartments({ limit: 100, status: 'active' });

  const search = useDebouncedSearch(useCallback((value) => setSearch(value), [setSearch]));

  const columns: Column<TrainingRequest>[] = [
    {
      key: 'reference',
      header: 'Reference',
      sortable: true,
      render: (item) => (
        <Link
          href={`/college/training/requests/${item.id}`}
          className="font-mono text-xs font-medium text-primary hover:underline"
        >
          {item.reference}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Request',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {toTitleCase(item.trainingType)} · {departmentCodes(item.departmentIds)}
          </p>
        </div>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Raised by',
      render: (item) => <span className="text-muted-foreground">{requesterName(item.requestedBy)}</span>,
    },
    {
      key: 'expectedParticipants',
      header: 'Participants',
      align: 'right',
      render: (item) => <span className="tabular">{item.expectedParticipants}</span>,
    },
    {
      key: 'preferredStartDate',
      header: 'Preferred start',
      sortable: true,
      render: (item) => formatDate(item.preferredStartDate),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (item) => <StatusBadge status={item.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => <StatusBadge status={item.status} />,
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: 'Training', href: '/college/training' }, { label: 'Requests' }]} />

      <PageHeader
        title="Training requests"
        description="What has been asked for, and where each request stands."
        actions={
          can(user?.permissions, 'training:create') ? (
            <Button asChild>
              <Link href="/college/training/requests/new">
                <Plus aria-hidden />
                New request
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              type="search"
              placeholder="Search reference or title"
              leadingIcon={<Search />}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              aria-label="Search training requests"
            />
          </div>

          <Select
            placeholder="All statuses"
            value={(params.status as string) ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
            aria-label="Filter by status"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'submitted', label: 'Awaiting review' },
              { value: 'approved', label: 'Approved' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'completed', label: 'Completed' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />

          <Select
            placeholder="All priorities"
            value={(params.priority as string) ?? ''}
            onChange={(event) => setFilter('priority', event.target.value)}
            aria-label="Filter by priority"
            options={[
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />

          <Select
            placeholder="All departments"
            value={(params.departmentIds as string) ?? ''}
            onChange={(event) => setFilter('departmentIds', event.target.value)}
            aria-label="Filter by department"
            options={(departments.data?.items ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />
        </div>

        {activeFilterCount > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
            </span>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X aria-hidden />
              Clear
            </Button>
          </div>
        ) : null}
      </Card>

      <DataTable
        columns={columns}
        rows={requests.data?.items}
        rowKey={(item) => item.id}
        pagination={requests.data?.pagination}
        isLoading={requests.isLoading}
        isFetching={requests.isFetching}
        error={requests.error}
        sort={params.sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRetry={() => void requests.refetch()}
        stickyHeader
        emptyTitle={activeFilterCount > 0 ? 'No requests match those filters' : 'No requests yet'}
        emptyDescription={
          activeFilterCount > 0
            ? 'Try clearing a filter.'
            : 'Raise a request to ask for a training programme.'
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : can(user?.permissions, 'training:create') ? (
            <Button size="sm" asChild>
              <Link href="/college/training/requests/new">New request</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
