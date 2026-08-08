'use client';

import { createJobPostingSchema, type CreateJobPostingInput } from '@peacefic/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, type DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useCompanies } from '@/api/placement-queries';
import { useBatches, useDepartments } from '@/api/queries';
import {
  CommaListField,
  DateField,
  FormSection,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-field';
import { EligibilityBuilder } from '@/components/placement/eligibility-builder';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import {
  JOB_TYPE_OPTIONS,
  ROUND_MODE_OPTIONS,
  SELECTION_ROUND_TYPE_OPTIONS,
  WORK_MODE_OPTIONS,
  formatCtcRange,
} from '@/lib/placement-display';

export type JobFormValues = CreateJobPostingInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<JobFormValues>;
  onSubmit: (values: JobFormValues) => Promise<unknown>;
  redirectTo?: string;
  /** The company cannot move once a posting exists — the API has no such field. */
  lockCompany?: boolean;
  eligibilityLocked?: boolean;
  eligibilityLockedReason?: string;
}

const EMPTY_ELIGIBILITY = {
  departmentIds: [],
  batchIds: [],
  graduationYears: [],
  minCgpa: null,
  maxActiveBacklogs: null,
  maxTotalBacklogs: null,
  minTenthPercent: null,
  minTwelfthPercent: null,
  minDiplomaPercent: null,
  minAttendancePercent: null,
  maxYearGap: null,
  genderRestriction: 'any' as const,
  requiredSkills: [],
  qualifications: [],
  allowPlacedStudents: false,
  customCriteria: '',
};

/** A shape most drives share, so a new posting starts somewhere sensible. */
const DEFAULT_ROUNDS = [
  { order: 1, name: 'Aptitude test', type: 'aptitude' as const, mode: 'online' as const, durationMinutes: 60, description: '' },
  { order: 2, name: 'Technical interview', type: 'technical_interview' as const, mode: 'online' as const, durationMinutes: 45, description: '' },
  { order: 3, name: 'HR interview', type: 'hr_interview' as const, mode: 'online' as const, durationMinutes: 30, description: '' },
];

export function JobForm({
  mode,
  defaultValues,
  onSubmit,
  redirectTo = '/college/placements/jobs',
  lockCompany = false,
  eligibilityLocked = false,
  eligibilityLockedReason,
}: Props) {
  const router = useRouter();

  const companies = useCompanies({ limit: 200, status: 'active', sort: 'name' });
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 200, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<JobFormValues>({
    schema: createJobPostingSchema as unknown as ZodType<JobFormValues>,
    defaultValues: {
      companyId: '',
      title: '',
      description: '',
      jobType: 'full_time',
      workMode: 'onsite',
      locations: [],
      openings: 1,
      compensation: {
        currency: 'INR',
        ctcMin: 0,
        ctcMax: 0,
        fixedComponent: null,
        variableComponent: null,
        stipendPerMonth: null,
        bondMonths: null,
        bondAmount: null,
      },
      eligibility: EMPTY_ELIGIBILITY,
      selectionRounds: DEFAULT_ROUNDS,
      attachments: [],
      status: 'draft',
      ...defaultValues,
    } as DefaultValues<JobFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Posting saved as a draft.' : 'Changes saved.');
      router.push(redirectTo);
    },
  });

  const rounds = useFieldArray({ control: form.control, name: 'selectionRounds' as never });

  const roundsError = form.formState.errors.selectionRounds;
  const roundsMessage =
    roundsError && 'message' in roundsError ? (roundsError.message as string | undefined) : undefined;

  /**
   * `order` is the backend's own field and the schema insists it runs 1..n
   * without gaps, so moving a round rewrites the whole column rather than
   * swapping two numbers and hoping.
   */
  function renumber(): void {
    const current = (form.getValues('selectionRounds') ?? []) as JobFormValues['selectionRounds'];
    current.forEach((_, index) => {
      form.setValue(`selectionRounds.${index}.order` as never, (index + 1) as never, {
        shouldDirty: true,
      });
    });
  }

  function move(from: number, to: number): void {
    if (to < 0 || to >= rounds.fields.length) return;
    rounds.move(from, to);
    renumber();
  }

  function removeRound(index: number): void {
    rounds.remove(index);
    renumber();
  }

  const ctcMin = Number(form.watch('compensation.ctcMin')) || 0;
  const ctcMax = Number(form.watch('compensation.ctcMax')) || 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert tone="danger" title="Could not save">
          {formError}
          {requestId ? (
            <span className="mt-1 block font-mono text-2xs opacity-70">Reference: {requestId}</span>
          ) : null}
        </Alert>
      ) : null}

      <Card className="space-y-6 p-6">
        <FormSection
          title="Role"
          description="A posting is created as a draft. Nothing reaches students until it is published."
        >
          <SelectField
            form={form}
            name="companyId"
            label="Company"
            required
            disabled={lockCompany}
            placeholder={companies.isLoading ? 'Loading companies…' : 'Choose a company'}
            hint={
              lockCompany
                ? 'A posting cannot be moved to another company.'
                : 'Only active companies can be recruited for.'
            }
            options={(companies.data?.items ?? []).map((company) => ({
              value: company.id,
              label: company.name,
            }))}
          />

          <TextField
            form={form}
            name="title"
            label="Job title"
            required
            placeholder="Software Engineer"
            className="sm:col-span-2"
          />

          <SelectField
            form={form}
            name="jobType"
            label="Engagement"
            required
            options={JOB_TYPE_OPTIONS}
          />

          <SelectField
            form={form}
            name="workMode"
            label="Work mode"
            required
            options={WORK_MODE_OPTIONS}
          />

          <NumberField
            form={form}
            name="openings"
            label="Openings"
            required
            step="1"
            min={1}
            max={10000}
          />

          <CommaListField
            form={form}
            name="locations"
            label="Locations"
            required
            placeholder="Bengaluru, Hyderabad"
            hint="Separate with commas. At least one is required."
            className="sm:col-span-2"
          />

          <TextAreaField
            form={form}
            name="description"
            label="Description"
            required
            rows={6}
            maxLength={20000}
            placeholder="What the role involves, the team, and what the company is looking for."
            hint="Shown to every eligible student. At least 20 characters."
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>

        <FormSection
          title="Dates"
          description="Publishing is refused once the closing date has passed."
        >
          <DateField form={form} name="applicationOpenAt" label="Applications open" required />
          <DateField
            form={form}
            name="applicationCloseAt"
            label="Applications close"
            required
            hint="Must be after the opening date."
          />
          <DateField
            form={form}
            nullable
            name="driveDate"
            label="Drive date"
            hint="When the company visits, if it is known."
          />
        </FormSection>

        <FormSection
          title="Compensation"
          description="Annual figures in rupees. Enter 1800000 for ₹18 L — the list formats it."
        >
          <NumberField
            form={form}
            name="compensation.ctcMin"
            label="Minimum CTC"
            required
            step="1000"
            min={0}
          />
          <NumberField
            form={form}
            name="compensation.ctcMax"
            label="Maximum CTC"
            required
            step="1000"
            min={0}
            hint="At least the minimum. Repeat the minimum for a fixed package."
          />
          <NumberField
            form={form}
            nullable
            name="compensation.fixedComponent"
            label="Fixed component"
            step="1000"
            min={0}
          />
          <NumberField
            form={form}
            nullable
            name="compensation.variableComponent"
            label="Variable component"
            step="1000"
            min={0}
          />
          <NumberField
            form={form}
            nullable
            name="compensation.stipendPerMonth"
            label="Stipend per month"
            step="500"
            min={0}
            hint="Internships and PPO roles."
          />
          <NumberField
            form={form}
            nullable
            name="compensation.bondMonths"
            label="Bond (months)"
            step="1"
            min={0}
            max={120}
          />
          <NumberField
            form={form}
            nullable
            name="compensation.bondAmount"
            label="Bond amount"
            step="1000"
            min={0}
          />

          <div className="flex items-end pb-2 sm:col-span-2 lg:col-span-3">
            <p className="text-sm text-muted-foreground">
              Students will see{' '}
              <span className="font-medium text-foreground">{formatCtcRange(ctcMin, ctcMax)}</span>.
            </p>
          </div>
        </FormSection>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Selection rounds</CardTitle>
            <p className="text-sm text-muted-foreground">
              The stages a candidate goes through, in order. At least one is required.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              rounds.append({
                order: rounds.fields.length + 1,
                name: '',
                type: 'other',
                mode: 'online',
                durationMinutes: null,
                description: '',
              } as never);
            }}
          >
            <Plus aria-hidden />
            Add round
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {roundsMessage ? (
            <Alert tone="danger" title="Fix the rounds">
              {roundsMessage}
            </Alert>
          ) : null}

          {rounds.fields.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No rounds yet. Add the first stage of the process.
            </p>
          ) : (
            rounds.fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-border p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Round {index + 1}</span>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Move round ${index + 1} earlier`}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === rounds.fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Move round ${index + 1} later`}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRound(index)}
                      aria-label={`Remove round ${index + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField
                    form={form}
                    name={`selectionRounds.${index}.name` as never}
                    label="Name"
                    required
                    placeholder="Technical interview"
                  />
                  <SelectField
                    form={form}
                    name={`selectionRounds.${index}.type` as never}
                    label="Type"
                    required
                    options={SELECTION_ROUND_TYPE_OPTIONS}
                  />
                  <SelectField
                    form={form}
                    name={`selectionRounds.${index}.mode` as never}
                    label="Mode"
                    required
                    options={ROUND_MODE_OPTIONS}
                  />
                  <NumberField
                    form={form}
                    nullable
                    name={`selectionRounds.${index}.durationMinutes` as never}
                    label="Duration (minutes)"
                    step="5"
                    min={1}
                    max={600}
                  />
                  <TextAreaField
                    form={form}
                    name={`selectionRounds.${index}.description` as never}
                    label="Notes for students"
                    rows={2}
                    maxLength={1000}
                    placeholder="Two coding questions, one hour, camera on."
                    className="sm:col-span-2 lg:col-span-4"
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EligibilityBuilder
        form={form}
        locked={eligibilityLocked}
        lockedReason={eligibilityLockedReason}
        departments={(departments.data?.items ?? []).map((department) => ({
          value: department.id,
          label: department.name,
        }))}
        batches={(batches.data?.items ?? []).map((batch) => ({
          value: batch.id,
          label: `${batch.code} — ${batch.name}`,
        }))}
      />

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Save draft' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
