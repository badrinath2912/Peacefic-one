'use client';

import type { CreateFacultyInput } from '@peacefic/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { useFacultyProfile } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { FacultyForm } from '@/components/faculty/faculty-form';
import { PageHeader } from '@/components/layout/app-shell';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { apiPatch } from '@/lib/api-client';

function dateInput(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function relationId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id ?? '');
  }
  return '';
}

export default function EditFacultyPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const profile = useFacultyProfile(params.id);

  if (profile.isLoading) return <FullPageSpinner label="Loading staff member" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this staff member"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { faculty, account } = profile.data;

  return (
    <RouteGuard permissions={['faculty:update']}>
      <Breadcrumbs
        items={[
          { label: 'Faculty', href: '/college/faculty' },
          { label: faculty.employeeId, href: `/college/faculty/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${faculty.employeeId}`} description={account?.email} />

      <FacultyForm
        mode="edit"
        defaultValues={
          {
            firstName: typeof faculty.userId === 'object' ? faculty.userId.firstName : '',
            lastName: typeof faculty.userId === 'object' ? faculty.userId.lastName : '',
            email: account?.email ?? '',
            phone: account?.phone ?? '',
            alternatePhone: faculty.alternatePhone ?? '',
            photoUrl: faculty.photoUrl ?? '',
            employeeId: faculty.employeeId,
            designation: faculty.designation,
            departmentId: relationId(faculty.departmentId),
            employmentType: faculty.employmentType,
            type: faculty.type,
            joiningDate: dateInput(faculty.joiningDate),
            experienceYears: faculty.experienceYears,
            specializations: faculty.specializations,
            qualifications: faculty.qualifications,
            assignedBatchIds: faculty.assignedBatchIds,
            status: faculty.status,
            address: faculty.address ?? undefined,
            emergencyContact: faculty.emergencyContact ?? undefined,
          } as Partial<CreateFacultyInput>
        }
        onSubmit={async (values) => {
          // Email is the login identity and roleKey is changed elsewhere, so
          // neither is sent — the server rejects them on update anyway.
          const { email: _email, roleKey: _roleKey, sendInvite: _invite, ...patch } = values;

          const updated = await apiPatch(`/faculty/${params.id}`, patch);

          await queryClient.invalidateQueries({ queryKey: ['faculty'] });
          return updated;
        }}
      />
    </RouteGuard>
  );
}
