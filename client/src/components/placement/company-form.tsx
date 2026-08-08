'use client';

import { createCompanySchema, type CreateCompanyInput } from '@peacefic/shared';
import { Plus, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, type DefaultValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { ZodType } from 'zod';

import {
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiForm } from '@/hooks/use-api-form';
import type { FormDefaults } from '@/lib/form-types';
import { COMPANY_SIZE_OPTIONS, COMPANY_TYPE_OPTIONS } from '@/lib/placement-display';
import { cn } from '@/lib/utils';

export type CompanyFormValues = CreateCompanyInput;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: FormDefaults<CompanyFormValues>;
  onSubmit: (values: CompanyFormValues) => Promise<unknown>;
  redirectTo?: string;
}

const EMPTY_CONTACT = {
  name: '',
  designation: '',
  email: '',
  phone: '',
  isPrimary: false,
};

export function CompanyForm({
  mode,
  defaultValues,
  onSubmit,
  redirectTo = '/college/placements/companies',
}: Props) {
  const router = useRouter();

  const { form, formError, requestId, handleSubmit, isSubmitting } = useApiForm<CompanyFormValues>({
    schema: createCompanySchema as unknown as ZodType<CompanyFormValues>,
    defaultValues: {
      name: '',
      legalName: '',
      logoUrl: null,
      logoKey: null,
      website: '',
      industry: '',
      companyType: 'product',
      sizeRange: '',
      headquarters: '',
      locations: [],
      description: '',
      email: '',
      phone: '',
      contacts: [],
      ...defaultValues,
    } as DefaultValues<CompanyFormValues>,
    onSubmit,
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Company added.' : 'Changes saved.');
      router.push(redirectTo);
    },
  });

  const contacts = useFieldArray({ control: form.control, name: 'contacts' as never });
  const watchedContacts = (form.watch('contacts') ?? []) as CompanyFormValues['contacts'];

  const contactsError = form.formState.errors.contacts;
  const contactsMessage =
    contactsError && 'message' in contactsError
      ? (contactsError.message as string | undefined)
      : undefined;

  /**
   * Exactly one primary, enforced here as well as by the schema: a radio-style
   * toggle is clearer than letting the user tick two and be refused on submit.
   */
  function makePrimary(index: number): void {
    watchedContacts.forEach((_, position) => {
      form.setValue(`contacts.${position}.isPrimary` as never, (position === index) as never, {
        shouldDirty: true,
      });
    });
  }

  /** Comma-separated in the input, an array on the wire. */
  const locationsValue = ((form.watch('locations') ?? []) as string[]).join(', ');

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
        <FormSection title="Company">
          <TextField
            form={form}
            name="name"
            label="Trading name"
            required
            placeholder="Acme Technologies"
            hint="Unique within your college, ignoring case."
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="legalName"
            label="Registered name"
            placeholder="Acme Technologies Private Limited"
            hint="Only where it differs from the trading name."
          />
          <TextField
            form={form}
            name="industry"
            label="Industry"
            required
            placeholder="Information Technology"
          />
          <SelectField
            form={form}
            name="companyType"
            label="Type"
            required
            options={COMPANY_TYPE_OPTIONS}
          />
          <SelectField
            form={form}
            name="sizeRange"
            label="Headcount"
            placeholder="Not recorded"
            options={COMPANY_SIZE_OPTIONS}
          />
          <TextField
            form={form}
            name="website"
            label="Website"
            type="url"
            placeholder="https://acme.example.com"
          />
          <TextField
            form={form}
            name="headquarters"
            label="Headquarters"
            placeholder="Bengaluru"
          />

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Recruiting locations</span>
              <input
                type="text"
                defaultValue={locationsValue}
                placeholder="Bengaluru, Hyderabad, Pune"
                onChange={(event) =>
                  form.setValue(
                    'locations',
                    event.target.value
                      .split(',')
                      .map((entry) => entry.trim())
                      .filter(Boolean) as never,
                    { shouldDirty: true },
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="block text-xs text-muted-foreground">
                Separate with commas. Where the company actually hires, if not the headquarters.
              </span>
            </label>
          </div>

          <TextAreaField
            form={form}
            name="description"
            label="About"
            rows={4}
            maxLength={5000}
            placeholder="What the company does, and what students should know before applying."
            className="sm:col-span-2 lg:col-span-3"
          />
        </FormSection>

        <FormSection
          title="Switchboard"
          description="General details for the company, distinct from any individual recruiter. Hidden from students."
        >
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            placeholder="careers@acme.example.com"
          />
          <TextField form={form} name="phone" label="Phone" placeholder="+919876500001" />
        </FormSection>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recruiter contacts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Never shown to students — these details were given to the placement office.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              contacts.append({
                ...EMPTY_CONTACT,
                // The first contact added is the one to call.
                isPrimary: watchedContacts.length === 0,
              } as never)
            }
          >
            <Plus aria-hidden />
            Add contact
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {contactsMessage ? (
            <Alert tone="danger" title="Fix the contacts">
              {contactsMessage}
            </Alert>
          ) : null}

          {contacts.fields.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No contacts yet. A drive is much easier to run with a named recruiter.
            </p>
          ) : (
            contacts.fields.map((field, index) => (
              <div
                key={field.id}
                className={cn(
                  'grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-5',
                  watchedContacts[index]?.isPrimary
                    ? 'border-primary/40 bg-primary-subtle/40'
                    : 'border-border',
                )}
              >
                <TextField
                  form={form}
                  name={`contacts.${index}.name` as never}
                  label="Name"
                  required
                  placeholder="Priya Menon"
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.designation` as never}
                  label="Designation"
                  placeholder="Talent Acquisition Lead"
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.email` as never}
                  label="Email"
                  required
                  type="email"
                  placeholder="priya@acme.example.com"
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.phone` as never}
                  label="Phone"
                  required
                  placeholder="+919876500002"
                />

                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant={watchedContacts[index]?.isPrimary ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => makePrimary(index)}
                    title="The first person to contact about a drive"
                  >
                    <Star aria-hidden />
                    {watchedContacts[index]?.isPrimary ? 'Primary' : 'Make primary'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => contacts.remove(index)}
                    aria-label={`Remove contact ${index + 1}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface/95 p-4 shadow-raised backdrop-blur">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting} loadingText="Saving">
          {mode === 'create' ? 'Add company' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
