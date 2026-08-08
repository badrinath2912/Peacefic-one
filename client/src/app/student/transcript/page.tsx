'use client';

import { Award, Layers, Printer, ScrollText, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { useOwnTranscript, type TranscriptSubject } from '@/api/examination-queries';
import { useOwnStudentProfile } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { formatDate } from '@/lib/utils';

export default function StudentTranscriptPage() {
  const transcript = useOwnTranscript();
  const profile = useOwnStudentProfile();

  /** Subjects grouped under the semester they were taken in. */
  const bySemester = useMemo(() => {
    const groups = new Map<number, TranscriptSubject[]>();

    for (const subject of transcript.data?.subjects ?? []) {
      const existing = groups.get(subject.semester);
      if (existing) existing.push(subject);
      else groups.set(subject.semester, [subject]);
    }

    for (const subjects of groups.values()) {
      subjects.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
    }

    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [transcript.data]);

  const gpaBySemester = useMemo(
    () => new Map((transcript.data?.semesters ?? []).map((entry) => [entry.semester, entry])),
    [transcript.data],
  );

  return (
    <RouteGuard permissions={['transcript:read_own']}>
      <div className="print:hidden">
        <PageHeader
          title="My transcript"
          description="Your academic record, as issued by your institution."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/student/results">
                  <ScrollText aria-hidden />
                  Results
                </Link>
              </Button>

              {transcript.data ? (
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer aria-hidden />
                  Print
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {transcript.isError ? (
        <ErrorState
          title="Could not load your transcript"
          message={transcript.error.message}
          requestId={transcript.error.requestId}
          onRetry={() => void transcript.refetch()}
        />
      ) : transcript.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-28 w-full rounded-lg" />
            ))}
          </div>
          <div className="skeleton h-64 w-full rounded-lg" />
        </div>
      ) : !transcript.data ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ScrollText}
              title="No transcript issued yet"
              description="Your institution issues a transcript once results have been published. Your individual results are available in the meantime."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link href="/student/results">View my results</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {profile.data?.rollNumber ?? ''}
                  {profile.data && typeof profile.data.userId === 'object'
                    ? ` · ${profile.data.userId.fullName}`
                    : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued {formatDate(transcript.data.generatedAt)} · covers semesters 1&ndash;
                  {transcript.data.upToSemester}
                </p>
              </div>

              <Badge tone="success">Revision {transcript.data.revision}</Badge>
            </CardContent>
          </Card>

          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="CGPA" value={transcript.data.cgpa.toFixed(2)} icon={Award} />
            <StatCard
              label="Credits earned"
              value={transcript.data.totalCreditsEarned}
              icon={Layers}
            />
            <StatCard
              label="Credits attempted"
              value={transcript.data.totalCreditsAttempted}
            />
            <StatCard
              label="Active backlogs"
              value={transcript.data.activeBacklogs}
              icon={TriangleAlert}
              invertDelta
            />
          </div>

          <div className="space-y-4">
            {bySemester.map(([semester, subjects]) => {
              const gpa = gpaBySemester.get(semester);

              return (
                <Card key={semester} className="break-inside-avoid">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Semester {semester}</CardTitle>
                      {gpa ? (
                        <p className="tabular text-sm text-muted-foreground">
                          {gpa.creditsEarned} / {gpa.creditsAttempted} credits ·{' '}
                          {gpa.subjectCount} subject{gpa.subjectCount === 1 ? '' : 's'}
                          {gpa.failedCount > 0 ? ` · ${gpa.failedCount} failed` : ''}
                        </p>
                      ) : null}
                    </div>

                    {gpa ? (
                      <div className="text-right">
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                          SGPA
                        </p>
                        <p className="tabular text-xl font-semibold">{gpa.gpa.toFixed(2)}</p>
                      </div>
                    ) : null}
                  </CardHeader>

                  <CardContent>
                    <div className="scrollbar-thin overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-sm">
                        <caption className="sr-only">
                          Subjects and grades for semester {semester}
                        </caption>

                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th scope="col" className="pb-2 pr-3 font-medium">
                              Course
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
                          {subjects.map((subject) => (
                            <tr key={`${subject.courseId}-${subject.attempt}`}>
                              <th scope="row" className="py-2 pr-3 text-left font-normal">
                                <span className="block font-medium">{subject.courseCode}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {subject.courseTitle}
                                  {subject.attempt > 1 ? ` · attempt ${subject.attempt}` : ''}
                                </span>
                              </th>
                              <td className="tabular py-2 pr-3 text-right">{subject.credits}</td>
                              <td className="tabular py-2 pr-3 text-right">
                                {subject.percentage}
                              </td>
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
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground print:mt-8">
            This transcript is a snapshot taken on {formatDate(transcript.data.generatedAt)}. If a
            result has been corrected since, your institution will issue a new revision.
          </p>
        </>
      )}
    </RouteGuard>
  );
}
