'use client';

import { ArrowLeft, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  useApplications,
  useBulkScheduleInterviews,
  useJobPosting,
  useJobPostings,
  type JobApplication,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import {
  INTERVIEW_MODE_OPTIONS,
  SELECTION_ROUND_TYPE_OPTIONS,
  personName,
} from '@/lib/placement-display';

/**
 * Scheduling a whole round.
 *
 * Every field here comes from `bulkScheduleInterviewSchema`: the drive, the
 * round, the panel layout and the start time. Slots are laid out server-side,
 * so this collects the plan rather than computing times itself.
 *
 * Only shortlisted and in-process candidates can be scheduled — the service
 * refuses anyone else — so the picker offers exactly those.
 */
export default function ScheduleInterviewsPage() {
  const router = useRouter();
  const bulkSchedule = useBulkScheduleInterviews();

  const [jobPostingId, setJobPostingId] = useState('');
  const [roundOrder, setRoundOrder] = useState('');
  const [type, setType] = useState('technical_interview');
  const [mode, setMode] = useState('online');
  const [startAt, setStartAt] = useState('');
  const [slotDurationMinutes, setSlotDuration] = useState('30');
  const [panels, setPanels] = useState('1');
  const [venue, setVenue] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const jobs = useJobPostings({ limit: 200, sort: 'title' });
  const job = useJobPosting(jobPostingId);

  const applications = useApplications(
    jobPostingId ? { jobPostingId, limit: 200, status: 'shortlisted' } : {},
  );

  const rounds = job.data?.selectionRounds ?? [];
  const round = rounds.find((entry) => String(entry.order) === roundOrder);

  const candidates = useMemo(() => applications.data?.items ?? [], [applications.data]);

  const ready =
    Boolean(jobPostingId) && Boolean(roundOrder) && Boolean(startAt) && selectedIds.length > 0;

  const columns: Column<JobApplication>[] = [
    {
      key: 'student',
      header: 'Candidate',
      render: (application) => {
        const student = typeof application.studentId === 'object' ? application.studentId : null;

        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{personName(student)}</p>
            <p className="truncate text-xs text-muted-foreground">{student?.rollNumber ?? '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'currentRound',
      header: 'Round reached',
      align: 'right',
      render: (application) => (
        <span className="tabular">
          {application.currentRound === 0 ? '—' : application.currentRound}
        </span>
      ),
    },
  ];

  function submit(): void {
    if (!round) return;

    bulkSchedule.mutate(
      {
        jobPostingId,
        applicationIds: selectedIds,
        roundOrder: Number(roundOrder),
        roundName: round.name,
        type,
        mode,
        startAt: new Date(startAt).toISOString(),
        slotDurationMinutes: Number(slotDurationMinutes),
        // The schema takes this, and the server uses it to size the grid.
        slotsPerPanel: Math.max(1, Math.ceil(selectedIds.length / Number(panels))),
        panels: Number(panels),
        venue: venue.trim() || null,
        meetingLink: meetingLink.trim() || null,
      },
      { onSuccess: () => router.push('/college/placements/interviews') },
    );
  }

  return (
    <RouteGuard permissions={['interview:schedule']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Interviews', href: '/college/placements/interviews' },
          { label: 'Schedule' },
        ]}
      />

      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/college/placements/interviews">
          <ArrowLeft aria-hidden />
          All interviews
        </Link>
      </Button>

      <PageHeader
        title="Schedule a round"
        description="Lay out slots across panels for the candidates you pick."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Candidates</CardTitle>
              <p className="text-sm text-muted-foreground">
                Shortlisted candidates on this drive. Anyone already scheduled for the round is
                skipped by the server rather than duplicated.
              </p>
            </CardHeader>
            <CardContent>
              {!jobPostingId ? (
                <Alert tone="info" title="Choose a drive first">
                  Candidates appear once you pick the drive on the right.
                </Alert>
              ) : (
                <DataTable
                  columns={columns}
                  rows={candidates}
                  rowKey={(application) => application.id}
                  isLoading={applications.isLoading}
                  error={applications.error}
                  onRetry={() => void applications.refetch()}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  emptyTitle="No shortlisted candidates"
                  emptyDescription="Shortlist candidates on the applications page before scheduling a round."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>The plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Drive</span>
                <Select
                  value={jobPostingId}
                  onChange={(event) => {
                    setJobPostingId(event.target.value);
                    setRoundOrder('');
                    setSelectedIds([]);
                  }}
                  aria-label="Drive"
                  placeholder="Choose a drive"
                  options={(jobs.data?.items ?? []).map((entry) => ({
                    value: entry.id,
                    label: entry.title,
                  }))}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Round</span>
                <Select
                  value={roundOrder}
                  onChange={(event) => setRoundOrder(event.target.value)}
                  aria-label="Round"
                  placeholder={jobPostingId ? 'Choose a round' : 'Pick a drive first'}
                  disabled={!jobPostingId}
                  options={rounds.map((entry) => ({
                    value: String(entry.order),
                    label: `${entry.order}. ${entry.name}`,
                  }))}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Type</span>
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  aria-label="Interview type"
                  options={SELECTION_ROUND_TYPE_OPTIONS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Mode</span>
                <Select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  aria-label="Interview mode"
                  options={INTERVIEW_MODE_OPTIONS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">First slot</span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  aria-label="First slot"
                  className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Slot length</span>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={slotDurationMinutes}
                    onChange={(event) => setSlotDuration(event.target.value)}
                    aria-label="Slot length in minutes"
                    className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Panels</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={panels}
                    onChange={(event) => setPanels(event.target.value)}
                    aria-label="Number of panels"
                    className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Venue</span>
                <input
                  type="text"
                  value={venue}
                  onChange={(event) => setVenue(event.target.value)}
                  placeholder="Placement cell, block C"
                  aria-label="Venue"
                  className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Meeting link</span>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(event) => setMeetingLink(event.target.value)}
                  placeholder="https://meet.example.com/abc"
                  aria-label="Meeting link"
                  className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              {selectedIds.length > 0 && startAt ? (
                <p className="text-xs text-muted-foreground">
                  {selectedIds.length} candidate{selectedIds.length === 1 ? '' : 's'} across{' '}
                  {panels} panel{panels === '1' ? '' : 's'}, {slotDurationMinutes} minutes each.
                </p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={!ready}
                isLoading={bulkSchedule.isPending}
                loadingText="Scheduling"
                onClick={submit}
              >
                Schedule {selectedIds.length > 0 ? selectedIds.length : ''} interview
                {selectedIds.length === 1 ? '' : 's'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </RouteGuard>
  );
}
