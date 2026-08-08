'use client';

import {
  Briefcase,
  CalendarCheck,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { useFacultyProfile } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Timeline } from '@/components/ui/timeline';
import { apiDelete, type ApiError } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, formatPercent, initials } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relation(value: unknown, key: string): string {
  if (value && typeof value === 'object' && key in value) {
    const found = (value as Record<string, unknown>)[key];
    return found ? String(found) : '—';
  }
  return '—';
}

export default function FacultyProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const profile = useFacultyProfile(params.id);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (profile.isLoading) return <FullPageSpinner label="Loading profile" />;

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

  const { faculty, account, workload, compliance, headsOf, activity } = profile.data;
  const firstName = relation(faculty.userId, 'firstName');
  const lastName = relation(faculty.userId, 'lastName');

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);
    try {
      await apiDelete(`/faculty/${params.id}`);
      toast.success('Staff member removed.');
      router.push('/college/faculty');
    } catch (error) {
      toast.error((error as ApiError).message);
      setPendingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <RouteGuard permissions={['faculty:read']}>
      <Breadcrumbs
        items={[{ label: 'Faculty', href: '/college/faculty' }, { label: faculty.employeeId }]}
      />

      <PageHeader
        title={`${firstName} ${lastName}`.trim()}
        description={`${faculty.employeeId} · ${faculty.designation}`}
        actions={
          <>
            {can(user?.permissions, 'faculty:update') ? (
              <Button variant="outline" asChild>
                <Link href={`/college/faculty/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'faculty:delete') ? (
              <Button variant="danger" onClick={() => setPendingDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      {/* Shown up front because it is the thing that will block a delete. */}
      {headsOf.length > 0 ? (
        <Card className="mb-4 border-info/40 bg-info-subtle">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-info">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Heads {headsOf.map((department) => department.name).join(', ')}. Reassign the
              department before removing this member.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            {faculty.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={faculty.photoUrl}
                alt=""
                className="size-20 rounded-full border border-border object-cover"
              />
            ) : (
              <span
                className="grid size-20 place-items-center rounded-full bg-primary-subtle text-xl font-semibold text-primary"
                aria-hidden
              >
                {initials(firstName, lastName)}
              </span>
            )}

            <div>
              <p className="font-semibold">{`${firstName} ${lastName}`.trim()}</p>
              <p className="text-sm text-muted-foreground">{faculty.designation}</p>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
              <StatusBadge status={faculty.status} />
              {account ? <StatusBadge status={account.status} /> : null}
            </div>

            <dl className="w-full space-y-2 pt-2 text-left text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="truncate">{account?.email ?? '—'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd>{account?.phone ?? '—'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd>{relation(faculty.departmentId, 'name')}</dd>
              </div>
              {faculty.address ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dd className="text-muted-foreground">
                    {[faculty.address.city, faculty.address.district, faculty.address.state]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <StatCard label="Batches" value={workload.batchCount} icon={GraduationCap} />
          <StatCard label="Students taught" value={workload.studentCount} icon={Users} />
          <StatCard label="Experience" value={faculty.experienceYears} suffix=" yr" />
          <StatCard
            label="Attendance compliance"
            value={formatPercent(compliance.complianceRate)}
            icon={CalendarCheck}
          />

          {compliance.pendingSessions > 0 ? (
            <div className="sm:col-span-2">
              <Card className="border-warning/40 bg-warning-subtle">
                <CardContent className="p-4 text-sm text-warning">
                  {compliance.pendingSessions} attendance session
                  {compliance.pendingSessions === 1 ? '' : 's'} still unmarked. These must be
                  cleared before this member can be removed or unassigned from a batch.
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Employee ID', value: faculty.employeeId },
                { label: 'Department', value: relation(faculty.departmentId, 'name') },
                { label: 'Designation', value: faculty.designation },
                { label: 'Type', value: faculty.type },
                { label: 'Employment type', value: faculty.employmentType },
                { label: 'Date of joining', value: formatDate(faculty.joiningDate) },
                { label: 'Experience', value: `${faculty.experienceYears} years` },
                {
                  label: 'Specialisations',
                  value: faculty.specializations.join(', ') || null,
                  full: true,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Email', value: account?.email },
                { label: 'Mobile', value: account?.phone },
                { label: 'Alternate mobile', value: faculty.alternatePhone },
                { label: 'Emergency contact', value: faculty.emergencyContact?.name },
                { label: 'Relation', value: faculty.emergencyContact?.relation },
                { label: 'Emergency mobile', value: faculty.emergencyContact?.phone },
                {
                  label: 'Address',
                  value: faculty.address
                    ? [
                        faculty.address.line1,
                        faculty.address.line2,
                        faculty.address.city,
                        faculty.address.district,
                        faculty.address.state,
                        faculty.address.pincode,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : null,
                  full: true,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualifications</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {faculty.qualifications.length > 0 ? (
              <ul className="divide-y divide-border">
                {faculty.qualifications.map((qualification, index) => (
                  <li key={`${qualification.degree}-${index}`} className="px-5 py-2.5">
                    <p className="text-sm font-medium">
                      {qualification.degree}
                      {qualification.specialization ? ` — ${qualification.specialization}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {qualification.institution} · {qualification.year}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={GraduationCap} title="No qualifications recorded" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned batches</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {workload.batches.length > 0 ? (
              <ul className="divide-y divide-border">
                {workload.batches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{batch.code}</p>
                      <p className="truncate text-xs text-muted-foreground">{batch.name}</p>
                    </div>
                    <span className="tabular text-sm text-muted-foreground">
                      {batch.students} students
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={GraduationCap} title="No batches assigned" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length > 0 ? (
            <Timeline
              entries={activity.map((entry) => ({
                id: entry.id,
                title: entry.action.replace(/[._]/g, ' '),
                actor: entry.actor,
                at: formatDateTime(entry.at),
                tone:
                  entry.outcome === 'failure'
                    ? 'danger'
                    : entry.severity === 'warning'
                      ? 'warning'
                      : 'default',
                detail: entry.changes
                  ?.map((change) => `${change.field}: ${String(change.from)} → ${String(change.to)}`)
                  .join(', '),
              }))}
            />
          ) : (
            <EmptyState title="No activity recorded" />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Remove ${firstName} ${lastName}?`}
        description={
          headsOf.length > 0
            ? `This member heads ${headsOf.map((d) => d.name).join(', ')}, so the removal will be refused until the department is reassigned.`
            : 'Their account will stop working. Records they created are retained for audit.'
        }
        confirmLabel="Remove"
        isPending={isDeleting}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </RouteGuard>
  );
}
