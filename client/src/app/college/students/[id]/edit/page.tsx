'use client';

import type { CreateStudentInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { useStudent } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { StudentForm } from '@/components/students/student-form';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { apiPatch } from '@/lib/api-client';

/** Trims a date to `yyyy-MM-dd` so `<input type="date">` accepts it. */
function dateInput(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id ?? '');
  }
  return '';
}

export default function EditStudentPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const student = useStudent(params.id);

  if (student.isLoading) return <FullPageSpinner label="Loading student" />;

  if (student.isError) {
    return (
      <ErrorState
        title="Could not load this student"
        message={student.error.message}
        requestId={student.error.requestId}
        onRetry={() => void student.refetch()}
      />
    );
  }

  if (!student.data) return <FullPageSpinner label="Loading" />;

  const record = student.data;
  const account =
    typeof record.userId === 'object'
      ? record.userId
      : { firstName: '', lastName: '', email: '', id: '' };

  return (
    <RouteGuard permissions={['student:update']}>
      <Breadcrumbs
        items={[
          { label: 'Students', href: '/college/students' },
          { label: record.rollNumber, href: `/college/students/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${record.rollNumber}`} description={account.email} />

      <StudentForm
        mode="edit"
        studentId={params.id}
        defaultValues={
          {
            firstName: account.firstName,
            lastName: account.lastName,
            email: account.email,
            phone: (record as { phone?: string }).phone ?? '',
            alternatePhone: (record as { alternatePhone?: string }).alternatePhone ?? '',
            admissionNumber: (record as { admissionNumber?: string }).admissionNumber ?? '',
            rollNumber: record.rollNumber,
            registerNumber: record.registerNumber ?? '',
            programme: (record as { programme?: string }).programme ?? '',
            section: (record as { section?: string }).section ?? '',
            departmentId: relationId(record.departmentId),
            batchId: relationId(record.batchId),
            currentSemester: record.currentSemester,
            status: record.status,
            gender: record.gender ?? undefined,
            dateOfBirth: dateInput((record as { dateOfBirth?: string }).dateOfBirth),
            admissionDate: dateInput((record as { admissionDate?: string }).admissionDate),
            bloodGroup: (record as { bloodGroup?: string }).bloodGroup ?? '',
            photoUrl: (record as { photoUrl?: string }).photoUrl ?? '',
            academics: record.academics,
            guardian: (record as { guardian?: unknown }).guardian ?? undefined,
            address: (record as { address?: unknown }).address ?? undefined,
          } as Partial<CreateStudentInput>
        }
        onSubmit={async (values) => {
          // Email is the login identity and is not editable here, so it is
          // dropped rather than sent and rejected.
          const { email: _email, sendInvite: _sendInvite, ...patch } = values;

          const updated = await apiPatch(`/students/${params.id}`, patch);

          await queryClient.invalidateQueries({ queryKey: ['students'] });
          return updated;
        }}
      />
    </RouteGuard>
  );
}
