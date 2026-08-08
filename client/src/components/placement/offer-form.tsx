'use client';

import { createPlacementSchema, type CreatePlacementInput } from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import {
  DateField,
  FormSection,
  NumberField,
  SelectField,
  TextField,
} from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import { formatCtc } from '@/lib/placement-display';

export type OfferFormValues = CreatePlacementInput;

interface Props {
  defaultValues: FormDefaults<OfferFormValues>;
  onSubmit: (values: OfferFormValues) => Promise<unknown>;
  redirectTo?: string;
  /** Shown above the form: who this offer is for, resolved by the caller. */
  candidate?: { name: string; rollNumber: string; company: string; role: string };
}

const JOB_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full time' },
  { value: 'internship', label: 'Internship' },
  { value: 'internship_ppo', label: 'Internship with PPO' },
];

/**
 * Recording an offer against an already-selected application.
 *
 * The four relations — student, application, drive and company — are carried in
 * as hidden defaults rather than pickers: the API derives an offer from one
 * specific application, and letting an officer re-pick them here would invite a
 * mismatch the server would only reject at the end.
 */
export function OfferForm({ defaultValues, onSubmit, redirectTo, candidate }: Props) {
  const router = useRouter();

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<OfferFormValues>({
    schema: createPlacementSchema as unknown as ZodType<OfferFormValues>,
    defaultValues: {
      designation: '',
      location: '',
      jobType: 'full_time',
      package: {
        currency: 'INR',
        ctc: 0,
        fixed: null,
        variable: null,
        stipendPerMonth: null,
        bondMonths: null,
      },
      isPrimaryOffer: true,
      status: 'offered',
      ...defaultValues,
    } as DefaultValues<OfferFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success('Offer recorded. The student has been notified.');
      if (redirectTo) router.push(redirectTo);
    },
  });

  const ctc = Number(form.watch('package.ctc')) || 0;

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

      {candidate ? (
        <Alert tone="info" title="Recording an offer for">
          <span className="font-medium">
            {candidate.name} ({candidate.rollNumber})
          </span>
          {' — '}
          {candidate.role} at {candidate.company}
        </Alert>
      ) : null}

      <Card className="space-y-6 p-6">
        <FormSection
          title="The role"
          description="What the company put in writing, which can differ from the posting."
        >
          <TextField
            form={form}
            name="designation"
            label="Designation"
            required
            placeholder="Software Engineer I"
          />
          <TextField form={form} name="location" label="Location" required placeholder="Bengaluru" />
          <SelectField
            form={form}
            name="jobType"
            label="Engagement"
            required
            options={JOB_TYPE_OPTIONS}
          />
          <DateField form={form} name="offerDate" label="Offer date" required />
          <DateField
            form={form}
            nullable
            name="joiningDate"
            label="Joining date"
            hint="If the letter names one."
          />
          <TextField
            form={form}
            name="academicYear"
            label="Academic year"
            required
            placeholder="2025-26"
            hint="The year this placement counts towards."
          />
        </FormSection>

        <FormSection title="Package" description="Annual figures in rupees.">
          <NumberField form={form} name="package.ctc" label="CTC" required step="1000" min={0} />
          <NumberField form={form} nullable name="package.fixed" label="Fixed" step="1000" min={0} />
          <NumberField
            form={form}
            nullable
            name="package.variable"
            label="Variable"
            step="1000"
            min={0}
          />
          <NumberField
            form={form}
            nullable
            name="package.stipendPerMonth"
            label="Stipend per month"
            step="500"
            min={0}
          />
          <NumberField
            form={form}
            nullable
            name="package.bondMonths"
            label="Bond (months)"
            step="1"
            min={0}
            max={120}
          />

          <div className="flex items-end pb-2">
            <p className="text-sm text-muted-foreground">
              Reported as <span className="font-medium text-foreground">{formatCtc(ctc)}</span>.
            </p>
          </div>
        </FormSection>

        <FormSection
          title="Standing"
          description="A student may hold several offers, but only one counts towards the placement figures."
        >
          <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              checked={Boolean(form.watch('isPrimaryOffer'))}
              onChange={(event) =>
                form.setValue('isPrimaryOffer', event.target.checked, { shouldDirty: true })
              }
            />
            <span>
              <span className="font-medium">This is the student’s primary offer</span>
              <span className="block text-xs text-muted-foreground">
                Only one primary offer per student per academic year — the server refuses a second.
              </span>
            </span>
          </label>
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          Record offer
        </Button>
      </div>
    </form>
  );
}
