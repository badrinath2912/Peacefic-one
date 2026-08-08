'use client';

import { Award, GraduationCap, Layers, ScrollText, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useOwnResults, type OwnResult } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { ResultCard, WithheldResultCard } from '@/components/student/result-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';

export default function StudentResultsPage() {
  const results = useOwnResults();
  const [semester, setSemester] = useState('');

  const semesters = useMemo(
    () =>
      [...new Set((results.data?.results ?? []).map((entry) => entry.semester))].sort(
        (a, b) => a - b,
      ),
    [results.data],
  );

  const visible = useMemo(() => {
    const rows = results.data?.results ?? [];
    if (!semester) return rows;
    return rows.filter((entry) => entry.semester === Number(semester));
  }, [results.data, semester]);

  const withheld = results.data?.withheld ?? [];

  const columns: Column<OwnResult>[] = [
    {
      key: 'course',
      header: 'Course',
      render: (entry) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{entry.courseTitle ?? entry.examTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.courseCode ?? entry.examCode}
            {entry.isRepeat ? ` · attempt ${entry.attempt}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'examTitle',
      header: 'Examination',
      render: (entry) => (
        <span className="truncate text-muted-foreground">{entry.examTitle}</span>
      ),
    },
    {
      key: 'semester',
      header: 'Sem',
      align: 'center',
      render: (entry) => <span className="tabular">{entry.semester}</span>,
    },
    {
      key: 'credits',
      header: 'Credits',
      align: 'right',
      render: (entry) => <span className="tabular">{entry.credits}</span>,
    },
    {
      key: 'marks',
      header: 'Marks',
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
  ];

  return (
    <RouteGuard permissions={['result:read_own']}>
      <PageHeader
        title="My results"
        description="Every result your institution has published to you."
        actions={
          <Button variant="outline" asChild>
            <Link href="/student/transcript">
              <ScrollText aria-hidden />
              Transcript
            </Link>
          </Button>
        }
      />

      {results.isError ? (
        <ErrorState
          title="Could not load your results"
          message={results.error.message}
          requestId={results.error.requestId}
          onRetry={() => void results.refetch()}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="CGPA"
              value={results.data ? results.data.summary.cgpa.toFixed(2) : undefined}
              icon={Award}
              isLoading={results.isLoading}
            />
            <StatCard
              label="Credits earned"
              value={results.data?.summary.totalCreditsEarned}
              icon={Layers}
              isLoading={results.isLoading}
            />
            <StatCard
              label="Subjects passed"
              value={
                results.data
                  ? results.data.results.filter((entry) => entry.isPass).length
                  : undefined
              }
              icon={GraduationCap}
              isLoading={results.isLoading}
            />
            <StatCard
              label="Active backlogs"
              value={results.data?.summary.activeBacklogs}
              icon={TriangleAlert}
              isLoading={results.isLoading}
              invertDelta
            />
          </div>

          {withheld.length > 0 ? (
            <section className="mb-4 space-y-3" aria-labelledby="withheld-heading">
              <h2 id="withheld-heading" className="text-sm font-semibold">
                Held by the examination office
              </h2>

              {withheld.map((entry) => (
                <WithheldResultCard key={`${entry.examId}-${entry.attempt}`} result={entry} />
              ))}
            </section>
          ) : null}

          {results.data && results.data.summary.semesters.length > 0 ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Semester performance</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Your SGPA for each semester. The CGPA above is computed across all credits, not
                  by averaging these.
                </p>
              </CardHeader>

              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.data.summary.semesters.map((entry) => (
                    <li
                      key={entry.semester}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">Semester {entry.semester}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {entry.creditsEarned} / {entry.creditsAttempted} credits
                          {entry.failedCount > 0 ? ` · ${entry.failedCount} failed` : ''}
                        </p>
                      </div>

                      <span className="tabular text-lg font-semibold">
                        {entry.gpa.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {semesters.length > 1 ? (
            <Card className="mb-4 p-4">
              <Select
                placeholder="All semesters"
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
                aria-label="Filter by semester"
                className="sm:max-w-56"
                options={semesters.map((value) => ({
                  value: String(value),
                  label: `Semester ${value}`,
                }))}
              />
            </Card>
          ) : null}

          {/* The table is the desktop view; cards carry the same figures on
              narrow screens, where nine columns would be unreadable. */}
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(entry) => entry.id}
              isLoading={results.isLoading}
              isFetching={results.isFetching}
              emptyTitle={
                semester ? 'Nothing published for that semester' : 'No results published yet'
              }
              emptyDescription={
                semester
                  ? 'Choose another semester, or clear the filter.'
                  : 'Results appear here as soon as your institution releases them. You will be notified.'
              }
              emptyAction={
                semester ? (
                  <Button variant="outline" size="sm" onClick={() => setSemester('')}>
                    Show all semesters
                  </Button>
                ) : undefined
              }
            />
          </div>

          <div className="space-y-3 lg:hidden">
            {results.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="skeleton h-32 w-full rounded-lg" />
              ))
            ) : visible.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={Award}
                    title={
                      semester ? 'Nothing published for that semester' : 'No results published yet'
                    }
                    description={
                      semester
                        ? 'Choose another semester, or clear the filter.'
                        : 'Results appear here as soon as your institution releases them. You will be notified.'
                    }
                    action={
                      semester ? (
                        <Button variant="outline" size="sm" onClick={() => setSemester('')}>
                          Show all semesters
                        </Button>
                      ) : undefined
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              visible.map((entry) => <ResultCard key={entry.id} result={entry} />)
            )}
          </div>
        </>
      )}
    </RouteGuard>
  );
}
