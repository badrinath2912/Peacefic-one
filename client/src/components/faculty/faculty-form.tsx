'use client';

import {
  createFacultySchema,
  EMPLOYMENT_TYPE,
  FACULTY_STATUS,
  FACULTY_TYPE,
  type CreateFacultyInput,
} from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useDepartments } from '@/api/queries';
import {
  DateField,
  FormSection,
  NumberField,
  SelectField,
  TextField,
} from '@/components/form/form-field';
import { PhotoUpload } from '@/components/form/photo-upload';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import { toTitleCase } from '@/lib/utils';

export type FacultyFormValues = CreateFacultyInput;

interface FacultyFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<FacultyFormValues>;
  onSubmit: (values: FacultyFormValues) => Promise<unknown>;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

export function FacultyForm({ mode, defaultValues, onSubmit }: FacultyFormProps) {
  const router = useRouter();
  const departments = useDepartments({ limit: 100, status: 'active' });
  const [photoKey, setPhotoKey] = useState<string | null>(null);

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<FacultyFormValues>({
    // Same schema the server validates against.
    schema: createFacultySchema as unknown as ZodType<FacultyFormValues>,
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      alternatePhone: '',
      employeeId: '',
      designation: '',
      departmentId: '',
      employmentType: 'permanent',
      type: 'faculty',
      roleKey: 'faculty',
      experienceYears: 0,
      qualifications: [],
      specializations: [],
      assignedBatchIds: [],
      status: 'active',
      sendInvite: true,
      ...defaultValues,
    } as DefaultValues<FacultyFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Staff member created.' : 'Changes saved.');
      router.push('/college/faculty');
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
        <section className="border-b border-border pb-6">
          <PhotoUpload
            value={form.watch('photoUrl')}
            storageKey={photoKey}
            onChange={(url, key) => {
              form.setValue('photoUrl', url, { shouldDirty: true });
              setPhotoKey(key);
            }}
          />
        </section>

        <FormSection title="Employment">
          <TextField
            form={form}
            name="employeeId"
            label="Employee ID"
            required
            placeholder="EMP1042"
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
          <TextField
            form={form}
            name="designation"
            label="Designation"
            required
            placeholder="Assistant Professor"
          />
          <SelectField
            form={form}
            name="type"
            label="Type"
            required
            options={enumOptions(FACULTY_TYPE)}
          />
          <SelectField
            form={form}
            name="employmentType"
            label="Employment type"
            required
            options={enumOptions(EMPLOYMENT_TYPE)}
          />
          <SelectField
            form={form}
            name="roleKey"
            label="Portal role"
            required
            // Only roles a college admin may grant. The server re-checks and
            // rejects any attempt to assign privileges the caller lacks.
            options={[
              { value: 'faculty', label: 'Faculty' },
              { value: 'trainer', label: 'Trainer' },
              { value: 'hod', label: 'Head of Department' },
              { value: 'placement_officer', label: 'Placement Officer' },
            ]}
            disabled={mode === 'edit'}
            hint={mode === 'edit' ? 'Role changes are made from the profile page.' : undefined}
          />
          <DateField form={form} name="joiningDate" label="Date of joining" required />
          <NumberField
            form={form}
            name="experienceYears"
            label="Experience (years)"
            min={0}
            step="0.5"
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            required
            options={enumOptions(FACULTY_STATUS)}
          />
        </FormSection>

        <FormSection title="Personal details">
          <TextField form={form} name="firstName" label="First name" required />
          <TextField form={form} name="lastName" label="Last name" required />
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            required
            disabled={mode === 'edit'}
            hint={mode === 'edit' ? 'Email is the login identity and cannot be changed here.' : undefined}
          />
          <TextField form={form} name="phone" label="Mobile" type="tel" placeholder="+919812345678" />
          <TextField form={form} name="alternatePhone" label="Alternate mobile" type="tel" />
        </FormSection>

        <FormSection title="Emergency contact">
          <TextField form={form} name="emergencyContact.name" label="Contact name" />
          <TextField
            form={form}
            name="emergencyContact.relation"
            label="Relation"
            placeholder="Spouse"
          />
          <TextField form={form} name="emergencyContact.phone" label="Contact mobile" type="tel" />
        </FormSection>

        <FormSection title="Address">
          <TextField form={form} name="address.line1" label="Address line 1" className="sm:col-span-2" />
          <TextField form={form} name="address.line2" label="Address line 2" />
          <TextField form={form} name="address.city" label="City" />
          <TextField form={form} name="address.district" label="District" />
          <TextField form={form} name="address.state" label="State" />
          <TextField form={form} name="address.pincode" label="PIN code" inputMode="numeric" />
          <TextField form={form} name="address.country" label="Country" />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Create staff member' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
