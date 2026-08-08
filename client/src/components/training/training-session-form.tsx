'use client';

import {
  createTrainingSessionSchema,
  TRAINING_MODE,
  TRAINING_TYPE,
  type CreateTrainingSessionInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useBatches, useDepartments, useFaculty } from '@/api/queries';
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

export type TrainingSessionFormValues = CreateTrainingSessionInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<TrainingSessionFormValues>;
  onSubmit: (values: TrainingSessionFormValues) => Promise<unknown>;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

export function TrainingSessionForm({ mode, defaultValues, onSubmit }: Props) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 200, status: 'active' });
  // Trainers and faculty both deliver training, so the picker offers all
  // active staff rather than filtering to type === 'trainer'.
  const staff = useFaculty({ limit: 200, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } =
    useApiForm<TrainingSessionFormValues>({
      schema: createTrainingSessionSchema as unknown as ZodType<TrainingSessionFormValues>,
      defaultValues: {
        title: '',
        description: '',
        trainingType: 'technical',
        departmentIds: [],
        batchIds: [],
        trainerIds: [],
        capacity: 30,
        mode: 'offline',
        location: '',
        meetingLink: '',
        learningObjectives: [],
        topics: [],
        status: 'scheduled',
        ...defaultValues,
      } as DefaultValues<TrainingSessionFormValues>,
      onSubmit,
      onSuccess: () => {
        toast.success(mode === 'create' ? 'Session scheduled.' : 'Changes saved.');
        router.push('/college/training/sessions');
      },
    });

  const selectedMode = form.watch('mode');
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
        <FormSection title="Session">
          <TextField
            form={form}
            name="title"
            label="Title"
            required
            placeholder="Advanced Java — Batch A"
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
            rows={3}
            maxLength={10000}
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>

        <FormSection title="When and where">
          <DateField form={form} name="startDate" label="Start date" required />
          <DateField
            form={form}
            name="endDate"
            label="End date"
            required
            hint="Must be on or after the start date."
          />
          <NumberField
            form={form}
            name="capacity"
            label="Capacity"
            required
            min={1}
            hint="Enrolment is refused once this is reached."
          />
          <SelectField
            form={form}
            name="mode"
            label="Mode"
            required
            options={enumOptions(TRAINING_MODE)}
          />

          {/* Which field is required follows the mode, matching the server. */}
          {selectedMode !== 'online' ? (
            <TextField
              form={form}
              name="location"
              label="Location"
              required
              placeholder="Seminar Hall 2"
            />
          ) : null}

          {selectedMode !== 'offline' ? (
            <TextField
              form={form}
              name="meetingLink"
              label="Meeting link"
              required
              type="url"
              placeholder="https://meet.example.com/session"
            />
          ) : null}
        </FormSection>

        <section className="space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Who is involved</h2>
            <p className="text-xs text-muted-foreground">
              A trainer already committed to an overlapping session will be rejected.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MultiSelectField
              form={form}
              name="trainerIds"
              label="Trainers"
              emptyLabel="No trainers assigned"
              options={(staff.data?.items ?? []).map((member) => ({
                value: member.id,
                label:
                  typeof member.userId === 'object'
                    ? `${member.userId.fullName} — ${member.designation}`
                    : member.employeeId,
              }))}
            />

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
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Schedule session' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
