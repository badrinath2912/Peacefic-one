'use client';

import { BATCH_STATUS, createBatchSchema, type CreateBatchInput } from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useDepartments, useFaculty } from '@/api/queries';
import {
  FormSection,
  NumberField,
  SelectField,
  TextField,
} from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import { toTitleCase } from '@/lib/utils';

export type BatchFormValues = CreateBatchInput;

interface BatchFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<BatchFormValues>;
  onSubmit: (values: BatchFormValues) => Promise<unknown>;
}

const currentYear = new Date().getFullYear();

export function BatchForm({ mode, defaultValues, onSubmit }: BatchFormProps) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const staff = useFaculty({ limit: 200, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<BatchFormValues>({
    schema: createBatchSchema as unknown as ZodType<BatchFormValues>,
    defaultValues: {
      name: '',
      code: '',
      departmentId: '',
      admissionYear: currentYear,
      graduationYear: currentYear + 4,
      currentSemester: 1,
      section: '',
      capacity: 60,
      classAdvisorId: null,
      status: 'active',
      ...defaultValues,
    } as DefaultValues<BatchFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Batch created.' : 'Changes saved.');
      router.push('/college/batches');
    },
  });

  const selectedDepartment = form.watch('departmentId');

  // Advisors are drawn from the chosen department: the server rejects a
  // mismatch, so offering everyone would invite an avoidable error.
  const advisorOptions = (staff.data?.items ?? [])
    .filter((member) => {
      if (!selectedDepartment) return true;
      const departmentId =
        typeof member.departmentId === 'string' ? member.departmentId : member.departmentId.id;
      return departmentId === selectedDepartment;
    })
    .map((member) => ({
      value: typeof member.userId === 'object' ? member.userId.id : String(member.userId),
      label:
        typeof member.userId === 'object'
          ? `${member.userId.fullName} — ${member.designation}`
          : member.employeeId,
    }));

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
        <FormSection title="Batch">
          <TextField
            form={form}
            name="name"
            label="Batch name"
            required
            placeholder="CSE 2022-2026 Section A"
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="code"
            label="Batch code"
            required
            placeholder="CSE-22-A"
            hint="Used in imports and roll number lookups."
          />
          <SelectField
            form={form}
            name="departmentId"
            label="Department"
            required
            placeholder="Select a department"
            options={(departments.data?.items ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />
          <TextField form={form} name="section" label="Section" placeholder="A" />
          <SelectField
            form={form}
            name="classAdvisorId"
            label="Class advisor"
            placeholder={selectedDepartment ? 'Not assigned' : 'Choose a department first'}
            disabled={!selectedDepartment}
            options={advisorOptions}
          />
        </FormSection>

        <FormSection title="Academic period">
          <NumberField
            form={form}
            name="admissionYear"
            label="Admission year"
            required
            min={1980}
            max={currentYear + 5}
          />
          <NumberField
            form={form}
            name="graduationYear"
            label="Graduation year"
            required
            min={1980}
            max={currentYear + 15}
            hint="Must be after the admission year."
          />
          <NumberField
            form={form}
            name="currentSemester"
            label="Current semester"
            required
            min={1}
            max={12}
          />
          <NumberField
            form={form}
            name="capacity"
            label="Capacity"
            required
            min={1}
            max={1000}
            hint="Exceeding this needs an explicit override and is audited."
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            required
            options={BATCH_STATUS.map((value) => ({ value, label: toTitleCase(value) }))}
          />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create batch' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
