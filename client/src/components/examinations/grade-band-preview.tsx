'use client';

import {
  calculateGrade,
  type GradeBandInput,
  type GradePolicyInput,
} from '@peacefic/shared';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** The percentages worth checking against any scale: every band edge. */
function boundaryProbes(bands: GradeBandInput[]): number[] {
  const points = new Set<number>([0, 100]);
  for (const band of bands) {
    points.add(band.minPercent);
    points.add(band.maxPercent);
  }
  return [...points].sort((a, b) => a - b);
}

interface Props {
  bands: GradeBandInput[];
  policy: GradePolicyInput;
}

/**
 * A live preview of what the scale will actually do.
 *
 * Every number shown comes from `calculateGrade` in `@peacefic/shared` — the
 * same pure function the server calls when it grades a real mark. That is why
 * the engine has no database or request dependency: the preview cannot drift
 * from the server, because there is only one implementation.
 */
export function GradeBandPreview({ bands, policy }: Props) {
  const [obtained, setObtained] = useState(72);
  const [maximum, setMaximum] = useState(100);
  const [grace, setGrace] = useState(0);
  const [attendance, setAttendance] = useState(85);

  const usable = bands.filter(
    (band) =>
      band.letter &&
      Number.isFinite(band.minPercent) &&
      Number.isFinite(band.maxPercent) &&
      Number.isFinite(band.gradePoint),
  );

  if (usable.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add at least one band to see how this scale will grade.
          </p>
        </CardContent>
      </Card>
    );
  }

  const safeMaximum = maximum > 0 ? maximum : 100;

  const graded = calculateGrade(
    {
      // The engine takes three components; a single-figure preview is entirely
      // theory, which sums identically.
      obtained: { theory: obtained, practical: 0, internal: 0 },
      maximum: { theory: safeMaximum, practical: 0, internal: 0 },
      graceMarks: grace,
      attendancePercent: attendance,
    },
    usable,
    policy,
  );

  const probes = boundaryProbes(usable);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <p className="text-sm text-muted-foreground">
          Computed by the same grade engine the server uses, so what you see here is what students
          will get.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Marks obtained">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={obtained}
                onChange={(event) => setObtained(Number(event.target.value))}
              />
            )}
          </Field>

          <Field label="Out of">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={maximum}
                onChange={(event) => setMaximum(Number(event.target.value))}
              />
            )}
          </Field>

          <Field label="Grace" hint={`Policy caps at ${policy.maxGraceMarks}.`}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={grace}
                onChange={(event) => setGrace(Number(event.target.value))}
              />
            )}
          </Field>

          <Field
            label="Attendance %"
            hint={
              policy.attendanceBonusEnabled
                ? `Bonus at ${policy.attendanceBonusThreshold}%.`
                : 'Bonus is off.'
            }
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={attendance}
                onChange={(event) => setAttendance(Number(event.target.value))}
              />
            )}
          </Field>
        </div>

        {/* `role="status"` carries an implicit polite live region, and the
            label means a screen reader announces what is being recomputed. */}
        <div
          role="status"
          aria-label="Computed grade"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-surface-sunken px-4 py-3"
        >
          <div>
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Grade
            </p>
            <p className="text-2xl font-semibold leading-tight">{graded.letter}</p>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Final</dt>
              <dd className="tabular font-medium">
                {graded.finalTotal} / {graded.maxTotal}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Percentage</dt>
              <dd className="tabular font-medium">{graded.percentage}%</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                Grade point
              </dt>
              <dd className="tabular font-medium">{graded.gradePoint}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Bonus</dt>
              <dd className="tabular font-medium">+{graded.attendanceBonus}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                Grace applied
              </dt>
              <dd className="tabular font-medium">+{graded.graceApplied}</dd>
            </div>
          </dl>

          <Badge tone={graded.isPass ? 'success' : 'danger'} className="ml-auto">
            {graded.isPass ? 'Pass' : 'Fail'}
          </Badge>
        </div>

        {graded.wasCapped ? (
          <p className="text-xs text-warning">
            The cap discarded part of the bonus or grace — neither can take a student past the
            maximum.
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Every band edge, graded end to end
          </p>

          <div className="flex flex-wrap gap-1.5">
            {probes.map((percent) => {
              const probe = calculateGrade(
                {
                  obtained: { theory: percent, practical: 0, internal: 0 },
                  maximum: { theory: 100, practical: 0, internal: 0 },
                },
                usable,
                policy,
              );

              return (
                <span
                  key={percent}
                  className={cn(
                    'tabular rounded-md border px-2 py-1 text-xs',
                    probe.isPass
                      ? 'border-success/30 bg-success-subtle text-success'
                      : 'border-danger/30 bg-danger-subtle text-danger',
                  )}
                  title={`${percent}% grades as ${probe.letter} (${probe.gradePoint} points)`}
                >
                  {percent}% → <strong>{probe.letter}</strong>
                </span>
              );
            })}
          </div>

          <p className="text-2xs text-muted-foreground">
            A band decides the letter; the policy&rsquo;s pass mark of {policy.passingPercent}%
            decides pass or fail. They can disagree, and the pass mark wins.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
