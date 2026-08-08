'use client';

import { Lock } from 'lucide-react';

import type { OwnResult, WithheldResult } from '@/api/examination-queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One result, as a card.
 *
 * The card is the mobile and tablet form; the table on the results page is the
 * desktop one. Both read the same fields, so a student sees the same figures
 * whichever they are looking at.
 */
export function ResultCard({ result }: { result: OwnResult }) {
  const components: Array<{ label: string; value: number | null }> = [
    { label: 'Theory', value: result.theory },
    { label: 'Practical', value: result.practical },
    { label: 'Internal', value: result.internal },
  ];

  const present = components.filter((component) => component.value !== null);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{result.courseTitle ?? result.examTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {result.courseCode ?? result.examCode} · Semester {result.semester} ·{' '}
              {result.credits} credit{result.credits === 1 ? '' : 's'}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <Badge tone={result.isPass ? 'success' : 'danger'}>{result.letter || '—'}</Badge>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              {result.gradePoint} points
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-3">
          <p className="tabular text-2xl font-semibold">
            {result.finalTotal}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / {result.maxTotal}
            </span>
          </p>
          <p className="tabular text-sm text-muted-foreground">{result.percentage}%</p>

          {result.isAbsent ? <Badge tone="danger">Absent</Badge> : null}
          {result.isRepeat ? <Badge tone="warning">Attempt {result.attempt}</Badge> : null}
        </div>

        {present.length > 0 ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {present.map((component) => (
              <div key={component.label} className="flex gap-1.5">
                <dt className="text-muted-foreground">{component.label}</dt>
                <dd className="tabular font-medium">{component.value}</dd>
              </div>
            ))}

            {result.graceMarks > 0 ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Grace</dt>
                <dd className="tabular font-medium text-warning">+{result.graceMarks}</dd>
              </div>
            ) : null}

            {result.attendanceBonus > 0 ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Attendance bonus</dt>
                <dd className="tabular font-medium text-success">+{result.attendanceBonus}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * A result the examination office is holding back.
 *
 * Shown so a student knows a result exists and who to ask, rather than being
 * left to wonder whether their paper was lost. No mark, grade or percentage is
 * present — the server does not send them.
 */
export function WithheldResultCard({ result }: { result: WithheldResult }) {
  return (
    <Card className={cn('border-warning/40 bg-warning-subtle')}>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
          <Lock className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{result.courseTitle ?? result.examTitle}</p>
            <Badge tone="warning">Withheld</Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            {result.courseCode ?? result.examCode} · Semester {result.semester} ·{' '}
            {result.credits} credit{result.credits === 1 ? '' : 's'}
            {result.attempt > 1 ? ` · attempt ${result.attempt}` : ''}
          </p>

          <p className="text-sm">
            Your result for this paper is being held by the examination office. It is not counted
            in your CGPA. Contact the office to find out why.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
