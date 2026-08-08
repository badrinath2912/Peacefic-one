'use client';

import { CalendarPlus, Check, Pencil, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { useTrainingRequest, useTrainingRequestAction } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relationCodes(value: Array<string | { code?: string; name?: string }>): string {
  const labels = value
    .map((entry) => (typeof entry === 'object' && entry ? (entry.name ?? entry.code ?? null) : null))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(', ') : 'College-wide';
}

function personName(value: unknown): string | null {
  if (value && typeof value === 'object' && 'firstName' in value) {
    const person = value as { firstName: string; lastName: string };
    return `${person.firstName} ${person.lastName}`.trim();
  }
  return null;
}

export default function TrainingRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const request = useTrainingRequest(params.id);
  const action = useTrainingRequestAction(params.id);

  const [dialog, setDialog] = useState<'reject' | 'cancel' | null>(null);

  if (request.isLoading) return <FullPageSpinner label="Loading request" />;

  if (request.isError) {
    return (
      <ErrorState
        title="Could not load this request"
        message={request.error.message}
        requestId={request.error.requestId}
        onRetry={() => void request.refetch()}
      />
    );
  }

  if (!request.data) return <FullPageSpinner label="Loading" />;

  const record = request.data;

  // The workflow decides what is offered — the server rejects anything else,
  // so the UI only shows transitions that are actually legal from here.
  const canSubmit = record.status === 'draft' && can(user?.permissions, 'training:update');
  const canReview =
    ['submitted', 'under_review'].includes(record.status) &&
    can(user?.permissions, 'training:approve');
  const canSchedule =
    record.status === 'approved' && can(user?.permissions, 'training:assign_trainer');
  const canCancel =
    !['completed', 'cancelled', 'rejected'].includes(record.status) &&
    can(user?.permissions, 'training:update');
  const canEdit =
    ['draft', 'submitted'].includes(record.status) && can(user?.permissions, 'training:update');

  return (
    <RouteGuard permissions={['training:read']}>
      <Breadcrumbs
        items={[
          { label: 'Training', href: '/college/training' },
          { label: 'Requests', href: '/college/training/requests' },
          { label: record.reference },
        ]}
      />

      <PageHeader
        title={record.title}
        description={`${record.reference} · ${toTitleCase(record.trainingType)}`}
        actions={
          <>
            {canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/college/training/requests/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {canSubmit ? (
              <Button
                onClick={() => action.mutate({ action: 'submit' })}
                isLoading={action.isPending}
              >
                <Send aria-hidden />
                Submit for approval
              </Button>
            ) : null}

            {canReview ? (
              <>
                <Button variant="outline" onClick={() => setDialog('reject')}>
                  <X aria-hidden />
                  Reject
                </Button>
                <Button
                  onClick={() => action.mutate({ action: 'approve' })}
                  isLoading={action.isPending}
                >
                  <Check aria-hidden />
                  Approve
                </Button>
              </>
            ) : null}

            {canSchedule ? (
              <Button asChild>
                <Link href={`/college/training/sessions/new?requestId=${params.id}`}>
                  <CalendarPlus aria-hidden />
                  Schedule session
                </Link>
              </Button>
            ) : null}

            {canCancel ? (
              <Button variant="ghost" onClick={() => setDialog('cancel')}>
                Cancel request
              </Button>
            ) : null}
          </>
        }
      />

      {/* The outcome, and crucially the reason, stated up front. */}
      {record.status === 'rejected' && record.rejectionReason ? (
        <Alert tone="danger" title="This request was not approved" className="mb-4">
          {record.rejectionReason}
        </Alert>
      ) : null}

      {record.status === 'cancelled' && record.cancellationReason ? (
        <Alert tone="warning" title="This request was cancelled" className="mb-4">
          {record.cancellationReason}
        </Alert>
      ) : null}

      {record.status === 'approved' && record.reviewComments ? (
        <Alert tone="success" title="Approved" className="mb-4">
          {record.reviewComments}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Reference', value: record.reference },
                { label: 'Category', value: toTitleCase(record.trainingType) },
                { label: 'Mode', value: toTitleCase(record.mode) },
                { label: 'Participants', value: record.expectedParticipants },
                { label: 'Duration', value: `${record.durationHours} hours` },
                { label: 'Preferred start', value: formatDate(record.preferredStartDate) },
                { label: 'Preferred end', value: formatDate(record.preferredEndDate) },
                { label: 'Departments', value: relationCodes(record.departmentIds) },
                { label: 'Batches', value: relationCodes(record.batchIds) },
                { label: 'Topics', value: record.topics.join(', ') || null },
                { label: 'Description', value: record.description, full: true },
                { label: 'Objectives', value: record.objectives, full: true },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={record.status} />
              <StatusBadge status={record.priority} />
            </div>

            <DescriptionList
              items={[
                { label: 'Raised by', value: personName(record.requestedBy), full: true },
                { label: 'Raised on', value: formatDate(record.createdAt), full: true },
                { label: 'Reviewed by', value: personName(record.reviewedBy), full: true },
                {
                  label: 'Reviewed on',
                  value: record.reviewedAt ? formatDateTime(record.reviewedAt) : null,
                  full: true,
                },
                {
                  label: 'Sessions scheduled',
                  value: record.sessionIds.length,
                  full: true,
                },
              ]}
            />

            {record.sessionIds.length > 0 ? (
              <Button variant="outline" size="sm" block asChild>
                <Link href={`/college/training/sessions?requestId=${params.id}`}>
                  View sessions
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ReasonDialog
        open={dialog === 'reject'}
        title="Reject this request?"
        description="The requester is told immediately, and the reason you give travels with the notification."
        label="Reason for rejection"
        placeholder="The proposed dates clash with the examination timetable."
        confirmLabel="Reject request"
        tone="danger"
        minLength={10}
        isPending={action.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          action.mutate(
            { action: 'reject', body: { reason } },
            { onSuccess: () => setDialog(null) },
          )
        }
      />

      <ReasonDialog
        open={dialog === 'cancel'}
        title="Cancel this request?"
        description="The request is closed and cannot be reopened."
        label="Reason for cancelling"
        confirmLabel="Cancel request"
        tone="danger"
        minLength={10}
        isPending={action.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          action.mutate(
            { action: 'cancel', body: { reason } },
            { onSuccess: () => setDialog(null) },
          )
        }
      />
    </RouteGuard>
  );
}
