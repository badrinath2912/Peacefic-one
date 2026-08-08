'use client';

import {
  CONTENT_STATUS,
  COURSE_CATEGORY,
  COURSE_LEVEL,
  createCourseSchema,
  type CreateCourseInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useBatches, useCourses, useDepartments, useFaculty } from '@/api/queries';
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
import { useApiForm } from '@/hooks/use-api-form';
import { toTitleCase } from '@/lib/utils';

export type CourseFormValues = CreateCourseInput;

interface CourseFormProps {
  mode: 'create' | 'edit';
  courseId?: string;
  defaultValues?: Partial<CourseFormValues>;
  onSubmit: (values: CourseFormValues) => Promise<unknown>;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

export function CourseForm({ mode, courseId, defaultValues, onSubmit }: CourseFormProps) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 200, status: 'active' });
  const staff = useFaculty({ limit: 200, status: 'active' });
  const courses = useCourses({ limit: 200 });

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<CourseFormValues>({
    schema: createCourseSchema as unknown as ZodType<CourseFormValues>,
    defaultValues: {
      title: '',
      code: '',
      description: '',
      category: 'technical',
      level: 'beginner',
      durationHours: 30,
      credits: null,
      semester: null,
      instructorIds: [],
      departmentIds: [],
      batchIds: [],
      prerequisites: [],
      learningOutcomes: [],
      tags: [],
      status: 'draft',
      ...defaultValues,
    } as DefaultValues<CourseFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Course created.' : 'Changes saved.');
      router.push('/college/courses');
    },
  });

  const selectedDepartments = (form.watch('departmentIds') as string[] | undefined) ?? [];

  // Batches narrow to the chosen departments; the server rejects a mismatch,
  // so offering all of them would invite an avoidable error.
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
        <FormSection title="Course">
          <TextField
            form={form}
            name="title"
            label="Course name"
            required
            placeholder="Data Structures and Algorithms"
            className="sm:col-span-2"
          />
          <TextField form={form} name="code" label="Course code" required placeholder="CS201" />
          <SelectField
            form={form}
            name="category"
            label="Category"
            required
            options={enumOptions(COURSE_CATEGORY)}
          />
          <SelectField
            form={form}
            name="level"
            label="Level"
            required
            options={enumOptions(COURSE_LEVEL)}
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            required
            options={enumOptions(CONTENT_STATUS)}
            hint="Only published courses are visible to students."
          />
          <TextAreaField
            form={form}
            name="description"
            label="Description"
            required
            rows={4}
            maxLength={5000}
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>

        <FormSection title="Academic details">
          <NumberField
            form={form}
            name="durationHours"
            label="Duration (hours)"
            required
            min={0}
            step="0.5"
          />
          <NumberField form={form} name="credits" label="Credits" min={0} max={20} step="0.5" />
          <NumberField form={form} name="semester" label="Semester" min={1} max={12} />
        </FormSection>

        <section className="space-y-4 border-b border-border pb-6">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Relationships</h2>
            <p className="text-xs text-muted-foreground">
              Who teaches it, who it is for, and what must be completed first.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MultiSelectField
              form={form}
              name="departmentIds"
              label="Departments"
              emptyLabel="Available college-wide"
              hint="Leave empty to make this available to every department."
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />

            <MultiSelectField
              form={form}
              name="batchIds"
              label="Batches"
              emptyLabel="No batches assigned"
              options={batchOptions}
            />

            <MultiSelectField
              form={form}
              name="instructorIds"
              label="Instructors"
              emptyLabel="No instructors assigned"
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
              name="prerequisites"
              label="Prerequisites"
              emptyLabel="No prerequisites"
              options={(courses.data?.items ?? [])
                // A course can never be its own prerequisite.
                .filter((course) => course.id !== courseId)
                .map((course) => ({ value: course.id, label: `${course.code} — ${course.title}` }))}
            />
          </div>
        </section>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create course' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
