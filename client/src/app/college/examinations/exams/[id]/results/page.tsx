'use client';

import { History, RefreshCw, Send, Undo2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useExamMarks,
  useExamProfile,
  usePublicationHistory,
  usePublishResults,
  useRecalculateResults,
  useUnpublishResults,
  type MarksEntry,
} from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { PublishResultsDialog } from '@/components/examinations/publish-results-dialog';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { personName, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { formatDateTime, formatPercent } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const ACTION_TONES = {
  published: 'success',
  unpublished: 'danger',
  recalculated: 'warning',
} as const;

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const profile = useExamProfile(params.id);
  const marks = useExamMarks(params.id, { limit: 500, include: 'studentId', sort: '-percentage' });
  const history = usePublicationHistory(params.id);

  const publish = usePublishResults(params.id);
  const unpublish = useUnpublishResults(params.id);
  const recalculate = useRecalculateResults(params.id);

  const [showPublish, setShowPublish] = useState(false);
  const [showUnpublish, setShowUnpublish] = useState(false);
  const [showRecalculate, setShowRecalculate] = useState(false);

  if (profile.isLoading) return <FullPageSpinner label="Loading exam" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this exam"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { exam, results } = profile.data;
  const entries = marks.data?.items ?? [];

  const mayPublish = can(user?.permissions, 'result:publish');
  const mayWithhold = can(user?.permissions, 'result:withhold');
  const mayRecalculate = can(user?.permissions, 'result:recalculate');

  const isPublished = exam.status === 'results_published';
  const canPublishNow = exam.status === 'marks_entered';
  const unverified = entries.filter((entry) =>
    ['draft', 'submitted'].includes(entry.status),
  ).length;

  const columns: Column<MarksEntry>[] = [
    {
      key: 'studentId',
      header: 'Candidate',
      render: (entry) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{relationField(entry.studentId, 'rollNumber')}</p>
          <p className="truncate text-xs text-muted-foreground">{personName(entry.studentId)}</p>
        </div>
      ),
    },
    {
      key: 'finalTotal',
      header: 'Total',
      sortable: true,
      align: 'right',
      render: (entry) => (
        <span className="tabular">
          {entry.finalTotal}
          <span className="text-muted-foreground"> / {entry.maxTotal}</span>
        </span>
      ),
    },
    {
      key: 'percentage',
      header: '%',
      sortable: true,
      align: 'right',
      render: (entry) => <span className="tabular">{entry.percentage}</span>,
    },
    {
      key: 'letter',
      header: 'Grade',
      align: 'center',
      render: (entry) => (
        <Badge tone={entry.isPass ? 'success' : 'danger'}>{entry.letter || '—'}</Badge>
      ),
    },
    {
      key: 'gradePoint',
      header: 'Points',
      align: 'right',
      render: (entry) => <span className="tabular">{entry.gradePoint}</span>,
    },
    {
      key: 'visibility',
      header: 'Visibility',
      render: (entry) =>
        entry.isWithheld ? (
          <Badge tone="warning">Withheld</Badge>
        ) : entry.publishedVersion !== null ? (
          <Badge tone="success">Published v{entry.publishedVersion}</Badge>
        ) : (
          <Badge tone="neutral">{entry.status}</Badge>
        ),
    },
    {
      key: 'history',
      header: 'Corrections',
      align: 'right',
      render: (entry) =>
        entry.history.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular" title={entry.history[entry.history.length - 1]?.reason}>
            {entry.history.length}
          </span>
        ),
    },
  ];

  return (
    <RouteGuard permissions={['result:read', 'result:read_all']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Results' },
        ]}
      />

      <PageHeader
        title="Results"
        description={exam.title}
        actions={
          <>
            {mayPublish && canPublishNow ? (
              <Button onClick={() => setShowPublish(true)}>
                <Send aria-hidden />
                Publish results
              </Button>
            ) : null}

            {mayWithhold && isPublished ? (
              <Button variant="outline" onClick={() => setShowUnpublish(true)}>
                <Undo2 aria-hidden />
                Withdraw
              </Button>
            ) : null}

            {mayRecalculate && exam.status !== 'archived' && entries.length > 0 ? (
              <Button variant="outline" onClick={() => setShowRecalculate(true)}>
                <RefreshCw aria-hidden />
                Recalculate
              </Button>
            ) : null}
          </>
        }
      />

      <ExamTabs examId={exam.id} />

      {canPublishNow && unverified > 0 ? (
        <Alert tone="warning" title="Some marks are still unverified" className="mb-4">
          {unverified} mark{unverified === 1 ? '' : 's'} sit at draft or submitted. Publication is
          refused until every one is verified.
        </Alert>
      ) : null}

      {!canPublishNow && !isPublished ? (
        <Alert tone="info" title="Not ready to publish" className="mb-4">
          Results are released from the &ldquo;marks entered&rdquo; stage. Close marks entry on the
          overview once every candidate who appeared has a verified mark.
        </Alert>
      ) : null}

      {isPublished ? (
        <Alert tone="success" title="Results are live" className="mb-4">
          Version {results.currentVersion}, released {formatDateTime(results.publishedAt)}. Marks
          are locked — changing one now needs a reasoned correction, and the student is notified.
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Passed" value={results.passCount} />
        <StatCard label="Failed" value={results.failCount} invertDelta />
        <StatCard label="Average" value={formatPercent(results.averagePercent)} />
        <StatCard label="Highest" value={formatPercent(results.highestPercent)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            isLoading={marks.isLoading}
            isFetching={marks.isFetching}
            error={marks.error}
            onRetry={() => void marks.refetch()}
            stickyHeader
            emptyTitle="No marks recorded"
            emptyDescription="Enter marks for this exam before publishing results."
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden />
              Publication history
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Every release, withdrawal and recalculation, newest first.
            </p>
          </CardHeader>

          <CardContent>
            {history.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-16 w-full" />
                ))}
              </div>
            ) : (history.data ?? []).length === 0 ? (
              <EmptyState
                icon={History}
                title="Nothing published yet"
                description="Each release is recorded here with who did it and why."
              />
            ) : (
              <ol className="space-y-3">
                {history.data?.map((event) => (
                  <li
                    key={`${event.version}-${event.action}`}
                    className="border-l-2 border-border pl-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ACTION_TONES[event.action]}>{event.action}</Badge>
                      <span className="tabular text-xs text-muted-foreground">
                        v{event.version}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(event.actedAt)}
                    </p>

                    {event.action !== 'unpublished' ? (
                      <p className="tabular mt-1 text-xs">
                        {event.studentCount} student(s) · {event.passCount} passed ·{' '}
                        {event.failCount} failed
                        {event.withheldCount > 0 ? ` · ${event.withheldCount} withheld` : ''}
                      </p>
                    ) : (
                      <p className="tabular mt-1 text-xs">
                        {event.studentCount} result(s) withdrawn
                      </p>
                    )}

                    {event.reason ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        &ldquo;{event.reason}&rdquo;
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <PublishResultsDialog
        open={showPublish}
        entries={entries}
        isPending={publish.isPending}
        onCancel={() => setShowPublish(false)}
        onConfirm={(payload) =>
          publish.mutate(payload, { onSuccess: () => setShowPublish(false) })
        }
      />

      <ReasonDialog
        open={showUnpublish}
        title="Withdraw published results?"
        description="Marks are untouched — only their visibility changes. Every candidate is notified, and the withdrawal is recorded in the publication history."
        label="Reason"
        placeholder="A question paper error affected the whole cohort"
        confirmLabel="Withdraw results"
        tone="danger"
        isPending={unpublish.isPending}
        onCancel={() => setShowUnpublish(false)}
        onConfirm={(reason) =>
          unpublish.mutate(reason, { onSuccess: () => setShowUnpublish(false) })
        }
      />

      <ReasonDialog
        open={showRecalculate}
        title="Recalculate every result?"
        description="Re-grades from the raw component marks against the current scale. Raw marks are never altered, and each changed entry keeps its prior grade in history."
        label="Reason"
        placeholder="Grade scale revised by the examination board"
        confirmLabel="Recalculate"
        isPending={recalculate.isPending}
        onCancel={() => setShowRecalculate(false)}
        onConfirm={(reason) =>
          recalculate.mutate(reason, { onSuccess: () => setShowRecalculate(false) })
        }
      />
    </RouteGuard>
  );
}
