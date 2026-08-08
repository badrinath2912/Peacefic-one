'use client';

import {
  createDepartmentSchema,
  DEPARTMENT_STATUS,
  type CreateDepartmentInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useFaculty } from '@/api/queries';
import {
  FormSection,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import { toTitleCase } from '@/lib/utils';

export type DepartmentFormValues = CreateDepartmentInput;

interface DepartmentFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<DepartmentFormValues>;
  onSubmit: (values: DepartmentFormValues) => Promise<unknown>;
}

export function DepartmentForm({ mode, defaultValues, onSubmit }: DepartmentFormProps) {
  const router = useRouter();
  // Only active staff can head a department.
  const staff = useFaculty({ limit: 200, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } =
    useApiForm<DepartmentFormValues>({
      schema: createDepartmentSchema as unknown as ZodType<DepartmentFormValues>,
      defaultValues: {
        name: '',
        code: '',
        description: '',
        hodId: null,
        establishedYear: null,
        status: 'active',
        ...defaultValues,
      } as DefaultValues<DepartmentFormValues>,
      onSubmit,
      onSuccess: () => {
        toast.success(mode === 'create' ? 'Department created.' : 'Changes saved.');
        router.push('/college/departments');
      },
    });

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
        <FormSection title="Department">
          <TextField
            form={form}
            name="name"
            label="Department name"
            required
            placeholder="Computer Science and Engineering"
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="code"
            label="Department code"
            required
            placeholder="CSE"
            hint="Short, uppercase. Used in roll numbers and imports."
          />
          <SelectField
            form={form}
            name="hodId"
            label="Head of department"
            placeholder="Not assigned"
            // Assigning here grants the HOD role; the server audits it.
            hint="Assigning a head grants them the HOD role."
            options={(staff.data?.items ?? []).map((member) => ({
              value: typeof member.userId === 'object' ? member.userId.id : String(member.userId),
              label:
                typeof member.userId === 'object'
                  ? `${member.userId.fullName} — ${member.designation}`
                  : member.employeeId,
            }))}
          />
          <NumberField
            form={form}
            name="establishedYear"
            label="Established year"
            min={1800}
            max={new Date().getFullYear()}
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            required
            options={DEPARTMENT_STATUS.map((value) => ({ value, label: toTitleCase(value) }))}
          />
          <TextAreaField
            form={form}
            name="description"
            label="Description"
            rows={3}
            maxLength={1000}
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create department' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
