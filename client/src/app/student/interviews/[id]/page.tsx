'use client';

import { ArrowLeft, Building2, CalendarClock, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useConfirmInterview,
  useMyInterview,
  useRequestReschedule,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { Timeline, type TimelineEntry } from '@/components/ui/timeline';
import { can } from '@/lib/permissions';
import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_RESULT_TONES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_TONES,
  SELECTION_ROUND_TYPE_LABELS,
  relationField,
} from '@/lib/placement-display';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** The statuses a student may still confirm or ask to move. */
const ANSWERABLE = new Set(['scheduled', 'rescheduled']);
const MOVABLE = new Set(['scheduled', 'confirmed', 'rescheduled', 'in_progress']);

export default function StudentInterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const interview = useMyInterview(params.id);
  const confirm = useConfirmInterview(params.id);
  const requestReschedule = useRequestReschedule(params.id);

  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(false);

  if (interview.isLoading) return <FullPageSpinner label="Loading interview" />;

  /**
   * A 404 means the interview is not this student's. The server answers that
   * way deliberately — confirming it exists would leak that it does.
   */
  if (interview.isError) {
    return (
      <ErrorState
        title={
          interview.error.statusCode === 404
            ? 'That interview could not be found'
            : 'Could not load this interview'
        }
        message={
          interview.error.statusCode === 404
            ? 'It may have been cancelled, or it is not yours.'
            : interview.error.message
        }
        requestId={interview.error.requestId}
        onRetry={() => void interview.refetch()}
      />
    );
  }

  if (!interview.data) return null;

  const record = interview.data;

  /** Answering is `interview:respond`, held by students alone. */
  const mayRespond = can(user?.permissions, 'interview:respond');
  const canConfirm = mayRespond && ANSWERABLE.has(record.status);
  const canAskToMove = mayRespond && MOVABLE.has(record.status) && !record.rescheduleRequest;

  const entries: TimelineEntry[] = record.history.map((event, index) => ({
    id: `${event.at}-${event.to}-${index}`,
    title: INTERVIEW_STATUS_LABELS[event.to],
    at: formatDateTime(event.at),
    actor: event.actedByRole === 'student' ? 'You' : 'The placement office',
    detail: event.reason,
    tone:
      event.to === 'cancelled' || event.to === 'no_show'
        ? 'danger'
        : event.to === 'rescheduled'
          ? 'warning'
          : 'default',
  }));

  return (
    <RouteGuard permissions={['interview:read']}>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/student/interviews">
          <ArrowLeft aria-hidden />
          My interviews
        </Link>
      </Button>

      <PageHeader
        title={record.roundName}
        description={`${relationField(record.jobPostingId, 'title')} · ${relationField(record.companyId, 'name')}`}
        actions={
          <>
            {canConfirm ? (
              <Button onClick={() => setConfirming(true)}>Confirm attendance</Button>
            ) : null}

            {canAskToMove ? (
              <Button variant="outline" onClick={() => setRequesting(true)}>
                Ask to move
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={INTERVIEW_STATUS_TONES[record.status]}>
          {INTERVIEW_STATUS_LABELS[record.status]}
        </Badge>
        <Badge tone="neutral">Round {record.roundOrder}</Badge>
        <Badge tone="neutral">{INTERVIEW_MODE_LABELS[record.mode]}</Badge>
        {record.result.status !== 'pending' ? (
          <Badge tone={INTERVIEW_RESULT_TONES[record.result.status]}>
            {INTERVIEW_RESULT_LABELS[record.result.status]}
          </Badge>
        ) : null}
      </div>

      {record.status === 'scheduled' ? (
        <Alert tone="info" title="Please confirm you will attend" className="mb-4">
          The placement office needs to know you are coming.
        </Alert>
      ) : null}

      {record.status === 'rescheduled' ? (
        <Alert tone="warning" title="This interview has been moved" className="mb-4">
          Check the new time below and confirm again.
        </Alert>
      ) : null}

      {record.status === 'cancelled' ? (
        <Alert tone="danger" title="This interview was cancelled" className="mb-4">
          {record.cancellationReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      {record.status === 'no_show' ? (
        <Alert tone="danger" title="You were recorded as not attending" className="mb-4">
          Speak to the placement office if that is wrong.
        </Alert>
      ) : null}

      {record.rescheduleRequest ? (
        <Alert tone="info" title="You asked to move this interview" className="mb-4">
          <span className="block">{record.rescheduleRequest.reason}</span>
          <span className="mt-1 block text-xs opacity-80">
            Sent {formatDateTime(record.rescheduleRequest.requestedAt)}. The placement office
            decides whether to move it — the time below stands until they do.
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>When and where</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  { label: 'Date and time', value: formatDateTime(record.scheduledAt) },
                  { label: 'Duration', value: `${record.durationMinutes} minutes` },
                  { label: 'Mode', value: INTERVIEW_MODE_LABELS[record.mode] },
                  {
                    label: 'Type',
                    value:
                      SELECTION_ROUND_TYPE_LABELS[
                        record.type as keyof typeof SELECTION_ROUND_TYPE_LABELS
                      ] ?? record.type,
                  },
                  { label: 'Venue', value: record.venue },
                  { label: 'Panel', value: record.panelNumber },
                ]}
              />

              {record.meetingLink ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={record.meetingLink} target="_blank" rel="noreferrer">
                    <Video aria-hidden />
                    Join the interview
                  </a>
                </Button>
              ) : null}

              {record.instructions ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Instructions
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{record.instructions}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {record.result.status !== 'pending' ? (
            <Card>
              <CardHeader>
                <CardTitle>How it went</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DescriptionList
                  items={[
                    { label: 'Outcome', value: INTERVIEW_RESULT_LABELS[record.result.status] },
                    {
                      label: 'Score',
                      value:
                        record.result.score === null
                          ? null
                          : `${record.result.score}${record.result.maxScore ? ` / ${record.result.maxScore}` : ''}`,
                    },
                  ]}
                />

                {record.result.feedback ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Feedback
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm">{record.result.feedback}</p>
                  </div>
                ) : null}

                {record.result.strengths.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Strengths
                    </p>
                    <p className="mt-1 text-sm">{record.result.strengths.join(', ')}</p>
                  </div>
                ) : null}

                {record.result.improvements.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      To work on
                    </p>
                    <p className="mt-1 text-sm">{record.result.improvements.join(', ')}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <EmptyState
                  title="Nothing has changed yet"
                  description="The interview has not moved since it was scheduled."
                />
              ) : (
                <Timeline entries={entries} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Who you will meet</CardTitle>
            </CardHeader>
            <CardContent>
              {record.interviewers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The panel has not been announced.
                </p>
              ) : (
                <ul className="space-y-2">
                  {record.interviewers.map((person) => (
                    <li key={`${person.name}-${person.email ?? ''}`} className="text-sm">
                      <span className="font-medium">{person.name}</span>
                      {person.designation ? (
                        <span className="block text-xs text-muted-foreground">
                          {person.designation}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>The drive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium">{relationField(record.jobPostingId, 'title')}</p>
              <p className="text-sm text-muted-foreground">
                {relationField(record.companyId, 'name')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title="Confirm you will attend?"
        description="The placement office is told you are coming. Ask to move it instead if the time does not work."
        confirmLabel="Confirm attendance"
        isPending={confirm.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => confirm.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />

      <ReasonDialog
        open={requesting}
        tone="primary"
        title="Ask for a different time?"
        description="This sends a request. The placement office decides, and the current time stands until they move it."
        label="Reason"
        placeholder="Why this time does not work, and when would suit."
        confirmLabel="Send request"
        minLength={10}
        isPending={requestReschedule.isPending}
        onCancel={() => setRequesting(false)}
        onConfirm={(reason) =>
          requestReschedule.mutate(
            { reason, preferredSlots: [] },
            { onSuccess: () => setRequesting(false) },
          )
        }
      />
    </RouteGuard>
  );
}
