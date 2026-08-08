'use client';

import type { GradeBandInput, GradePolicyInput } from '@peacefic/shared';
import { CheckCheck, Pencil, Save, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  useCorrectMark,
  useEnterMarks,
  useExamAttendance,
  useExamMarks,
  useExamProfile,
  useExamRegistrations,
  useVerifyMarks,
  type ExamAttendanceRecord,
  type MarksEntry,
} from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { CorrectMarkDialog } from '@/components/examinations/correct-mark-dialog';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import {
  MarksEntryGrid,
  type MarksDraft,
  type MarksRow,
} from '@/components/examinations/marks-entry-grid';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { FullPageSpinner } from '@/components/ui/spinner';
import { personName, relationField } from '@/lib/examination-display';
import { can } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

const NON_APPEARING = new Set(['absent', 'debarred', 'malpractice']);
const EMPTY_DRAFT: MarksDraft = { theory: '', practical: '', internal: '', graceMarks: '0' };

function toDraft(entry: MarksEntry | undefined): MarksDraft {
  if (!entry) return { ...EMPTY_DRAFT };

  return {
    theory: entry.theory === null ? '' : String(entry.theory),
    practical: entry.practical === null ? '' : String(entry.practical),
    internal: entry.internal === null ? '' : String(entry.internal),
    graceMarks: String(entry.graceMarks ?? 0),
  };
}

export default function MarksEntryPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const profile = useExamProfile(params.id);
  const registrations = useExamRegistrations(params.id, { limit: 500, include: 'studentId' });
  const attendance = useExamAttendance(params.id);
  const marks = useExamMarks(params.id, { limit: 500, include: 'studentId' });

  const enterMarks = useEnterMarks(params.id);
  const verifyMarks = useVerifyMarks(params.id);
  const correctMark = useCorrectMark(params.id);

  const [drafts, setDrafts] = useState<Record<string, MarksDraft>>({});
  const [touched, setTouched] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unentered' | 'entered'>('all');
  const [correcting, setCorrecting] = useState<MarksEntry | null>(null);
  const [pendingVerify, setPendingVerify] = useState(false);

  const entriesByStudent = useMemo(() => {
    const map = new Map<string, MarksEntry>();
    for (const entry of marks.data?.items ?? []) {
      map.set(typeof entry.studentId === 'string' ? entry.studentId : entry.studentId.id, entry);
    }
    return map;
  }, [marks.data]);

  const attendanceByStudent = useMemo(() => {
    const map = new Map<string, ExamAttendanceRecord['status']>();
    for (const record of attendance.data ?? []) {
      map.set(
        typeof record.studentId === 'string' ? record.studentId : record.studentId.id,
        record.status,
      );
    }
    return map;
  }, [attendance.data]);

  const allRows = useMemo<MarksRow[]>(
    () =>
      (registrations.data?.items ?? [])
        .filter((row) => row.status !== 'withdrawn')
        .map((row) => {
          const studentId =
            typeof row.studentId === 'string' ? row.studentId : row.studentId.id;
          const attendanceStatus = attendanceByStudent.get(studentId) ?? null;

          return {
            studentId,
            rollNumber: relationField(row.studentId, 'rollNumber'),
            name: personName(row.studentId),
            attempt: row.attempt,
            isNonAppearing: NON_APPEARING.has(attendanceStatus ?? ''),
            attendanceStatus,
            existing: entriesByStudent.get(studentId),
          };
        }),
    [registrations.data, attendanceByStudent, entriesByStudent],
  );

  // Seeded from what is saved so a partly entered sheet reopens as left.
  useEffect(() => {
    if (registrations.isLoading || marks.isLoading) return;

    const next: Record<string, MarksDraft> = {};
    for (const row of allRows) next[row.studentId] = toDraft(row.existing);

    setDrafts(next);
    setTouched(false);
  }, [allRows, registrations.isLoading, marks.isLoading]);

  const rows = useMemo(() => {
    if (filter === 'unentered') return allRows.filter((row) => !row.existing);
    if (filter === 'entered') return allRows.filter((row) => row.existing);
    return allRows;
  }, [allRows, filter]);

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

  const { exam, gradeScale } = profile.data;

  const mayEnter = can(user?.permissions, 'marks:enter');
  const mayVerify = can(user?.permissions, 'marks:verify');
  const mayCorrect = can(user?.permissions, 'marks:correct');
  const entryOpen = ['completed', 'marks_entered'].includes(exam.status);

  if (!gradeScale) {
    return (
      <RouteGuard permissions={['marks:read', 'marks:enter']}>
        <Alert tone="danger" title="No grading scale is configured">
          This exam cannot be graded until the college has a grade scale. Create one under
          Examinations → Grade scales, or set a default.
        </Alert>
      </RouteGuard>
    );
  }

  const bands = gradeScale.bands as unknown as GradeBandInput[];
  const policy = gradeScale.policy as unknown as GradePolicyInput;

  const submittedCount = allRows.filter((row) => row.existing?.status === 'submitted').length;
  const verifiedCount = allRows.filter((row) =>
    ['verified', 'locked'].includes(row.existing?.status ?? ''),
  ).length;
  const appearedCount = allRows.filter((row) => !row.isNonAppearing).length;

  function change(studentId: string, field: keyof MarksDraft, value: string): void {
    setDrafts((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? EMPTY_DRAFT), [field]: value },
    }));
    setTouched(true);
  }

  function isRowLocked(row: MarksRow): boolean {
    if (!mayEnter || !entryOpen) return true;
    // A verified or locked mark is a finished record — changing it is a
    // reasoned correction, not an overwrite. The server skips these too.
    return ['verified', 'locked'].includes(row.existing?.status ?? '');
  }

  function save(submit: boolean): void {
    const entries = rows
      .filter((row) => !isRowLocked(row))
      .map((row) => {
        const draft = drafts[row.studentId] ?? EMPTY_DRAFT;

        const toNumberOrNull = (value: string): number | null =>
          value.trim() === '' ? null : Number(value);

        return {
          studentId: row.studentId,
          theory: toNumberOrNull(draft.theory),
          practical: toNumberOrNull(draft.practical),
          internal: toNumberOrNull(draft.internal),
          graceMarks: Number(draft.graceMarks) || 0,
        };
      })
      // Nothing typed and nothing saved means the examiner has not reached this
      // candidate yet; sending zeros would grade them as having failed.
      .filter(
        (entry) =>
          entry.theory !== null ||
          entry.practical !== null ||
          entry.internal !== null ||
          (entry.graceMarks ?? 0) > 0,
      );

    if (entries.length === 0) return;

    enterMarks.mutate({ entries, submit }, { onSuccess: () => setTouched(false) });
  }

  const enterableCount = rows.filter((row) => !isRowLocked(row)).length;

  return (
    <RouteGuard permissions={['marks:read', 'marks:enter']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Marks' },
        ]}
      />

      <PageHeader
        title="Marks entry"
        description={`${exam.title} · graded against ${gradeScale.name}. Every grade shown is computed by the same engine the server uses.`}
        actions={
          mayVerify && submittedCount > 0 ? (
            <Button variant="outline" onClick={() => setPendingVerify(true)}>
              <CheckCheck aria-hidden />
              Verify {submittedCount}
            </Button>
          ) : null
        }
      />

      <ExamTabs examId={exam.id} />

      {!entryOpen ? (
        <Alert tone="info" title="Marks entry is closed" className="mb-4">
          {['draft', 'scheduled', 'published'].includes(exam.status)
            ? 'Mark the exam complete once the sitting is over, then marks can be entered.'
            : 'Results have been published. Use Correct to change a mark — the prior value is kept with the reason.'}
        </Alert>
      ) : null}

      {attendance.data?.length === 0 && entryOpen ? (
        <Alert tone="warning" title="No attendance recorded" className="mb-4">
          Nobody has been marked present or absent. An absent candidate fails outright regardless
          of the marks entered, so record attendance first.
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="tabular">
              <strong>{entriesByStudent.size}</strong>
              <span className="text-muted-foreground"> / {allRows.length} entered</span>
            </span>
            <span className="tabular text-muted-foreground">
              Appeared: <strong className="text-foreground">{appearedCount}</strong>
            </span>
            <span className="tabular text-muted-foreground">
              Submitted: <strong className="text-foreground">{submittedCount}</strong>
            </span>
            <span className="tabular text-muted-foreground">
              Verified: <strong className="text-foreground">{verifiedCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              aria-label="Filter candidates"
              className="w-40"
              options={[
                { value: 'all', label: 'All candidates' },
                { value: 'unentered', label: 'Not yet entered' },
                { value: 'entered', label: 'Already entered' },
              ]}
            />

            {mayCorrect ? (
              <Select
                value=""
                onChange={(event) => {
                  const entry = entriesByStudent.get(event.target.value);
                  if (entry) setCorrecting(entry);
                }}
                placeholder="Correct a mark…"
                aria-label="Correct an entered mark"
                className="w-48"
                options={allRows
                  .filter((row) => row.existing)
                  .map((row) => ({ value: row.studentId, label: row.rollNumber }))}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {registrations.isLoading || marks.isLoading ? (
        <FullPageSpinner label="Loading the marks sheet" />
      ) : allRows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="Nobody to grade"
              description="Register candidates for this exam first."
            />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Pencil}
              title="Nothing matches that filter"
              description="Every candidate is on the other side of this filter."
              action={
                <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                  Show all
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <MarksEntryGrid
          rows={rows}
          drafts={drafts}
          maxMarks={exam.maxMarks}
          bands={bands}
          policy={policy}
          onChange={change}
          isRowLocked={isRowLocked}
        />
      )}

      {mayEnter && entryOpen && enterableCount > 0 ? (
        // Sticky so the action stays reachable on a 200-row sheet.
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {touched ? 'You have unsaved changes.' : `${enterableCount} row(s) open for entry.`}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => save(false)}
              disabled={enterMarks.isPending}
              title="Save without submitting for verification"
            >
              <Save aria-hidden />
              Save draft
            </Button>

            <Button
              onClick={() => save(true)}
              isLoading={enterMarks.isPending}
              loadingText="Submitting"
            >
              <Send aria-hidden />
              Submit for verification
            </Button>
          </div>
        </div>
      ) : null}

      <CorrectMarkDialog
        open={correcting !== null}
        entry={correcting}
        maxMarks={exam.maxMarks}
        bands={bands}
        policy={policy}
        isPending={correctMark.isPending}
        onCancel={() => setCorrecting(null)}
        onConfirm={(payload) =>
          correctMark.mutate(payload, { onSuccess: () => setCorrecting(null) })
        }
      />

      <ConfirmDialog
        open={pendingVerify}
        title={`Verify ${submittedCount} submitted mark${submittedCount === 1 ? '' : 's'}?`}
        description="Verification is what makes a mark eligible for publication. A verified mark can only be changed by a reasoned correction afterwards."
        confirmLabel="Verify"
        isPending={verifyMarks.isPending}
        onCancel={() => setPendingVerify(false)}
        onConfirm={() =>
          verifyMarks.mutate(undefined, { onSuccess: () => setPendingVerify(false) })
        }
      />
    </RouteGuard>
  );
}
