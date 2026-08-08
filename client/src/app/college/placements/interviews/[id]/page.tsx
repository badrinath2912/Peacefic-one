'use client';

import type { InterviewStatus } from '@peacefic/shared';
import { ArrowLeft, Briefcase, Building2, CalendarClock, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useCancelInterview,
  useInterview,
  useRescheduleInterview,
  useTransitionInterview,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { RescheduleDialog } from '@/components/placement/reschedule-dialog';
import { ResultDialog } from '@/components/placement/result-dialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
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
  INTERVIEW_ACTION_DESCRIPTIONS,
  INTERVIEW_ACTION_LABELS,
  INTERVIEW_MODE_LABELS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_RESULT_TONES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_TONES,
  INTERVIEW_TRANSITIONS_WITH_OWN_ENDPOINT,
  OFFICE_INTERVIEW_TRANSITIONS,
  SELECTION_ROUND_TYPE_LABELS,
  personName,
  relationField,
} from '@/lib/placement-display';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function InterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const interview = useInterview(params.id);
  const transition = useTransitionInterview(params.id);
  const cancel = useCancelInterview(params.id);
  const reschedule = useRescheduleInterview(params.id);

  const [pending, setPending] = useState<InterviewStatus | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [recording, setRecording] = useState(false);

  if (interview.isLoading) return <FullPageSpinner label="Loading interview" />;

  if (interview.isError) {
    return (
      <ErrorState
        title="Could not load this interview"
        message={interview.error.message}
        requestId={interview.error.requestId}
        onRetry={() => void interview.refetch()}
      />
    );
  }

  if (!interview.data) return null;

  const record = interview.data;
  const student = typeof record.studentId === 'object' ? record.studentId : null;
  const studentUser = student && typeof student.userId === 'object' ? student.userId : null;
  const job = typeof record.jobPostingId === 'object' ? record.jobPostingId : null;
  const company = typeof record.companyId === 'object' ? record.companyId : null;
  const application = typeof record.applicationId === 'object' ? record.applicationId : null;

  const mayUpdate = can(user?.permissions, 'interview:update');
  const mayRecord = can(user?.permissions, 'interview:record_result');

  /**
   * Derived from the shared map, so the client cannot drift from what the
   * service accepts. Cancelling and moving have their own endpoints and their
   * own payloads, so they are handled separately from the generic transition.
   */
  const transitions = mayUpdate
    ? OFFICE_INTERVIEW_TRANSITIONS[record.status].filter(
        (target) => !INTERVIEW_TRANSITIONS_WITH_OWN_ENDPOINT.has(target),
      )
    : [];

  const canCancel = mayUpdate && OFFICE_INTERVIEW_TRANSITIONS[record.status].includes('cancelled');
  const canReschedule =
    mayUpdate && OFFICE_INTERVIEW_TRANSITIONS[record.status].includes('rescheduled');

  const entries: TimelineEntry[] = record.history.map((event, index) => ({
    id: `${event.at}-${event.to}-${index}`,
    title: INTERVIEW_STATUS_LABELS[event.to],
    at: formatDateTime(event.at),
    actor: event.actedByRole === 'student' ? 'By the candidate' : 'By the placement office',
    detail: event.reason,
    tone:
      event.to === 'cancelled' || event.to === 'no_show'
        ? 'danger'
        : event.to === 'rescheduled'
          ? 'warning'
          : 'default',
  }));

  return (
    <RouteGuard permissions={['interview:read_all']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Interviews', href: '/college/placements/interviews' },
          { label: record.roundName },
        ]}
      />

      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/college/placements/interviews">
          <ArrowLeft aria-hidden />
          All interviews
        </Link>
      </Button>

      <PageHeader
        title={personName(student)}
        description={`${record.roundName} · ${relationField(record.jobPostingId, 'title')}`}
        actions={
          <>
            {transitions.map((target) => (
              <Button
                key={target}
                variant={target === 'no_show' ? 'outline' : 'primary'}
                onClick={() => setPending(target)}
                title={INTERVIEW_ACTION_DESCRIPTIONS[target]}
              >
                {INTERVIEW_ACTION_LABELS[target]}
              </Button>
            ))}

            {canReschedule ? (
              <Button variant="outline" onClick={() => setRescheduling(true)}>
                Move
              </Button>
            ) : null}

            {canCancel ? (
              <Button variant="outline" onClick={() => setPending('cancelled')}>
                Cancel
              </Button>
            ) : null}

            {mayRecord && record.status !== 'cancelled' ? (
              <Button variant="outline" onClick={() => setRecording(true)}>
                Record result
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={INTERVIEW_STATUS_TONES[record.status]}>
          {INTERVIEW_STATUS_LABELS[record.status]}
        </Badge>
        <Badge tone={INTERVIEW_RESULT_TONES[record.result.status]}>
          {INTERVIEW_RESULT_LABELS[record.result.status]}
        </Badge>
        <Badge tone="neutral">Round {record.roundOrder}</Badge>
        <Badge tone="neutral">{INTERVIEW_MODE_LABELS[record.mode]}</Badge>
      </div>

      {record.status === 'cancelled' ? (
        <Alert tone="danger" title="This interview was cancelled" className="mb-4">
          {record.cancellationReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      {/* The candidate asked for another time; only the office can grant it. */}
      {record.rescheduleRequest ? (
        <Alert tone="warning" title="The candidate asked to move this interview" className="mb-4">
          <span className="block">{record.rescheduleRequest.reason}</span>

          {record.rescheduleRequest.preferredSlots.length > 0 ? (
            <span className="mt-1 block text-xs">
              Preferred:{' '}
              {record.rescheduleRequest.preferredSlots
                .map((slot) => formatDateTime(slot))
                .join(' · ')}
            </span>
          ) : null}

          <span className="mt-1 block text-xs opacity-80">
            Asked on {formatDateTime(record.rescheduleRequest.requestedAt)}. Moving the interview is
            still your decision.
          </span>
        </Alert>
      ) : null}

      {!mayUpdate && OFFICE_INTERVIEW_TRANSITIONS[record.status].length > 0 ? (
        <Alert tone="info" title="You have read-only access to this interview" className="mb-4">
          Moving, cancelling or recording a result needs the interview update or result permission.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>The slot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  { label: 'When', value: formatDateTime(record.scheduledAt) },
                  { label: 'Duration', value: `${record.durationMinutes} minutes` },
                  { label: 'Mode', value: INTERVIEW_MODE_LABELS[record.mode] },
                  {
                    label: 'Type',
                    value:
                      SELECTION_ROUND_TYPE_LABELS[
                        record.type as keyof typeof SELECTION_ROUND_TYPE_LABELS
                      ] ?? record.type,
                  },
                  { label: 'Panel', value: record.panelNumber },
                  { label: 'Venue', value: record.venue },
                  { label: 'Confirmed', value: formatDateTime(record.confirmedAt) },
                ]}
              />

              {record.meetingLink ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={record.meetingLink} target="_blank" rel="noreferrer">
                    <Video aria-hidden />
                    Join link
                  </a>
                </Button>
              ) : null}

              {record.instructions ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Instructions to the candidate
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{record.instructions}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <p className="text-sm text-muted-foreground">
                Recording a result never moves the application — that is a separate decision.
              </p>
            </CardHeader>
            <CardContent>
              {record.result.status === 'pending' ? (
                <EmptyState
                  title="No result recorded yet"
                  description="The outcome of this round has not been entered."
                />
              ) : (
                <div className="space-y-4">
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
                      { label: 'Recorded', value: formatDateTime(record.result.recordedAt) },
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
                        To improve
                      </p>
                      <p className="mt-1 text-sm">{record.result.improvements.join(', ')}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <EmptyState
                  title="No changes yet"
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
              <CardTitle>Candidate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DescriptionList
                items={[
                  { label: 'Name', value: personName(student) },
                  { label: 'Roll number', value: student?.rollNumber },
                  { label: 'Email', value: studentUser?.email },
                ]}
              />

              {student && !studentUser ? (
                <Alert tone="info" title="Contact details are not visible to you">
                  The API returned this candidate without their user record.
                </Alert>
              ) : null}

              {application ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/college/placements/applications/${application.id}`}>
                    Open application
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Panel</CardTitle>
            </CardHeader>
            <CardContent>
              {record.interviewers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No interviewers were recorded for this round.
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
                      {person.email ? (
                        <span className="block text-xs text-muted-foreground">{person.email}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>Drive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {job ? (
                <Link
                  href={`/college/placements/jobs/${job.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {job.title}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}

              {company ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="size-3.5" aria-hidden />
                  {company.name}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancelling carries a reason; the other transitions do not. */}
      {pending === 'cancelled' ? (
        <ReasonDialog
          open
          tone="danger"
          title="Cancel this interview?"
          description={INTERVIEW_ACTION_DESCRIPTIONS.cancelled}
          label="Reason"
          placeholder="Shared with the candidate."
          confirmLabel="Cancel interview"
          minLength={3}
          isPending={cancel.isPending}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => cancel.mutate(reason, { onSuccess: () => setPending(null) })}
        />
      ) : null}

      {pending && pending !== 'cancelled' ? (
        <ConfirmDialog
          open
          tone="primary"
          title={`${INTERVIEW_ACTION_LABELS[pending]}?`}
          description={INTERVIEW_ACTION_DESCRIPTIONS[pending]}
          confirmLabel={INTERVIEW_ACTION_LABELS[pending]}
          isPending={transition.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            transition.mutate({ to: pending }, { onSuccess: () => setPending(null) })
          }
        />
      ) : null}

      <RescheduleDialog
        open={rescheduling}
        isPending={reschedule.isPending}
        onCancel={() => setRescheduling(false)}
        onConfirm={(scheduledAt, reason) =>
          reschedule.mutate(
            { scheduledAt, reason },
            { onSuccess: () => setRescheduling(false) },
          )
        }
      />

      <ResultDialog
        open={recording}
        interviewId={record.id}
        onCancel={() => setRecording(false)}
        onRecorded={() => setRecording(false)}
      />
    </RouteGuard>
  );
}
