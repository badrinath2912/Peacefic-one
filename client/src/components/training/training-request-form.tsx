'use client';

import {
  createTrainingRequestSchema,
  PRIORITY,
  TRAINING_TYPE,
  type CreateTrainingRequestInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useBatches, useDepartments } from '@/api/queries';
import {
  DateField,
  FormSection,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-field';
import { MultiSelectField } from '@/components/form/multi-select-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import { toTitleCase } from '@/lib/utils';

export type TrainingRequestFormValues = CreateTrainingRequestInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<TrainingRequestFormValues>;
  onSubmit: (values: TrainingRequestFormValues) => Promise<unknown>;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

export function TrainingRequestForm({ mode, defaultValues, onSubmit }: Props) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 200, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } =
    useApiForm<TrainingRequestFormValues>({
      schema: createTrainingRequestSchema as unknown as ZodType<TrainingRequestFormValues>,
      defaultValues: {
        title: '',
        description: '',
        trainingType: 'technical',
        departmentIds: [],
        batchIds: [],
        expectedParticipants: 30,
        durationHours: 20,
        mode: 'offline',
        topics: [],
        objectives: '',
        priority: 'medium',
        status: 'draft',
        ...defaultValues,
      } as DefaultValues<TrainingRequestFormValues>,
      onSubmit,
      onSuccess: () => {
        toast.success(mode === 'create' ? 'Request created.' : 'Changes saved.');
        router.push('/college/training/requests');
      },
    });

  const selectedDepartments = (form.watch('departmentIds') as string[] | undefined) ?? [];

  const batchOptions = (batches.data?.items ?? [])
    .filter((batch) => {
      if (selectedDepartments.length === 0) return true;
      const departmentId =
        typeof batch.departmentId === 'string' ? batch.departmentId : batch.departmentId.id;
      return selectedDepartments.includes(departmentId);
    })
    .map((batch) => ({ value: batch.id, label: `${batch.code} — ${batch.name}` }));

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
        <FormSection title="What is needed">
          <TextField
            form={form}
            name="title"
            label="Title"
            required
            placeholder="Advanced Java for placements"
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="trainingType"
            label="Category"
            required
            options={enumOptions(TRAINING_TYPE)}
          />
          <TextAreaField
            form={form}
            name="description"
            label="Description"
            required
            rows={4}
            maxLength={10000}
            hint="At least 20 characters. Explain the gap this training closes."
            className="sm:col-span-2 lg:col-span-3"
          />
          <TextAreaField
            form={form}
            name="objectives"
            label="Learning objectives"
            rows={3}
            maxLength={5000}
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>

        <section className="space-y-4 border-b border-border pb-6">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Who it is for</h2>
            <p className="text-xs text-muted-foreground">
              Leave both empty to request a college-wide programme.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MultiSelectField
              form={form}
              name="departmentIds"
              label="Departments"
              emptyLabel="College-wide"
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />
            <MultiSelectField
              form={form}
              name="batchIds"
              label="Batches"
              emptyLabel="No specific batches"
              options={batchOptions}
            />
          </div>
        </section>

        <FormSection title="Scheduling and scale">
          <NumberField
            form={form}
            name="expectedParticipants"
            label="Expected participants"
            required
            min={1}
          />
          <NumberField
            form={form}
            name="durationHours"
            label="Duration (hours)"
            required
            min={1}
            step="0.5"
          />
          <SelectField
            form={form}
            name="mode"
            label="Mode"
            required
            options={[
              { value: 'offline', label: 'In person' },
              { value: 'online', label: 'Online' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
          />
          <DateField form={form} name="preferredStartDate" label="Preferred start" required />
          <DateField
            form={form}
            name="preferredEndDate"
            label="Preferred end"
            required
            hint="Must be on or after the start date."
          />
          <SelectField
            form={form}
            name="priority"
            label="Priority"
            required
            options={enumOptions(PRIORITY)}
            hint="Urgent requests notify approvers immediately."
          />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>

        {/* Saving as a draft and submitting for approval are different acts, so
            they are different buttons rather than a hidden status field. */}
        {mode === 'create' ? (
          <Button
            type="submit"
            variant="outline"
            isLoading={isSubmitting}
            onClick={() => form.setValue('status', 'draft')}
          >
            Save draft
          </Button>
        ) : null}

        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingText="Saving"
          onClick={() => mode === 'create' && form.setValue('status', 'submitted')}
        >
          {mode === 'create' ? 'Submit for approval' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
