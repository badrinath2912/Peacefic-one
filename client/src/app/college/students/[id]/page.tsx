'use client';

import {
  CalendarCheck,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';

import { useStudentProfile } from '@/api/queries';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Timeline } from '@/components/ui/timeline';
import { apiPost } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { cn, formatDate, formatDateTime, formatPercent, initials } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relation(value: unknown, key: string): string {
  if (value && typeof value === 'object' && key in value) {
    const found = (value as Record<string, unknown>)[key];
    return found ? String(found) : '—';
  }
  return '—';
}

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const profile = useStudentProfile(params.id);

  if (profile.isLoading) return <FullPageSpinner label="Loading profile" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this student"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { student, account, attendance, placement, documents, activity } = profile.data;
  const person = student.userId;

  const firstName = relation(person, 'firstName');
  const lastName = relation(person, 'lastName');

  async function resendInvite(): Promise<void> {
    try {
      await apiPost(`/students/${params.id}/resend-invite`);
      toast.success('Invitation sent again.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the invitation.');
    }
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Students', href: '/college/students' },
          { label: student.rollNumber },
        ]}
      />

      <PageHeader
        title={`${firstName} ${lastName}`.trim()}
        description={`${student.rollNumber} · ${relation(student.departmentId, 'name')}`}
        actions={
          <>
            {account && account.status !== 'active' && can(user?.permissions, 'student:update') ? (
              <Button variant="outline" onClick={() => void resendInvite()}>
                <Send aria-hidden />
                Resend invite
              </Button>
            ) : null}

            {can(user?.permissions, 'student:update') ? (
              <Button asChild>
                <Link href={`/college/students/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Identity card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            {student.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photoUrl}
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
              <p className="text-sm text-muted-foreground">{student.rollNumber}</p>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
              <StatusBadge status={student.status} />
              {account ? <StatusBadge status={account.status} /> : null}
            </div>

            <dl className="w-full space-y-2 pt-2 text-left text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="truncate">{relation(person, 'email')}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd>{relation(person, 'phone')}</dd>
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dd>{relation(student.batchId, 'code')}</dd>
              </div>
              {student.address ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dd className="text-muted-foreground">
                    {[student.address.city, student.address.district, student.address.state]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        {/* Headline figures */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <StatCard
            label="Attendance"
            value={formatPercent(attendance.percentage)}
            icon={CalendarCheck}
          />
          <StatCard label="Current CGPA" value={student.academics.currentCgpa ?? '—'} />
          <StatCard
            label="Active backlogs"
            value={student.academics.activeBacklogs}
            invertDelta
          />
          <StatCard
            label="Placement"
            value={placement.isPlaced ? 'Placed' : placement.isEligible ? 'Eligible' : 'Not eligible'}
            icon={ShieldCheck}
          />

          {attendance.isBelowThreshold ? (
            <div className="sm:col-span-2">
              <Card className="border-warning/40 bg-warning-subtle">
                <CardContent className="p-4 text-sm text-warning">
                  Attendance is {formatPercent(attendance.percentage)} against a required{' '}
                  {formatPercent(attendance.threshold, 0)} — {attendance.attendedSessions} of{' '}
                  {attendance.totalSessions} sessions attended.
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" aria-hidden />
              Personal information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Admission number', value: student.admissionNumber },
                { label: 'Register number', value: student.registerNumber },
                { label: 'Date of birth', value: formatDate(student.dateOfBirth) },
                { label: 'Gender', value: student.gender },
                { label: 'Blood group', value: student.bloodGroup },
                {
                  label: 'Aadhaar',
                  // Only ever the last four digits exist to show.
                  value: student.aadhaar ? `XXXX XXXX ${student.aadhaar.last4}` : null,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4" aria-hidden />
              Academic information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Department', value: relation(student.departmentId, 'name') },
                { label: 'Batch', value: relation(student.batchId, 'name') },
                { label: 'Programme', value: student.programme },
                { label: 'Section', value: student.section },
                { label: 'Semester', value: student.currentSemester },
                { label: 'Joined', value: formatDate(student.admissionDate) },
                { label: 'Class 10', value: student.academics.tenthPercent ? `${student.academics.tenthPercent}%` : null },
                { label: 'Class 12', value: student.academics.twelfthPercent ? `${student.academics.twelfthPercent}%` : null },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="size-4" aria-hidden />
              Contact and guardian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Mobile', value: relation(person, 'phone') },
                { label: 'Alternate mobile', value: student.alternatePhone },
                { label: 'Parent name', value: student.guardian?.name },
                { label: 'Relation', value: student.guardian?.relation },
                { label: 'Parent mobile', value: student.guardian?.phone },
                { label: 'Parent email', value: student.guardian?.email },
                {
                  label: 'Address',
                  value: student.address
                    ? [
                        student.address.line1,
                        student.address.line2,
                        student.address.city,
                        student.address.district,
                        student.address.state,
                        student.address.pincode,
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
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" aria-hidden />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {documents.length > 0 ? (
              <ul className="divide-y divide-border">
                {documents.map((document) => (
                  <li
                    key={document.type}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{document.label}</p>
                      {document.updatedAt ? (
                        <p className="text-xs text-muted-foreground">
                          Updated {formatDate(document.updatedAt)}
                        </p>
                      ) : null}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={document.url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={FileText}
                title="No documents uploaded"
                description="A résumé or photograph will appear here once uploaded."
              />
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
                tone: entry.outcome === 'failure' ? 'danger' : entry.severity === 'warning' ? 'warning' : 'default',
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
    </>
  );
}
