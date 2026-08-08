'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useTrainingCalendar, type CalendarEntry } from '@/api/training-queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { can } from '@/lib/permissions';
import { cn, formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first grid covering the whole month, padded to complete weeks. */
function buildGrid(month: Date): Date[] {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));

  // getUTCDay() is Sunday-based; shift so Monday is 0.
  const leading = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - leading);

  const trailing = 6 - ((last.getUTCDay() + 6) % 7);
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + trailing);

  const days: Date[] = [];
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(new Date(day));
  }

  return days;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** True when the session's date span covers this day. */
function coversDay(entry: CalendarEntry, day: Date): boolean {
  const dayKey = day.toISOString().slice(0, 10);
  return entry.startDate.slice(0, 10) <= dayKey && entry.endDate.slice(0, 10) >= dayKey;
}

const TYPE_COLOURS: Record<string, string> = {
  technical: 'bg-primary-subtle text-primary',
  aptitude: 'bg-info-subtle text-info',
  soft_skills: 'bg-success-subtle text-success',
  placement_prep: 'bg-warning-subtle text-warning',
  certification: 'bg-accent text-accent-foreground',
  workshop: 'bg-muted text-muted-foreground',
};

export default function TrainingCalendarPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const grid = useMemo(() => buildGrid(month), [month]);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;

  const calendar = useTrainingCalendar(from, to);
  const today = new Date();

  const monthLabel = month.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function shiftMonth(delta: number): void {
    setMonth(
      (current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)),
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Training', href: '/college/training' }, { label: 'Calendar' }]} />

      <PageHeader
        title="Training calendar"
        description="Sessions spanning each day, not just those starting on it."
        actions={
          can(user?.permissions, 'training:assign_trainer') ? (
            <Button asChild>
              <Link href="/college/training/sessions/new">
                <Plus aria-hidden />
                New session
              </Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{monthLabel}</h2>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)))
                }
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>

          {calendar.isError ? (
            <ErrorState
              message={calendar.error.message}
              onRetry={() => void calendar.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[42rem]">
                <div className="grid grid-cols-7 gap-px border-b border-border pb-2">
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      className="text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px bg-border">
                  {grid.map((day) => {
                    const inMonth = day.getUTCMonth() === month.getUTCMonth();
                    const isToday = sameDay(day, today);
                    const entries = (calendar.data ?? []).filter((entry) => coversDay(entry, day));

                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'min-h-24 bg-surface p-1.5',
                          !inMonth && 'bg-surface-sunken',
                        )}
                      >
                        <span
                          className={cn(
                            'tabular inline-flex size-6 items-center justify-center rounded-full text-xs',
                            isToday && 'bg-primary font-semibold text-primary-foreground',
                            !inMonth && 'text-muted-foreground',
                          )}
                        >
                          {day.getUTCDate()}
                        </span>

                        <div className="mt-1 space-y-1">
                          {entries.slice(0, 3).map((entry) => (
                            <Link
                              key={entry.id}
                              href={`/college/training/sessions/${entry.id}`}
                              title={`${entry.title} · ${entry.enrolledCount}/${entry.capacity} enrolled`}
                              className={cn(
                                'block truncate rounded px-1.5 py-0.5 text-2xs font-medium hover:underline',
                                TYPE_COLOURS[entry.trainingType] ?? 'bg-muted text-muted-foreground',
                              )}
                            >
                              {entry.title}
                            </Link>
                          ))}

                          {entries.length > 3 ? (
                            <span className="block px-1.5 text-2xs text-muted-foreground">
                              +{entries.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">This month</h3>

          {calendar.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="skeleton h-12" />
              ))}
            </div>
          ) : calendar.data && calendar.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {calendar.data.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/college/training/sessions/${entry.id}`}
                      className="truncate text-sm font-medium text-primary hover:underline"
                    >
                      {entry.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(entry.startDate)} – {formatDate(entry.endDate)} ·{' '}
                      {toTitleCase(entry.trainingType)}
                      {entry.trainers.length > 0 ? ` · ${entry.trainers.join(', ')}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-xs text-muted-foreground">
                      {entry.enrolledCount} / {entry.capacity}
                    </span>
                    <StatusBadge status={entry.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No sessions this month"
              description="Move to another month, or schedule a session."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
