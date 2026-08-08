'use client';

import { Info } from 'lucide-react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import {
  CommaListField,
  NumberField,
  SelectField,
  TextAreaField,
} from '@/components/form/form-field';
import { MultiSelectField } from '@/components/form/multi-select-field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GENDER_RESTRICTION_OPTIONS } from '@/lib/placement-display';

interface Option {
  value: string;
  label: string;
}

interface Props<T extends FieldValues> {
  form: UseFormReturn<T>;
  departments: Option[];
  batches: Option[];
  /** Set once students have applied — the server refuses the change anyway. */
  locked?: boolean;
  lockedReason?: string;
}

/**
 * The eligibility block of a job posting.
 *
 * Sixteen criteria, every one opt-in: a blank field means "do not filter on
 * this", which is why nothing here has a default beyond the two the schema
 * sets. The rules are *evaluated* by the shared eligibility engine on the
 * server — this component only collects them, and deliberately holds no copy
 * of the matching logic.
 */
export function EligibilityBuilder<T extends FieldValues>({
  form,
  departments,
  batches,
  locked = false,
  lockedReason,
}: Props<T>) {
  const path = (field: string) => `eligibility.${field}` as Path<T>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who can apply</CardTitle>
        <p className="text-sm text-muted-foreground">
          Leave anything blank to not filter on it. A posting with nothing set here is open to the
          whole college.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {locked ? (
          <Alert tone="warning" title="Eligibility is fixed">
            {lockedReason ??
              'Students have already applied, so the terms they applied under can no longer change.'}
          </Alert>
        ) : null}

        <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
          <section className="space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Cohort</h3>
              <p className="text-xs text-muted-foreground">
                Which students the drive is aimed at. Batches narrow departments further.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MultiSelectField
                form={form}
                name={path('departmentIds')}
                label="Departments"
                emptyLabel="All departments"
                options={departments}
              />
              <MultiSelectField
                form={form}
                name={path('batchIds')}
                label="Batches"
                emptyLabel="All batches"
                options={batches}
              />
              <CommaListField
                form={form}
                numeric
                name={path('graduationYears')}
                label="Graduating years"
                placeholder="2026, 2027"
                hint="Separate with commas. Blank accepts any year."
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Academic record</h3>
              <p className="text-xs text-muted-foreground">
                A student with no figure recorded fails the criterion rather than passing it — an
                unknown CGPA is not treated as a zero, but it is not treated as a pass either.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                form={form}
                nullable
                name={path('minCgpa')}
                label="Minimum CGPA"
                step="0.01"
                min={0}
                max={10}
                placeholder="7.0"
                hint="Out of 10."
              />
              <NumberField
                form={form}
                nullable
                name={path('minTenthPercent')}
                label="Minimum Class X %"
                step="0.01"
                min={0}
                max={100}
                placeholder="60"
              />
              <NumberField
                form={form}
                nullable
                name={path('minTwelfthPercent')}
                label="Minimum Class XII %"
                step="0.01"
                min={0}
                max={100}
                placeholder="60"
              />
              <NumberField
                form={form}
                nullable
                name={path('minDiplomaPercent')}
                label="Minimum diploma %"
                step="0.01"
                min={0}
                max={100}
                placeholder="60"
                hint="Only checked for lateral-entry students."
              />
              <CommaListField
                form={form}
                name={path('qualifications')}
                label="Accepted qualifications"
                placeholder="B.E., B.Tech, M.Tech"
                hint="Matched against the degree on the student record."
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Backlogs, attendance and gaps</h3>
              <p className="text-xs text-muted-foreground">
                The conditions companies most often set alongside a CGPA cut-off.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                form={form}
                nullable
                name={path('maxActiveBacklogs')}
                label="Maximum active backlogs"
                step="1"
                min={0}
                max={50}
                placeholder="0"
                hint="Enter 0 to require a clear record right now."
              />
              <NumberField
                form={form}
                nullable
                name={path('maxTotalBacklogs')}
                label="Maximum backlogs ever"
                step="1"
                min={0}
                max={50}
                placeholder="2"
                hint="Counts cleared ones too."
              />
              <NumberField
                form={form}
                nullable
                name={path('minAttendancePercent')}
                label="Minimum attendance %"
                step="0.01"
                min={0}
                max={100}
                placeholder="75"
              />
              <NumberField
                form={form}
                nullable
                name={path('maxYearGap')}
                label="Maximum year gap"
                step="1"
                min={0}
                max={20}
                placeholder="1"
                hint="Years out of formal education before or during the course."
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Skills and other conditions</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CommaListField
                form={form}
                name={path('requiredSkills')}
                label="Required skills"
                placeholder="Java, SQL, React"
                hint="A student must hold every one of these."
              />
              <SelectField
                form={form}
                name={path('genderRestriction')}
                label="Gender"
                options={GENDER_RESTRICTION_OPTIONS}
                hint="Only set this where the company has a diversity drive."
              />

              <label className="flex items-start gap-2.5 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  checked={Boolean(form.watch(path('allowPlacedStudents')))}
                  onChange={(event) =>
                    form.setValue(path('allowPlacedStudents'), event.target.checked as never, {
                      shouldDirty: true,
                    })
                  }
                />
                <span>
                  <span className="font-medium">Open to already-placed students</span>
                  <span className="block text-xs text-muted-foreground">
                    Off by default, so a placed student is excluded unless this drive allows them.
                  </span>
                </span>
              </label>

              <TextAreaField
                form={form}
                name={path('customCriteria')}
                label="Conditions in the company's words"
                rows={3}
                maxLength={2000}
                placeholder="Must hold a valid passport. Willing to relocate at short notice."
                className="sm:col-span-2 lg:col-span-3"
              />
            </div>

            <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Conditions written here are shown to students but are never checked automatically —
                nothing above can be inferred from them. Anything that must gate an application
                belongs in one of the fields above.
              </span>
            </p>
          </section>
        </fieldset>
      </CardContent>
    </Card>
  );
}
