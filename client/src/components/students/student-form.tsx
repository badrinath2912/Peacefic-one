'use client';

import { createStudentSchema, GENDER, STUDENT_STATUS, type CreateStudentInput } from '@peacefic/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import { useBatches, useDepartments } from '@/api/queries';
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

export type StudentFormValues = CreateStudentInput;

interface StudentFormProps {
  mode: 'create' | 'edit';
  studentId?: string;
  defaultValues?: Partial<StudentFormValues>;
  onSubmit: (values: StudentFormValues) => Promise<unknown>;
}

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

export function StudentForm({ mode, defaultValues, onSubmit }: StudentFormProps) {
  const router = useRouter();
  // Tracked outside the form: it is a storage detail, not a student field.
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 100, status: 'active' });

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<StudentFormValues>({
    /**
     * The same schema the server validates against, so the rules cannot drift.
     * The cast is needed only because the schema's input type (fields with
     * `.default()` are optional) differs from its output type (they are
     * required) — the shape is identical.
     */
    schema: createStudentSchema as unknown as ZodType<StudentFormValues>,
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      alternatePhone: '',
      admissionNumber: '',
      rollNumber: '',
      registerNumber: '',
      programme: '',
      section: '',
      departmentId: '',
      batchId: '',
      currentSemester: 1,
      status: 'active',
      sendInvite: true,
      academics: { activeBacklogs: 0, totalBacklogs: 0, yearGap: 0 },
      ...defaultValues,
    } as DefaultValues<StudentFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Student created.' : 'Student updated.');
      router.push('/college/students');
    },
  });

  const selectedDepartment = form.watch('departmentId');

  // Only batches in the chosen department: the server rejects a mismatch, so
  // offering the full list would invite an avoidable error.
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
            <span className="mt-1 block font-mono text-2xs opacity-70">
              Reference: {requestId}
            </span>
          ) : null}
        </Alert>
      ) : null}

      <Card className="space-y-6 p-6">
        <FormSection title="Identity" description="How this student is identified institutionally.">
          <TextField
            form={form}
            name="admissionNumber"
            label="Admission number"
            required
            placeholder="ADM2022001"
            hint="Issued at enrolment and never reassigned."
          />
          <TextField
            form={form}
            name="rollNumber"
            label="Roll number"
            required
            placeholder="CS22B001"
          />
          <TextField
            form={form}
            name="registerNumber"
            label="Register number"
            placeholder="731122104001"
          />
        </FormSection>

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

        <FormSection title="Personal details">
          <TextField form={form} name="firstName" label="First name" required />
          <TextField form={form} name="lastName" label="Last name" required />
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="off"
            disabled={mode === 'edit'}
            hint={mode === 'edit' ? 'Email is the login identity and cannot be changed here.' : undefined}
          />
          <TextField
            form={form}
            name="phone"
            label="Mobile number"
            type="tel"
            placeholder="+919812345678"
          />
          <TextField
            form={form}
            name="alternatePhone"
            label="Alternate mobile"
            type="tel"
          />
          <DateField form={form} name="dateOfBirth" label="Date of birth" />
          <SelectField
            form={form}
            name="gender"
            label="Gender"
            placeholder="Not specified"
            options={enumOptions(GENDER)}
          />
          <TextField form={form} name="bloodGroup" label="Blood group" placeholder="O+" />
          <TextField
            form={form}
            name="aadhaarNumber"
            label="Aadhaar number"
            inputMode="numeric"
            placeholder="1234 5678 9012"
            // Says plainly what happens to it, because people are right to ask.
            hint="Only the last four digits are stored. The full number is never saved."
          />
        </FormSection>

        <FormSection title="Academic placement">
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
          <SelectField
            form={form}
            name="batchId"
            label="Batch"
            required
            placeholder={selectedDepartment ? 'Select a batch' : 'Choose a department first'}
            disabled={!selectedDepartment}
            options={batchOptions}
          />
          <TextField
            form={form}
            name="programme"
            label="Programme"
            placeholder="B.E. Computer Science"
          />
          <TextField form={form} name="section" label="Section" placeholder="A" />
          <NumberField
            form={form}
            name="currentSemester"
            label="Semester"
            required
            min={1}
            max={12}
          />
          <DateField
            form={form}
            name="admissionDate"
            label="Joining date"
            required
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            required
            options={enumOptions(STUDENT_STATUS)}
          />
        </FormSection>

        <FormSection title="Academic record">
          <NumberField form={form} name="academics.tenthPercent" label="Class 10 %" step="0.01" />
          <NumberField form={form} name="academics.twelfthPercent" label="Class 12 %" step="0.01" />
          <NumberField form={form} name="academics.currentCgpa" label="Current CGPA" step="0.01" />
          <NumberField form={form} name="academics.activeBacklogs" label="Active backlogs" min={0} />
          <NumberField form={form} name="academics.totalBacklogs" label="Total backlogs" min={0} />
          <NumberField form={form} name="academics.yearGap" label="Year gap" min={0} />
        </FormSection>

        <FormSection title="Parent or guardian">
          <TextField form={form} name="guardian.name" label="Parent name" />
          <TextField form={form} name="guardian.relation" label="Relation" placeholder="Father" />
          <TextField form={form} name="guardian.phone" label="Parent mobile" type="tel" />
          <TextField form={form} name="guardian.email" label="Parent email" type="email" />
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
          {mode === 'create' ? 'Create student' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
