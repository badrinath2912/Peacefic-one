'use client';

import { Award, ClipboardList, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useMyApplications, useMyOffers, type Placement } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import {
  APPLICATION_PIPELINE,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_STATUS_TONES,
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  formatCtc,
  relationField,
} from '@/lib/placement-display';
import { formatDate } from '@/lib/utils';

/**
 * The signed-in student's own applications.
 *
 * `GET /applications/me` carries no student parameter — the server reads
 * identity from the token, so there is nothing for the browser to substitute
 * and no student picker to build.
 */
export default function StudentApplicationsPage() {
  const applications = useMyApplications();
  const offers = useMyOffers();

  const [status, setStatus] = useState('');

  /** An offer belongs to an application, so it is matched by that id. */
  const offerByApplication = useMemo(() => {
    const entries = new Map<string, Placement>();

    for (const offer of offers.data ?? []) {
      const applicationId =
        typeof offer.applicationId === 'string' ? offer.applicationId : offer.applicationId.id;
      entries.set(applicationId, offer);
    }

    return entries;
  }, [offers.data]);

  const visible = useMemo(() => {
    const rows = applications.data ?? [];
    if (!status) return rows;
    return rows.filter((application) => application.status === status);
  }, [applications.data, status]);

  const live = (applications.data ?? []).filter((application) =>
    APPLICATION_PIPELINE.includes(application.status),
  ).length;

  const selected = (applications.data ?? []).filter(
    (application) => application.status === 'selected',
  ).length;

  return (
    <RouteGuard permissions={['application:read']}>
      <PageHeader
        title="My applications"
        description="Every drive you have applied to, and where each one stands."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Applications"
          value={applications.data?.length}
          icon={ClipboardList}
          isLoading={applications.isLoading}
        />
        <StatCard
          label="Still in the running"
          value={live}
          icon={TrendingUp}
          isLoading={applications.isLoading}
        />
        <StatCard
          label="Offers"
          value={offers.data?.length}
          icon={Award}
          isLoading={offers.isLoading}
        />
      </div>

      {selected > 0 ? (
        <Card className="mb-4 border-success/40 bg-success-subtle/30">
          <CardContent className="p-4">
            <p className="text-sm font-medium">
              You have been selected for {selected} role{selected === 1 ? '' : 's'}.
            </p>
            <p className="text-sm text-muted-foreground">
              Open the application to see the offer and answer it.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="sm:max-w-xs">
          <Select
            placeholder="All statuses"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
            options={APPLICATION_STATUS_OPTIONS}
          />
        </div>
      </Card>

      {applications.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Card key={key} className="p-5">
              <div className="skeleton h-5 w-1/2 rounded" />
              <div className="skeleton mt-3 h-4 w-1/3 rounded" />
            </Card>
          ))}
        </div>
      ) : applications.isError ? (
        <ErrorState
          title="Could not load your applications"
          message={applications.error.message}
          requestId={applications.error.requestId}
          onRetry={() => void applications.refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={status ? 'Nothing at that status' : 'You have not applied to anything yet'}
          description={
            status
              ? 'Try another status.'
              : 'Browse the open drives and apply to the ones you qualify for.'
          }
          action={
            status ? (
              <Button variant="outline" size="sm" onClick={() => setStatus('')}>
                Clear filter
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/student/jobs">Browse opportunities</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((application) => {
            const offer = offerByApplication.get(application.id);
            const lastEvent = application.history.at(-1);

            return (
              <Card key={application.id}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/student/applications/${application.id}`}
                      className="block truncate font-medium text-primary hover:underline"
                    >
                      {relationField(application.jobPostingId, 'title')}
                    </Link>

                    <p className="truncate text-sm text-muted-foreground">
                      {relationField(application.companyId, 'name')}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Applied {formatDate(application.appliedAt)}
                      {lastEvent ? ` · last updated ${formatDate(lastEvent.at)}` : ''}
                      {application.currentRound > 0 ? ` · round ${application.currentRound}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {offer ? (
                      <Badge tone={PLACEMENT_STATUS_TONES[offer.status]}>
                        {formatCtc(offer.package.ctc, offer.package.currency)} ·{' '}
                        {PLACEMENT_STATUS_LABELS[offer.status]}
                      </Badge>
                    ) : null}

                    <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
                      {APPLICATION_STATUS_LABELS[application.status]}
                    </Badge>

                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/student/applications/${application.id}`}>Open</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </RouteGuard>
  );
}
