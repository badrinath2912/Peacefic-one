'use client';

import type { UpdateOwnStudentProfileInput } from '@peacefic/shared';
import { Lock, Pencil, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { useOwnStudentProfile, type OwnStudentProfile } from '@/api/queries';
import { useUpdateOwnStudentProfile } from '@/api/student-mutations';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { ProfileForm, type ProfileFormValues } from '@/components/student/profile-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { can } from '@/lib/permissions';
import { formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/** The eight keys the server accepts. Nothing else is ever put on the wire. */
const EDITABLE_KEYS = [
  'phone',
  'dateOfBirth',
  'gender',
  'bloodGroup',
  'address',
  'guardian',
  'skills',
  'portfolioLinks',
] as const;

function relationName(value: unknown): string | null {
  if (value && typeof value === 'object' && 'name' in value) {
    return String((value as { name: unknown }).name ?? '') || null;
  }
  return null;
}

/**
 * The student's own profile.
 *
 * Read through `GET /students/me` and written through `PATCH /students/me`;
 * both resolve the student from the token, so no id is sent in either
 * direction and none can be supplied from the browser.
 *
 * Editing is explicit — view, then edit, then save — rather than autosaving,
 * because a save that touches `skills` resets their verified mark server-side
 * and that should follow a deliberate action.
 */
export default function StudentProfilePage() {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  const mayRead = can(user?.permissions, 'student:read_own');
  const mayUpdate = can(user?.permissions, 'student:update_own');

  const profile = useOwnStudentProfile(mayRead);
  const updateProfile = useUpdateOwnStudentProfile();

  const data = profile.data;
  const account = data && typeof data.userId === 'object' ? data.userId : null;

  /**
   * Sends only what actually changed.
   *
   * This matters beyond payload size: the server rewrites every skill as
   * unverified whenever `skills` is present, so a student editing their blood
   * group must not silently strip verification from their skill list.
   */
  async function save(values: ProfileFormValues): Promise<unknown> {
    if (!data) return undefined;

    const original = originalValues(data);
    const payload: Record<string, unknown> = {};

    for (const key of EDITABLE_KEYS) {
      const next = values[key as keyof ProfileFormValues];
      if (JSON.stringify(next ?? null) !== JSON.stringify(original[key] ?? null)) {
        payload[key] = next;
      }
    }

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes were made.');
      setIsEditing(false);
      return undefined;
    }

    const result = await updateProfile.mutateAsync(payload as UpdateOwnStudentProfileInput);
    setIsEditing(false);
    return result;
  }

  return (
    <RouteGuard permissions={['student:read_own']}>
      <PageHeader
        title="My profile"
        description="Your contact details and skills. Your institution maintains the rest."
        actions={
          !isEditing && mayUpdate && data ? (
            <Button onClick={() => setIsEditing(true)}>
              <Pencil aria-hidden />
              Edit profile
            </Button>
          ) : null
        }
      />

      {profile.isError ? (
        <ErrorState
          title="Could not load your profile"
          message="Something went wrong while fetching your details. Please try again."
          requestId={profile.error.requestId}
          onRetry={() => void profile.refetch()}
        />
      ) : profile.isLoading || !data ? (
        <div className="space-y-4">
          <div className="skeleton h-40 w-full rounded-lg" />
          <div className="skeleton h-64 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ------------------------- institutional record ------------------------- */}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Institutional record</CardTitle>
                <Badge tone="neutral" className="gap-1">
                  <Lock className="size-3" aria-hidden />
                  Read only
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Maintained by your institution. Contact your department if something here is
                wrong.
              </p>
            </CardHeader>

            <CardContent>
              <DescriptionList
                items={[
                  { label: 'Name', value: account?.fullName },
                  { label: 'Email', value: account?.email },
                  { label: 'Roll number', value: data.rollNumber },
                  { label: 'Register number', value: data.registerNumber },
                  { label: 'Admission number', value: data.admissionNumber },
                  { label: 'Department', value: relationName(data.departmentId) },
                  { label: 'Batch', value: relationName(data.batchId) },
                  { label: 'Programme', value: data.programme },
                  { label: 'Section', value: data.section },
                  { label: 'Current semester', value: data.currentSemester },
                  { label: 'Admission date', value: formatDate(data.admissionDate) },
                  { label: 'Status', value: toTitleCase(data.status) },
                  { label: 'CGPA', value: data.academics.currentCgpa ?? '—' },
                  { label: 'Active backlogs', value: data.academics.activeBacklogs },
                ]}
              />
            </CardContent>
          </Card>

          {/* ------------------------------ own details ----------------------------- */}

          {isEditing ? (
            <ProfileForm
              profile={data}
              onSubmit={save}
              onCancel={() => setIsEditing(false)}
              isSaving={updateProfile.isPending}
            />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Personal information</CardTitle>
                </CardHeader>

                <CardContent>
                  <DescriptionList
                    items={[
                      { label: 'Mobile number', value: account?.phone },
                      {
                        label: 'Date of birth',
                        value: data.dateOfBirth ? formatDate(data.dateOfBirth) : null,
                      },
                      {
                        label: 'Gender',
                        value: data.gender ? toTitleCase(data.gender) : null,
                      },
                      { label: 'Blood group', value: data.bloodGroup },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Address</CardTitle>
                </CardHeader>

                <CardContent>
                  {data.address ? (
                    <DescriptionList
                      items={[
                        { label: 'Address line 1', value: data.address.line1 },
                        { label: 'Address line 2', value: data.address.line2 },
                        { label: 'City', value: data.address.city },
                        { label: 'District', value: data.address.district },
                        { label: 'State', value: data.address.state },
                        { label: 'PIN code', value: data.address.pincode },
                        { label: 'Country', value: data.address.country },
                      ]}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No address recorded.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Parent or guardian</CardTitle>
                </CardHeader>

                <CardContent>
                  {data.guardian ? (
                    <DescriptionList
                      items={[
                        { label: 'Parent name', value: data.guardian.name },
                        { label: 'Relation', value: data.guardian.relation },
                        { label: 'Parent mobile', value: data.guardian.phone },
                        { label: 'Parent email', value: data.guardian.email },
                      ]}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No guardian recorded.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Skills</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    A verified mark is added by your institution, not by you.
                  </p>
                </CardHeader>

                <CardContent>
                  {data.skills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No skills added yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {data.skills.map((skill) => (
                        <li key={skill.name}>
                          <Badge tone={skill.verified ? 'success' : 'neutral'} className="gap-1">
                            {skill.verified ? (
                              <ShieldCheck className="size-3" aria-hidden />
                            ) : null}
                            {skill.name}
                            <span className="opacity-70">· {toTitleCase(skill.level)}</span>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Portfolio links</CardTitle>
                </CardHeader>

                <CardContent>
                  <DescriptionList
                    items={[
                      { label: 'GitHub', value: data.portfolioLinks?.github },
                      { label: 'LinkedIn', value: data.portfolioLinks?.linkedin },
                      { label: 'Website', value: data.portfolioLinks?.portfolio },
                      {
                        label: 'Other',
                        value: data.portfolioLinks?.other?.length
                          ? data.portfolioLinks.other.join(', ')
                          : null,
                        full: true,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </RouteGuard>
  );
}

/** The saved values, in the shape the form produces, for change detection. */
function originalValues(profile: OwnStudentProfile): Record<string, unknown> {
  const account = typeof profile.userId === 'object' ? profile.userId : null;

  return {
    phone: account?.phone ?? null,
    dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth) : null,
    gender: profile.gender ?? null,
    bloodGroup: profile.bloodGroup ?? null,
    address: profile.address ?? null,
    guardian: profile.guardian ?? null,
    skills: profile.skills.map((skill) => ({ name: skill.name, level: skill.level })),
    portfolioLinks: profile.portfolioLinks
      ? {
          github: profile.portfolioLinks.github ?? null,
          linkedin: profile.portfolioLinks.linkedin ?? null,
          portfolio: profile.portfolioLinks.portfolio ?? null,
          other: profile.portfolioLinks.other ?? [],
        }
      : null,
  };
}
