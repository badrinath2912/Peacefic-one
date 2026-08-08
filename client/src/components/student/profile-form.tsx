'use client';

import {
  GENDER,
  SKILL_LEVEL,
  updateOwnStudentProfileSchema,
  type UpdateOwnStudentProfileInput,
} from '@peacefic/shared';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { DefaultValues } from 'react-hook-form';
import { z } from 'zod';

import type { OwnStudentProfile } from '@/api/queries';
import {
  CommaListField,
  DateField,
  FormSection,
  SelectField,
  TextField,
} from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useApiForm } from '@/hooks/use-api-form';
import { toTitleCase } from '@/lib/utils';

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: toTitleCase(value) }));

/** Text inputs always yield a string; the contract wants `null` for "not set". */
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/** True when every leaf of a nested group is blank, i.e. the group is unset. */
function isEmptyGroup(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  return Object.values(value as Record<string, unknown>).every(
    (leaf) => leaf === null || leaf === undefined || (typeof leaf === 'string' && leaf.trim() === ''),
  );
}

/**
 * The shared schema, with the normalisation a browser form needs in front of it.
 *
 * `<input>` gives back `''` for an untouched box, but the contract expects
 * `null` — and an all-blank address must collapse to "no address" rather than
 * failing every required line inside it. This adds no rule of its own: the
 * validation is still `updateOwnStudentProfileSchema`, and the server validates
 * it again regardless.
 */
const profileFormSchema = z.preprocess((raw) => {
  const input = { ...(raw as Record<string, unknown>) };

  for (const key of ['phone', 'bloodGroup', 'gender', 'dateOfBirth'] as const) {
    input[key] = blankToNull(input[key]);
  }

  for (const key of ['address', 'guardian'] as const) {
    if (isEmptyGroup(input[key])) input[key] = null;
    else {
      const group = { ...(input[key] as Record<string, unknown>) };
      for (const [leafKey, leaf] of Object.entries(group)) group[leafKey] = blankToNull(leaf);
      input[key] = group;
    }
  }

  if (input.portfolioLinks && typeof input.portfolioLinks === 'object') {
    const links = { ...(input.portfolioLinks as Record<string, unknown>) };
    for (const key of ['github', 'linkedin', 'portfolio'] as const) {
      links[key] = blankToNull(links[key]);
    }
    input.portfolioLinks = links;
  }

  // A row the student added and left blank is not a skill.
  if (Array.isArray(input.skills)) {
    input.skills = input.skills.filter(
      (skill) => typeof (skill as { name?: unknown }).name === 'string' && (skill as { name: string }).name.trim() !== '',
    );
  }

  return input;
}, updateOwnStudentProfileSchema);

export type ProfileFormValues = UpdateOwnStudentProfileInput;

/**
 * The editable half of the profile.
 *
 * Only the eight fields the server accepts are rendered. Institutional values
 * are shown elsewhere on the page as text, because they are not the student's
 * to change — and the server rejects them outright if they are sent anyway.
 */
export function ProfileForm({
  profile,
  onSubmit,
  onCancel,
  isSaving,
}: {
  profile: OwnStudentProfile;
  onSubmit: (values: ProfileFormValues) => Promise<unknown>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const account = typeof profile.userId === 'object' ? profile.userId : null;

  const { form, formError, requestId, handleSubmit } = useApiForm<ProfileFormValues>({
    schema: profileFormSchema as unknown as z.ZodType<ProfileFormValues>,
    defaultValues: {
      phone: account?.phone ?? '',
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
      gender: profile.gender ?? '',
      bloodGroup: profile.bloodGroup ?? '',
      address: {
        line1: profile.address?.line1 ?? '',
        line2: profile.address?.line2 ?? '',
        city: profile.address?.city ?? '',
        district: profile.address?.district ?? '',
        state: profile.address?.state ?? '',
        country: profile.address?.country ?? '',
        pincode: profile.address?.pincode ?? '',
      },
      guardian: {
        name: profile.guardian?.name ?? '',
        relation: profile.guardian?.relation ?? '',
        phone: profile.guardian?.phone ?? '',
        email: profile.guardian?.email ?? '',
      },
      // `verified` is deliberately dropped: the contract accepts name and level
      // only, and the server resets verification on any change.
      skills: profile.skills.map((skill) => ({ name: skill.name, level: skill.level })),
      portfolioLinks: {
        github: profile.portfolioLinks?.github ?? '',
        linkedin: profile.portfolioLinks?.linkedin ?? '',
        portfolio: profile.portfolioLinks?.portfolio ?? '',
        other: profile.portfolioLinks?.other ?? [],
      },
      // Through `unknown` because the form's input values are the strings an
      // `<input>` produces, while the schema's output type has already coerced
      // them — `dateOfBirth` is a string here and a `Date` after validation.
    } as unknown as DefaultValues<ProfileFormValues>,
    onSubmit,
  });

  const skills = (form.watch('skills') ?? []) as Array<{ name: string; level: string }>;
  const hadVerifiedSkill = profile.skills.some((skill) => skill.verified);

  function addSkill(): void {
    form.setValue('skills', [...skills, { name: '', level: 'beginner' }] as never, {
      shouldDirty: true,
    });
  }

  function removeSkill(index: number): void {
    form.setValue('skills', skills.filter((_, at) => at !== index) as never, {
      shouldDirty: true,
    });
  }

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
        <FormSection
          title="Personal information"
          description="Your institution keeps the rest of your record."
        >
          <TextField
            form={form}
            name="phone"
            label="Mobile number"
            type="tel"
            autoComplete="tel"
            placeholder="+919876543210"
            hint="Include the country code."
          />
          <DateField form={form} name="dateOfBirth" label="Date of birth" nullable />
          <SelectField
            form={form}
            name="gender"
            label="Gender"
            placeholder="Not specified"
            options={enumOptions(GENDER)}
          />
          <TextField
            form={form}
            name="bloodGroup"
            label="Blood group"
            placeholder="O+"
            maxLength={5}
          />
        </FormSection>

        <FormSection
          title="Address"
          description="Leave every box blank if you would rather not record an address."
        >
          <TextField
            form={form}
            name="address.line1"
            label="Address line 1"
            className="sm:col-span-2"
          />
          <TextField form={form} name="address.line2" label="Address line 2" />
          <TextField form={form} name="address.city" label="City" />
          <TextField form={form} name="address.district" label="District" />
          <TextField form={form} name="address.state" label="State" />
          <TextField
            form={form}
            name="address.pincode"
            label="PIN code"
            inputMode="numeric"
            maxLength={10}
          />
          <TextField form={form} name="address.country" label="Country" placeholder="India" />
        </FormSection>

        {/* Labels are prefixed so they read distinctly from the student's own
            contact details, both on screen and to a screen reader. */}
        <FormSection title="Parent or guardian">
          <TextField form={form} name="guardian.name" label="Parent name" />
          <TextField form={form} name="guardian.relation" label="Relation" placeholder="Father" />
          <TextField form={form} name="guardian.phone" label="Parent mobile" type="tel" />
          <TextField form={form} name="guardian.email" label="Parent email" type="email" />
        </FormSection>

        {/* ---------------------------------- skills --------------------------------- */}

        <section className="space-y-4 border-b border-border pb-6">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Skills</h2>
            <p className="text-xs text-muted-foreground">
              Up to 50. These appear to the placement office alongside your applications.
            </p>
          </div>

          {hadVerifiedSkill ? (
            <Alert tone="info" title="Editing your skills clears their verified mark">
              Verification is recorded by your institution, not by you. If you change this list,
              every skill returns to unverified until it is checked again.
            </Alert>
          ) : null}

          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills added yet.</p>
          ) : (
            <ul className="space-y-3">
              {skills.map((skill, index) => {
                const stored = profile.skills.find((entry) => entry.name === skill.name);

                return (
                  <li
                    key={index}
                    className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
                  >
                    <Field label={`Skill ${index + 1}`}>
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          aria-describedby={describedBy}
                          invalid={invalid}
                          placeholder="React"
                          maxLength={60}
                          {...form.register(`skills.${index}.name` as never)}
                        />
                      )}
                    </Field>

                    <Field label="Level">
                      {({ id, describedBy }) => (
                        <Select
                          id={id}
                          aria-describedby={describedBy}
                          options={enumOptions(SKILL_LEVEL)}
                          {...form.register(`skills.${index}.level` as never)}
                        />
                      )}
                    </Field>

                    <div className="flex items-center gap-2">
                      {/* Read-only: the student cannot grant this to themselves. */}
                      {stored?.verified ? (
                        <Badge tone="success" className="gap-1">
                          <ShieldCheck className="size-3" aria-hidden />
                          Verified
                        </Badge>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSkill(index)}
                        aria-label={`Remove skill ${index + 1}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {skills.length < 50 ? (
            <Button type="button" variant="outline" size="sm" onClick={addSkill}>
              <Plus aria-hidden />
              Add skill
            </Button>
          ) : null}
        </section>

        <FormSection title="Portfolio links" description="Full URLs, including https://.">
          <TextField
            form={form}
            name="portfolioLinks.github"
            label="GitHub"
            type="url"
            placeholder="https://github.com/username"
          />
          <TextField
            form={form}
            name="portfolioLinks.linkedin"
            label="LinkedIn"
            type="url"
            placeholder="https://linkedin.com/in/username"
          />
          <TextField
            form={form}
            name="portfolioLinks.portfolio"
            label="Website"
            type="url"
            placeholder="https://example.com"
          />
          <CommaListField
            form={form}
            name="portfolioLinks.other"
            label="Other links"
            placeholder="https://one.com, https://two.com"
            hint="Separate with commas. Up to five."
            className="sm:col-span-2"
          />
        </FormSection>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSaving} loadingText="Saving">
          Save changes
        </Button>
      </div>
    </form>
  );
}
