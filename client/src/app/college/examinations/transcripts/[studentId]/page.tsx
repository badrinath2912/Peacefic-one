'use client';

import { Award, Printer, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import {
  useGenerateTranscript,
  useStudentResults,
  useTranscript,
  useTranscriptVersions,
} from '@/api/examination-queries';
import { useStudent } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function TranscriptPage() {
  const params = useParams<{ studentId: string }>();
  const { user } = useAuth();

  const student = useStudent(params.studentId);
  const transcript = useTranscript(params.studentId);
  const versions = useTranscriptVersions(params.studentId);
  const liveResults = useStudentResults(params.studentId);
  const generate = useGenerateTranscript();

  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  const mayGenerate = can(user?.permissions, 'transcript:generate');

  if (student.isLoading) return <FullPageSpinner label="Loading student" />;

  const studentName =
    student.data && typeof student.data.userId === 'object' ? student.data.userId.fullName : '';

  // A specific revision can be inspected; by default the current one is shown.
  const shown =
    viewing === null
      ? transcript.data
      : (versions.data ?? []).find((entry) => entry.revision === viewing);

  const hasTranscript = Boolean(transcript.data);
  const isStale =
    hasTranscript &&
    liveResults.data !== undefined &&
    liveResults.data.summary.cgpa !== transcript.data?.cgpa;

  return (
    <RouteGuard permissions={['transcript:read']}>
      <div className="print:hidden">
        <Breadcrumbs
          items={[
            { label: 'Examinations', href: '/college/examinations' },
            { label: 'Transcripts', href: '/college/examinations/transcripts' },
            { label: student.data?.rollNumber ?? 'Student' },
          ]}
        />

        <PageHeader
          title={student.data?.rollNumber ?? 'Transcript'}
          description={studentName}
          actions={
            <>
              {hasTranscript ? (
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer aria-hidden />
                  Print
                </Button>
              ) : null}

              {mayGenerate ? (
                <Button onClick={() => setPendingGenerate(true)}>
                  <RefreshCw aria-hidden />
                  {hasTranscript ? 'Regenerate' : 'Generate'}
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {isStale ? (
        <Card className="mb-4 border-warning/30 bg-warning-subtle print:hidden">
          <CardContent className="p-4 text-sm">
            Published results have changed since this transcript was issued — the live CGPA is{' '}
            <strong className="tabular">{liveResults.data?.summary.cgpa}</strong> against{' '}
            <strong className="tabular">{transcript.data?.cgpa}</strong> on the document. Regenerate
            to issue a new revision.
          </CardContent>
        </Card>
      ) : null}

      {transcript.isLoading ? (
        <FullPageSpinner label="Loading transcript" />
      ) : !shown ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Award}
              title="No transcript yet"
              description={
                liveResults.data && liveResults.data.results.length > 0
                  ? 'This student has published results. Generate a transcript to freeze them into an issued document.'
                  : 'A transcript is built from published results. Publish some first.'
              }
              action={
                mayGenerate && liveResults.data && liveResults.data.results.length > 0 ? (
                  <Button size="sm" onClick={() => setPendingGenerate(true)}>
                    Generate transcript
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="CGPA" value={shown.cgpa.toFixed(2)} icon={Award} />
            <StatCard label="Credits earned" value={shown.totalCreditsEarned} />
            <StatCard label="Credits attempted" value={shown.totalCreditsAttempted} />
            <StatCard label="Active backlogs" value={shown.activeBacklogs} invertDelta />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-sunken px-4 py-2 text-sm">
            <Badge tone={shown.isCurrent ? 'success' : 'neutral'}>
              Revision {shown.revision}
              {shown.isCurrent ? ' · current' : ''}
            </Badge>
            <span className="text-muted-foreground">
              Issued {formatDateTime(shown.generatedAt)} · up to semester {shown.upToSemester}
            </span>

            {(versions.data ?? []).length > 1 ? (
              <div className="ml-auto flex flex-wrap items-center gap-1 print:hidden">
                <span className="text-xs text-muted-foreground">Revisions:</span>
                {versions.data?.map((version) => (
                  <Button
                    key={version.revision}
                    variant={shown.revision === version.revision ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setViewing(version.isCurrent && viewing === null ? null : version.revision)
                    }
                  >
                    v{version.revision}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Course codes and titles are frozen into the document, so a later rename does not
                  rewrite a transcript already issued.
                </p>
              </CardHeader>

              <CardContent>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="pb-2 pr-3 font-medium">
                          Course
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-center font-medium">
                          Sem
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-right font-medium">
                          Credits
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-right font-medium">
                          %
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-center font-medium">
                          Grade
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Points
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border">
                      {[...shown.subjects]
                        .sort((a, b) => a.semester - b.semester || a.courseCode.localeCompare(b.courseCode))
                        .map((subject) => (
                          <tr key={`${subject.courseId}-${subject.semester}-${subject.attempt}`}>
                            <td className="py-2 pr-3">
                              <span className="block font-medium">{subject.courseCode}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {subject.courseTitle}
                                {subject.attempt > 1 ? ` · attempt ${subject.attempt}` : ''}
                              </span>
                            </td>
                            <td className="tabular py-2 pr-3 text-center">{subject.semester}</td>
                            <td className="tabular py-2 pr-3 text-right">{subject.credits}</td>
                            <td className="tabular py-2 pr-3 text-right">{subject.percentage}</td>
                            <td className="py-2 pr-3 text-center">
                              <Badge tone={subject.isPass ? 'success' : 'danger'}>
                                {subject.letter}
                              </Badge>
                            </td>
                            <td className="tabular py-2 text-right">{subject.gradePoint}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Semester GPAs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  CGPA is computed from pooled credits, not by averaging these.
                </p>
              </CardHeader>

              <CardContent>
                <ul className="divide-y divide-border">
                  {shown.semesters.map((semester) => (
                    <li
                      key={semester.semester}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div>
                        <p className="font-medium">Semester {semester.semester}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {semester.creditsEarned} / {semester.creditsAttempted} credits ·{' '}
                          {semester.subjectCount} subject
                          {semester.subjectCount === 1 ? '' : 's'}
                          {semester.failedCount > 0 ? ` · ${semester.failedCount} failed` : ''}
                        </p>
                      </div>

                      <span className="tabular text-lg font-semibold">
                        {semester.gpa.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingGenerate}
        title={hasTranscript ? 'Regenerate this transcript?' : 'Generate a transcript?'}
        description={
          hasTranscript
            ? 'A new revision is created from the current published results. The existing revision is retained rather than overwritten, so a document already issued stays valid.'
            : 'Builds a frozen snapshot from every published, non-withheld result. The student record’s CGPA and backlog count are updated to match.'
        }
        confirmLabel={hasTranscript ? 'Regenerate' : 'Generate'}
        isPending={generate.isPending}
        onCancel={() => setPendingGenerate(false)}
        onConfirm={() =>
          generate.mutate(
            { studentId: params.studentId },
            {
              onSuccess: () => {
                setPendingGenerate(false);
                setViewing(null);
              },
            },
          )
        }
      />
    </RouteGuard>
  );
}
