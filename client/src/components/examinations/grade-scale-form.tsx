'use client';

import {
  createGradeScaleSchema,
  REPEAT_POLICY,
  type CreateGradeScaleInput,
  type GradeBandInput,
  type GradePolicyInput,
} from '@peacefic/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { useFieldArray, type DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { GradeBandPreview } from '@/components/examinations/grade-band-preview';
import { FormSection, NumberField, SelectField, TextAreaField, TextField } from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import { cn, toTitleCase } from '@/lib/utils';

export type GradeScaleFormValues = CreateGradeScaleInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<GradeScaleFormValues>;
  onSubmit: (values: GradeScaleFormValues) => Promise<unknown>;
  /** Set once the scale has graded a published result — bands become fixed. */
  bandsLocked?: boolean;
}

/** A sensible ten-point starting point; every value stays editable. */
const STARTER_BANDS: GradeBandInput[] = [
  { letter: 'O', minPercent: 90, maxPercent: 100, gradePoint: 10, isPass: true, description: 'Outstanding' },
  { letter: 'A+', minPercent: 80, maxPercent: 89.99, gradePoint: 9, isPass: true, description: 'Excellent' },
  { letter: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 8, isPass: true, description: 'Very good' },
  { letter: 'B', minPercent: 60, maxPercent: 69.99, gradePoint: 7, isPass: true, description: 'Good' },
  { letter: 'C', minPercent: 50, maxPercent: 59.99, gradePoint: 6, isPass: true, description: 'Average' },
  { letter: 'P', minPercent: 40, maxPercent: 49.99, gradePoint: 5, isPass: true, description: 'Pass' },
  { letter: 'F', minPercent: 0, maxPercent: 39.99, gradePoint: 0, isPass: false, description: 'Fail' },
];

const DEFAULT_POLICY: GradePolicyInput = {
  passingPercent: 40,
  maxGraceMarks: 0,
  maxGracePerSemester: 0,
  attendanceBonusEnabled: false,
  attendanceBonusThreshold: 90,
  attendanceBonusMarks: 0,
  repeatPolicy: 'best_attempt',
  countFailedCredits: true,
  gpaDecimalPlaces: 2,
};

export function GradeScaleForm({ mode, defaultValues, onSubmit, bandsLocked = false }: Props) {
  const router = useRouter();

  const { form, formError, requestId, handleSubmit, isSubmitting } =
    useApiForm<GradeScaleFormValues>({
      schema: createGradeScaleSchema as unknown as ZodType<GradeScaleFormValues>,
      defaultValues: {
        name: '',
        code: '',
        description: '',
        bands: STARTER_BANDS,
        policy: DEFAULT_POLICY,
        isDefault: false,
        status: 'active',
        ...defaultValues,
      } as DefaultValues<GradeScaleFormValues>,
      onSubmit,
      onSuccess: () => {
        toast.success(mode === 'create' ? 'Grade scale created.' : 'Changes saved.');
        router.push('/college/examinations/grade-scales');
      },
    });

  const bandArray = useFieldArray({ control: form.control, name: 'bands' as never });

  // Watched rather than read once, so the preview updates as values are typed.
  const bands = (form.watch('bands') ?? []) as GradeBandInput[];
  const policy = (form.watch('policy') ?? DEFAULT_POLICY) as GradePolicyInput;

  const bandsError = form.formState.errors.bands;
  const bandsMessage =
    bandsError && 'message' in bandsError ? (bandsError.message as string | undefined) : undefined;

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

      {bandsLocked ? (
        <Alert tone="warning" title="This scale has already graded published results">
          Revising the bands or the policy would silently change letter grades students already
          hold. Create a new scale instead — the name and status can still be edited here.
        </Alert>
      ) : null}

      <Card className="space-y-6 p-6">
        <FormSection title="Scale">
          <TextField
            form={form}
            name="name"
            label="Name"
            required
            placeholder="Ten point scale"
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="code"
            label="Code"
            required
            placeholder="TEN"
            disabled={mode === 'edit'}
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          <TextAreaField
            form={form}
            name="description"
            label="Description"
            rows={2}
            maxLength={500}
            className="sm:col-span-2"
          />

          <label className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register('isDefault')}
            />
            <span className="text-sm">
              Make this the college default
              <span className="block text-xs text-muted-foreground">
                Used by any exam that does not name a scale. Setting this demotes the current
                default — only one can hold it.
              </span>
            </span>
          </label>
        </FormSection>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Bands</CardTitle>
            <p className="text-sm text-muted-foreground">
              Must cover 0&ndash;100 with no gaps and no overlaps, and at least one must be a pass.
            </p>
          </div>

          {!bandsLocked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                bandArray.append({
                  letter: '',
                  minPercent: 0,
                  maxPercent: 0,
                  gradePoint: 0,
                  isPass: true,
                  description: '',
                } as never)
              }
            >
              <Plus aria-hidden />
              Add band
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-3">
          {bandsMessage ? (
            <Alert tone="danger" title="Fix the bands">
              {bandsMessage}
            </Alert>
          ) : null}

          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Letter</th>
                  <th className="pb-2 pr-3 font-medium">Min %</th>
                  <th className="pb-2 pr-3 font-medium">Max %</th>
                  <th className="pb-2 pr-3 font-medium">Grade point</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 text-center font-medium">Pass</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {bandArray.fields.map((field, index) => (
                  <tr key={field.id}>
                    <td className="py-2 pr-3">
                      <NumberFieldless
                        {...form.register(`bands.${index}.letter` as never)}
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} letter`}
                        className="w-16"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NumberFieldless
                        type="number"
                        step="0.01"
                        {...form.register(`bands.${index}.minPercent` as never, {
                          valueAsNumber: true,
                        })}
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} minimum percent`}
                        className="w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NumberFieldless
                        type="number"
                        step="0.01"
                        {...form.register(`bands.${index}.maxPercent` as never, {
                          valueAsNumber: true,
                        })}
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} maximum percent`}
                        className="w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NumberFieldless
                        type="number"
                        step="0.1"
                        {...form.register(`bands.${index}.gradePoint` as never, {
                          valueAsNumber: true,
                        })}
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} grade point`}
                        className="w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NumberFieldless
                        {...form.register(`bands.${index}.description` as never)}
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} description`}
                        className="w-full min-w-32"
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={bandsLocked}
                        aria-label={`Band ${index + 1} is a pass`}
                        {...form.register(`bands.${index}.isPass` as never)}
                      />
                    </td>
                    <td className="py-2">
                      {!bandsLocked && bandArray.fields.length > 2 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => bandArray.remove(index)}
                          aria-label={`Remove band ${index + 1}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="p-6">
        <FormSection
          title="Policy"
          description="These rules drive both grading and the CGPA. Nothing here is hard-coded in the product."
        >
          <NumberField
            form={form}
            name="policy.passingPercent"
            label="Passing percent"
            min={0}
            max={100}
            hint="The authority on pass or fail."
          />
          <NumberField
            form={form}
            name="policy.maxGraceMarks"
            label="Max grace per subject"
            min={0}
            max={50}
          />
          <NumberField
            form={form}
            name="policy.maxGracePerSemester"
            label="Max grace per semester"
            min={0}
            max={100}
            hint="Recorded but not yet enforced across subjects."
          />
          <NumberField
            form={form}
            name="policy.attendanceBonusThreshold"
            label="Attendance bonus threshold %"
            min={0}
            max={100}
          />
          <NumberField
            form={form}
            name="policy.attendanceBonusMarks"
            label="Attendance bonus marks"
            min={0}
            max={10}
          />
          <SelectField
            form={form}
            name="policy.repeatPolicy"
            label="Repeat policy"
            hint="Which sitting counts when a subject is attempted twice."
            options={REPEAT_POLICY.map((value) => ({ value, label: toTitleCase(value) }))}
          />
          <NumberField
            form={form}
            name="policy.gpaDecimalPlaces"
            label="GPA decimal places"
            min={0}
            max={4}
          />

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register('policy.attendanceBonusEnabled')}
            />
            <span className="text-sm">
              Award an attendance bonus
              <span className="block text-xs text-muted-foreground">
                Applied before grace, and capped at the maximum.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register('policy.countFailedCredits')}
            />
            <span className="text-sm">
              Count failed credits in the GPA divisor
              <span className="block text-xs text-muted-foreground">
                Off means a failed subject is excluded from the average entirely.
              </span>
            </span>
          </label>
        </FormSection>
      </Card>

      <GradeBandPreview bands={bands} policy={policy} />

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create scale' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A bare input for the band grid. The full `Field` wrapper carries a label and
 * spacing per control, which inside a table would repeat the column header on
 * every row — so the header is the label and each cell takes `aria-label`.
 *
 * `forwardRef` is required: `form.register` hands back a ref, and without it
 * react-hook-form never attaches to the element and the value stays undefined.
 */
const NumberFieldless = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function NumberFieldless({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 rounded-md border border-input bg-surface px-2 text-sm shadow-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
