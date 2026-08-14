'use client';

import {
  COLLEGE_TYPE,
  GRADING_SCALE,
  updateCollegeSchema,
  updateCollegeSettingsSchema,
  type UpdateCollegeInput,
  type UpdateCollegeSettingsInput,
} from '@peacefic/shared';
import { Building2, Info, Lock, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { DefaultValues } from 'react-hook-form';
import type { ZodType } from 'zod';

import {
  useJoinCode,
  useOwnCollege,
  useRegenerateJoinCode,
  useUpdateCollege,
  useUpdateCollegeSettings,
  type OwnCollege,
} from '@/api/college-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { NumberField, SelectField, TextField, FormSection } from '@/components/form/form-field';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { ErrorState } from '@/components/ui/empty-state';
import { useApiForm } from '@/hooks/use-api-form';
import { can } from '@/lib/permissions';
import { toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((label, index) => ({ value: String(index + 1), label }));

/**
 * The institution's own profile and settings.
 *
 * Two forms rather than one, because the API separates them and so does the
 * permission catalogue: `college:update` covers the profile, `college:settings`
 * covers the settings. Someone may hold one and not the other, so each form is
 * gated independently and falls back to a read-only view.
 *
 * `code` and `status` are shown but never editable — the code is the tenant's
 * identity, fixed at registration, and approval status belongs to the platform.
 * `joinCode` appears nowhere: it never leaves the server.
 */
export default function CollegeSettingsPage() {
  const { user } = useAuth();

  const mayRead = can(user?.permissions, 'college:read');
  const mayUpdate = can(user?.permissions, 'college:update');
  const maySettings = can(user?.permissions, 'college:settings');

  const college = useOwnCollege(mayRead);
  const data = college.data;

  return (
    <RouteGuard permissions={['college:read']}>
      <PageHeader
        title="Institution settings"
        description="Your institution's details, and the rules that apply across it."
      />

      {college.isError ? (
        <ErrorState
          title="Could not load your institution"
          message="Something went wrong while fetching it. Please try again."
          requestId={college.error.requestId}
          onRetry={() => void college.refetch()}
        />
      ) : college.isLoading || !data ? (
        <div className="space-y-4">
          <div className="skeleton h-32 w-full rounded-lg" />
          <div className="skeleton h-96 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          <IdentityCard college={data} />

          {mayUpdate ? (
            <ProfileForm college={data} />
          ) : (
            <ReadOnlyProfile college={data} />
          )}

          {maySettings ? (
            <SettingsForm college={data} />
          ) : (
            <ReadOnlySettings college={data} />
          )}

          {/* Gated on the same permission as the endpoint. A reader without
              `college:settings` never issues the request at all. */}
          {maySettings ? <JoinCodeCard enabled={maySettings} /> : null}
        </div>
      )}
    </RouteGuard>
  );
}

/* --------------------------------- identity -------------------------------- */

function IdentityCard({ college }: { college: OwnCollege }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Registration</CardTitle>
          <Badge tone="neutral" className="gap-1">
            <Lock className="size-3" aria-hidden />
            Read only
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Set when your institution registered. Contact support if any of this is wrong.
        </p>
      </CardHeader>

      <CardContent>
        <DescriptionList
          items={[
            { label: 'Institution code', value: college.code },
            { label: 'Status', value: toTitleCase(college.status) },
            { label: 'Students', value: college.stats.totalStudents },
            { label: 'Faculty', value: college.stats.totalFaculty },
            { label: 'Departments', value: college.stats.totalDepartments },
            { label: 'Batches', value: college.stats.totalBatches },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/* --------------------------------- profile --------------------------------- */

function ProfileForm({ college }: { college: OwnCollege }) {
  const update = useUpdateCollege();

  const { form, formError, requestId, handleSubmit } = useApiForm<UpdateCollegeInput>({
    schema: updateCollegeSchema as unknown as ZodType<UpdateCollegeInput>,
    defaultValues: {
      name: college.name,
      type: college.type,
      affiliatedTo: college.affiliatedTo ?? '',
      establishedYear: college.establishedYear,
      website: college.website ?? '',
      email: college.email,
      phone: college.phone,
      timezone: college.timezone,
      academicYearStartMonth: college.academicYearStartMonth,
      address: {
        line1: college.address.line1,
        line2: college.address.line2 ?? '',
        city: college.address.city,
        district: college.address.district ?? '',
        state: college.address.state,
        country: college.address.country,
        pincode: college.address.pincode,
      },
      primaryContact: { ...college.primaryContact },
    } as unknown as DefaultValues<UpdateCollegeInput>,
    onSubmit: (values) => update.mutateAsync(values),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4" aria-hidden />
          Institution details
        </CardTitle>
      </CardHeader>

      <CardContent>
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

          <FormSection title="Identity">
            <TextField form={form} name="name" label="Institution name" required />
            <SelectField form={form} name="type" label="Type" options={enumOptions(COLLEGE_TYPE)} />
            <TextField form={form} name="affiliatedTo" label="Affiliated to" />
            <NumberField form={form} name="establishedYear" label="Year established" required />
            <TextField form={form} name="website" label="Website" type="url" />
          </FormSection>

          {/* Labelled distinctly from the primary contact's details below, so
              the two email and phone fields never share an accessible name. */}
          <FormSection title="Contact">
            <TextField form={form} name="email" label="Institution email" type="email" required />
            <TextField form={form} name="phone" label="Institution phone" type="tel" required />
          </FormSection>

          <FormSection title="Address">
            <TextField form={form} name="address.line1" label="Address line 1" required />
            <TextField form={form} name="address.line2" label="Address line 2" />
            <TextField form={form} name="address.city" label="City" required />
            <TextField form={form} name="address.district" label="District" />
            <TextField form={form} name="address.state" label="State" required />
            <TextField form={form} name="address.pincode" label="PIN code" inputMode="numeric" required />
            <TextField form={form} name="address.country" label="Country" required />
          </FormSection>

          <FormSection
            title="Academic calendar"
            description="Which month a new academic year begins, and the timezone dates are shown in."
          >
            <SelectField
              form={form}
              name="academicYearStartMonth"
              label="Academic year starts"
              options={MONTHS}
            />
            <TextField form={form} name="timezone" label="Timezone" required />
          </FormSection>

          <FormSection title="Primary contact">
            <TextField form={form} name="primaryContact.name" label="Contact name" required />
            <TextField form={form} name="primaryContact.designation" label="Designation" required />
            <TextField
              form={form}
              name="primaryContact.email"
              label="Contact email"
              type="email"
              required
            />
            <TextField
              form={form}
              name="primaryContact.phone"
              label="Contact phone"
              type="tel"
              required
            />
          </FormSection>

          <Button type="submit" isLoading={update.isPending} loadingText="Saving">
            Save institution details
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReadOnlyProfile({ college }: { college: OwnCollege }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Institution details</CardTitle>
          <Badge tone="neutral">View only</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <DescriptionList
          items={[
            { label: 'Name', value: college.name },
            { label: 'Type', value: toTitleCase(college.type) },
            { label: 'Affiliated to', value: college.affiliatedTo },
            { label: 'Established', value: college.establishedYear },
            { label: 'Email', value: college.email },
            { label: 'Phone', value: college.phone },
            { label: 'Website', value: college.website },
            { label: 'Timezone', value: college.timezone },
            {
              label: 'Address',
              value: [college.address.line1, college.address.city, college.address.state]
                .filter(Boolean)
                .join(', '),
              full: true,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/* --------------------------------- settings -------------------------------- */

function SettingsForm({ college }: { college: OwnCollege }) {
  const update = useUpdateCollegeSettings();

  const { form, formError, requestId, handleSubmit } = useApiForm<UpdateCollegeSettingsInput>({
    schema: updateCollegeSettingsSchema as unknown as ZodType<UpdateCollegeSettingsInput>,
    defaultValues: {
      allowStudentSelfRegistration: college.settings.allowStudentSelfRegistration,
      attendanceThresholdPercent: college.settings.attendanceThresholdPercent,
      gradingScale: college.settings.gradingScale,
      certificateSignatory: {
        name: college.settings.certificateSignatory?.name ?? '',
        designation: college.settings.certificateSignatory?.designation ?? '',
      },
    } as unknown as DefaultValues<UpdateCollegeSettingsInput>,
    onSubmit: (values) => update.mutateAsync(values),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Institution settings
        </CardTitle>
      </CardHeader>

      <CardContent>
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

          {/* Both of these reinterpret existing records, so say so plainly. */}
          <Alert tone="warning" title="These apply across the whole institution">
            Raising the attendance threshold changes who counts as a defaulter immediately. Changing
            the grading scale affects how future results are calculated.
          </Alert>

          <FormSection title="Academic rules">
            <NumberField
              form={form}
              name="attendanceThresholdPercent"
              label="Attendance threshold (%)"
              hint="Students below this are flagged as defaulters."
              required
            />
            <SelectField
              form={form}
              name="gradingScale"
              label="Grading scale"
              options={enumOptions(GRADING_SCALE)}
            />
          </FormSection>

          <FormSection
            title="Certificates"
            description="Printed on certificates your institution issues."
          >
            <TextField form={form} name="certificateSignatory.name" label="Signatory name" />
            <TextField
              form={form}
              name="certificateSignatory.designation"
              label="Signatory designation"
            />
          </FormSection>

          <section className="space-y-3 border-b border-border pb-6 last:border-0 last:pb-0">
            <h2 className="text-sm font-semibold">Enrolment</h2>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                {...form.register('allowStudentSelfRegistration')}
              />
              <span>
                Allow students to register themselves
                <span className="block text-xs text-muted-foreground">
                  Students join using your institution&apos;s private join code, which is never
                  displayed here.
                </span>
              </span>
            </label>
          </section>

          <Button type="submit" isLoading={update.isPending} loadingText="Saving">
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReadOnlySettings({ college }: { college: OwnCollege }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Institution settings</CardTitle>
          <Badge tone="neutral">View only</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <DescriptionList
          items={[
            {
              label: 'Attendance threshold',
              value: `${college.settings.attendanceThresholdPercent}%`,
            },
            { label: 'Grading scale', value: toTitleCase(college.settings.gradingScale) },
            {
              label: 'Student self-registration',
              value: college.settings.allowStudentSelfRegistration ? 'Allowed' : 'Not allowed',
            },
            { label: 'Certificate signatory', value: college.settings.certificateSignatory?.name },
          ]}
        />

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Only an administrator can change these.</span>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The join code students type on the public registration page.
 *
 * Fetched from its own endpoint rather than `GET /colleges/me`, because the code
 * carries `select: false` and is deliberately absent from every ordinary read of
 * a college. This is the one screen that asks for it.
 *
 * It is shown only when self-registration is switched on: a code that nobody can
 * use would invite support questions, and `findByJoinCode` refuses it anyway.
 */
function JoinCodeCard({ enabled }: { enabled: boolean }) {
  const joinCode = useJoinCode(enabled);
  const regenerate = useRegenerateJoinCode();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const data = joinCode.data;

  /**
   * `navigator.clipboard` exists only in a secure context — HTTPS or
   * `localhost`. Opening the portal on a LAN address such as
   * `http://192.168.1.15:3000` is neither, so the API is simply `undefined`
   * there and the button appeared to do nothing at all.
   *
   * The fallback is the old `execCommand('copy')` route, which has no such
   * requirement. It is deprecated but still universally implemented, and this
   * is exactly the case it still covers. If both fail the code stays selectable
   * on screen and the button says so, rather than failing silently.
   */
  const copy = async () => {
    if (!data?.joinCode) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.joinCode);
      } else {
        const field = document.createElement('textarea');
        field.value = data.joinCode;
        // Kept out of view and off the tab order, but still selectable, which
        // `execCommand` requires.
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();

        const ok = document.execCommand('copy');
        document.body.removeChild(field);
        if (!ok) throw new Error('execCommand returned false');
      }

      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }

    setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student join code</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {joinCode.isLoading ? (
          <div className="skeleton h-16 w-full rounded-lg" />
        ) : joinCode.isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load the join code. Please try again.
          </p>
        ) : (
          <>
            {!data?.allowStudentSelfRegistration ? (
              <Alert tone="warning" title="Self-registration is switched off">
                <p className="text-sm">
                  Turn on <span className="font-medium">Allow student self-registration</span> in
                  the settings above. Until then the join code will not work, even if it is shared.
                </p>
              </Alert>
            ) : null}

            <div>
              <p className="text-xs text-muted-foreground">Current code</p>
              {data?.joinCode ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="select-all rounded-md bg-muted px-3 py-2 font-mono text-lg font-semibold tracking-widest">
                    {data.joinCode}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => void copy()}>
                    {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Select it manually' : 'Copy'}
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No code has been issued yet. Generate one to let students register themselves.
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Students enter this at <span className="font-medium">/register/student</span>. Each
              registration still needs email verification and your approval before the student can
              sign in.
            </p>

            <div className="flex items-center gap-2 border-t pt-4">
              <Button
                variant={data?.joinCode ? 'outline' : 'primary'}
                size="sm"
                isLoading={regenerate.isPending}
                onClick={() => regenerate.mutate()}
              >
                {data?.joinCode ? 'Generate a new code' : 'Generate join code'}
              </Button>
              {data?.joinCode ? (
                <p className="text-xs text-muted-foreground">
                  The current code stops working immediately.
                </p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
