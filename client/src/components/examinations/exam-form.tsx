'use client';

import {
  createExaminationSchema,
  EXAM_TYPE,
  type CreateExaminationInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useGradeScales } from '@/api/examination-queries';
import { useBatches, useCourses, useDepartments } from '@/api/queries';
import {
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import { toTitleCase } from '@/lib/utils';

export type ExamFormValues = CreateExaminationInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<ExamFormValues>;
  onSubmit: (values: ExamFormValues) => Promise<unknown>;
  /** Locked once marks exist — changing the scheme would rescale every result. */
  marksSchemeLocked?: boolean;
  redirectTo?: string;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalDateTimeValue(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ExamForm({
  mode,
  defaultValues,
  onSubmit,
  marksSchemeLocked = false,
  redirectTo = '/college/examinations/exams',
}: Props) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 200, status: 'active' });
  const courses = useCourses({ limit: 200, status: 'published' });
  const gradeScales = useGradeScales({ limit: 50, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<ExamFormValues>({
    schema: createExaminationSchema as unknown as ZodType<ExamFormValues>,
    defaultValues: {
      title: '',
      code: '',
      examType: 'semester',
      courseId: '',
      departmentId: '',
      batchIds: [],
      semester: 1,
      academicYear: '',
      maxMarks: { theory: 60, practical: 20, internal: 20 },
      credits: 4,
      gradeScaleId: null,
      scheduledAt: null,
      durationMinutes: 180,
      venue: '',
      instructions: '',
      trainingSessionId: null,
      ...defaultValues,
    } as DefaultValues<ExamFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Exam created as a draft.' : 'Changes saved.');
      router.push(redirectTo);
    },
  });

  const examType = form.watch('examType');
  const selectedDepartment = form.watch('departmentId');
  const maxMarks = form.watch('maxMarks');

  // Mirrors the server's `pre('validate')` sum so the total is visible while
  // typing rather than only after a save.
  const totalMarks =
    (Number(maxMarks?.theory) || 0) +
    (Number(maxMarks?.practical) || 0) +
    (Number(maxMarks?.internal) || 0);

  const batchOptions = (batches.data?.items ?? [])
    .filter((batch) => {
      if (!selectedDepartment) return true;
      const departmentId =
        typeof batch.departmentId === 'string' ? batch.departmentId : batch.departmentId.id;
      return departmentId === selectedDepartment;
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

      {marksSchemeLocked ? (
        <Alert tone="warning" title="The marks scheme is locked">
          Marks have already been entered for this exam. Changing the maximum, the credits or the
          grade scale would rescale every percentage already computed, so those fields are fixed.
        </Alert>
      ) : null}

      <Card className="space-y-6 p-6">
        <FormSection title="Examination">
          <TextField
            form={form}
            name="title"
            label="Title"
            required
            placeholder="Data Structures — Semester Examination"
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="code"
            label="Code"
            required
            placeholder="DSA-SEM5"
            hint="Unique within your college."
            disabled={mode === 'edit'}
          />
          <SelectField
            form={form}
            name="examType"
            label="Type"
            required
            options={enumOptions(EXAM_TYPE)}
          />
          <SelectField
            form={form}
            name="courseId"
            label="Course"
            required
            placeholder="Select a course"
            disabled={mode === 'edit'}
            options={(courses.data?.items ?? []).map((course) => ({
              value: course.id,
              label: `${course.code} — ${course.title}`,
            }))}
          />
          <SelectField
            form={form}
            name="departmentId"
            label="Department"
            required
            placeholder="Select a department"
            disabled={mode === 'edit'}
            options={(departments.data?.items ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />
          <NumberField form={form} name="semester" label="Semester" required min={1} max={12} />
          <TextField
            form={form}
            name="academicYear"
            label="Academic year"
            required
            placeholder="2025-2026"
            hint="Four digits, a hyphen, four digits."
          />
        </FormSection>

        <FormSection
          title="Marks and grading"
          description="The total is the sum of the three components. A component the exam does not use stays at zero."
        >
          <NumberField
            form={form}
            name="maxMarks.theory"
            label="Theory"
            min={0}
            disabled={marksSchemeLocked}
          />
          <NumberField
            form={form}
            name="maxMarks.practical"
            label="Practical"
            min={0}
            disabled={marksSchemeLocked}
          />
          <NumberField
            form={form}
            name="maxMarks.internal"
            label="Internal"
            min={0}
            disabled={marksSchemeLocked}
          />

          <Field label="Total marks" hint="Derived — the server computes the same sum.">
            {({ id }) => (
              <Input
                id={id}
                readOnly
                value={totalMarks}
                className="tabular bg-surface-sunken font-medium"
                aria-live="polite"
              />
            )}
          </Field>

          <NumberField
            form={form}
            name="credits"
            label="Credits"
            required
            min={0}
            max={20}
            step={0.5}
            hint="Weights this subject in the CGPA."
            disabled={marksSchemeLocked}
          />

          <SelectField
            form={form}
            name="gradeScaleId"
            label="Grade scale"
            placeholder="Use the college default"
            disabled={marksSchemeLocked}
            hint="Leave blank to grade against whichever scale is the default."
            options={(gradeScales.data?.items ?? []).map((scale) => ({
              value: scale.id,
              label: scale.isDefault ? `${scale.name} (default)` : scale.name,
            }))}
          />
        </FormSection>

        <FormSection title="When and where">
          <Field
            label="Scheduled at"
            hint="Required before the exam can be scheduled."
            error={form.formState.errors.scheduledAt?.message as string | undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="datetime-local"
                aria-describedby={describedBy}
                invalid={invalid}
                defaultValue={toLocalDateTimeValue(defaultValues?.scheduledAt)}
                onChange={(event) =>
                  form.setValue(
                    'scheduledAt',
                    // Sent as a full ISO string; the schema coerces to a Date.
                    (event.target.value
                      ? new Date(event.target.value).toISOString()
                      : null) as never,
                    { shouldDirty: true },
                  )
                }
              />
            )}
          </Field>

          <NumberField
            form={form}
            name="durationMinutes"
            label="Duration (minutes)"
            min={10}
            max={600}
            required={examType === 'online'}
            hint={examType === 'online' ? 'Required for an online exam.' : undefined}
          />
          <TextField form={form} name="venue" label="Venue" placeholder="Examination Hall A" />

          <MultiSelectField
            form={form}
            name="batchIds"
            label="Batches"
            required
            emptyLabel="No batches selected"
            hint={selectedDepartment ? undefined : 'Pick a department to narrow this list.'}
            options={batchOptions}
            className="sm:col-span-2"
          />

          <TextAreaField
            form={form}
            name="instructions"
            label="Instructions to candidates"
            rows={4}
            maxLength={10000}
            placeholder="Answer any five questions. Scientific calculators are permitted."
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create exam' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
