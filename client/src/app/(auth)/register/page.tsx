'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  COLLEGE_TYPE,
  registerCollegeSchema,
  type RegisterCollegeInput,
} from '@peacefic/shared';
import { Building2, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, type DefaultValues, type FieldPath } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, apiPost } from '@/lib/api-client';
import { toTitleCase } from '@/lib/utils';

const TYPE_OPTIONS = COLLEGE_TYPE.map((value) => ({ value, label: toTitleCase(value) }));

/** What `POST /auth/register/college` answers with — no session is created. */
interface RegisterResult {
  email: string;
  message: string;
}

/**
 * Institution registration.
 *
 * Registers a college and its first administrator through the existing
 * `POST /auth/register/college`. That endpoint deliberately does **not** sign
 * anyone in: it returns a confirmation, the address must be verified by email,
 * and a reviewer then approves the institution. The page mirrors that — success
 * shows what happens next rather than redirecting into a portal the account
 * cannot reach yet.
 *
 * There is no student self-registration endpoint on the server, so this route
 * is institution-only. `AuthLayout` wraps it in `GuestGuard`, which keeps a
 * signed-in user out.
 */
export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterCollegeInput>({
    // The same schema the server validates against, so the rules cannot drift.
    resolver: zodResolver(registerCollegeSchema),
    defaultValues: {
      college: {
        name: '',
        code: '',
        type: 'engineering',
        affiliatedTo: '',
        website: '',
        email: '',
        phone: '',
        address: { line1: '', line2: '', city: '', district: '', state: '', country: 'India', pincode: '' },
      },
      admin: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        designation: '',
        password: '',
        confirmPassword: '',
      },
      // `acceptTerms` is a `z.literal(true)`, so an unchecked box is the
      // schema's own failure case rather than something to special-case here.
      acceptTerms: false,
      // Cast because the schema's output type fixes `acceptTerms` to `true`,
      // which an empty form legitimately is not yet.
    } as unknown as DefaultValues<RegisterCollegeInput>,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const created = await apiPost<RegisterResult>('/auth/register/college', values);
      setResult(created);
    } catch (error) {
      if (error instanceof ApiError) {
        // The server returns `details[].field` using the same dotted paths as
        // the shared schema, so a duplicate code lands on the code input.
        if (error.details.length > 0) {
          const mappable = error.details.filter((detail) => detail.field && detail.field !== '_root');

          if (mappable.length > 0) {
            for (const detail of mappable) {
              setError(detail.field as FieldPath<RegisterCollegeInput>, {
                message: detail.message,
              });
            }
            return;
          }
        }

        setFormError(error.message);
        return;
      }

      setFormError('Something went wrong. Please try again.');
    }
  });

  if (result) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success-subtle text-success">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Registration received</h1>
        </div>

        <Alert tone="info" title="Two things happen next">
          {result.message}
        </Alert>

        <p className="text-center text-sm text-muted-foreground">
          We sent a verification code to <span className="font-medium text-foreground">{result.email}</span>.
        </p>

        <Button asChild block>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Register your institution</h1>
        <p className="text-sm text-muted-foreground">
          Create the institution and its first administrator. Your email is verified first, then a
          reviewer approves the institution.
        </p>
      </header>

      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        {/* ------------------------------ institution ----------------------------- */}

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
            Institution
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Institution name"
              error={errors.college?.name?.message}
              required
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="PIT Institute of Technology"
                  {...register('college.name')}
                />
              )}
            </Field>

            <Field
              label="Institution code"
              error={errors.college?.code?.message}
              hint="2–20 uppercase letters or digits."
              required
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="PIT"
                  autoCapitalize="characters"
                  {...register('college.code')}
                />
              )}
            </Field>

            <Field label="Type" error={errors.college?.type?.message} required>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  options={TYPE_OPTIONS}
                  {...register('college.type')}
                />
              )}
            </Field>

            <Field
              label="Year established"
              error={errors.college?.establishedYear?.message}
              required
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="2001"
                  // Empty reads as "not answered" rather than NaN, so the
                  // schema reports a required field instead of a type error.
                  {...register('college.establishedYear', {
                    setValueAs: (value) => (value === '' ? undefined : Number(value)),
                  })}
                />
              )}
            </Field>

            <Field label="Affiliated to" error={errors.college?.affiliatedTo?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Anna University"
                  {...register('college.affiliatedTo')}
                />
              )}
            </Field>

            <Field label="Institution email" error={errors.college?.email?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  leadingIcon={<Mail />}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="info@college.edu"
                  {...register('college.email')}
                />
              )}
            </Field>

            <Field
              label="Institution phone"
              error={errors.college?.phone?.message}
              hint="Include the country code."
              required
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="tel"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="+919876543210"
                  {...register('college.phone')}
                />
              )}
            </Field>

            <Field
              label="Website"
              error={errors.college?.website?.message}
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="url"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="https://college.edu"
                  {...register('college.website')}
                />
              )}
            </Field>
          </div>
        </section>

        {/* -------------------------------- address ------------------------------- */}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Address</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Address line 1"
              error={errors.college?.address?.line1?.message}
              required
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="1 Campus Road"
                  {...register('college.address.line1')}
                />
              )}
            </Field>

            <Field
              label="Address line 2"
              error={errors.college?.address?.line2?.message}
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...register('college.address.line2')}
                />
              )}
            </Field>

            <Field label="City" error={errors.college?.address?.city?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Coimbatore"
                  {...register('college.address.city')}
                />
              )}
            </Field>

            <Field label="District" error={errors.college?.address?.district?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...register('college.address.district')}
                />
              )}
            </Field>

            <Field label="State" error={errors.college?.address?.state?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Tamil Nadu"
                  {...register('college.address.state')}
                />
              )}
            </Field>

            <Field label="Country" error={errors.college?.address?.country?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...register('college.address.country')}
                />
              )}
            </Field>

            <Field label="PIN code" error={errors.college?.address?.pincode?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="641004"
                  {...register('college.address.pincode')}
                />
              )}
            </Field>
          </div>
        </section>

        {/* ----------------------------- administrator ---------------------------- */}

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <User className="size-4 text-muted-foreground" aria-hidden />
            Administrator account
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.admin?.firstName?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="given-name"
                  {...register('admin.firstName')}
                />
              )}
            </Field>

            <Field label="Last name" error={errors.admin?.lastName?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="family-name"
                  {...register('admin.lastName')}
                />
              )}
            </Field>

            <Field
              label="Work email"
              error={errors.admin?.email?.message}
              hint="Verification is sent here, and this becomes the sign-in address."
              required
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  leadingIcon={<Mail />}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="email"
                  placeholder="you@college.edu"
                  {...register('admin.email')}
                />
              )}
            </Field>

            <Field label="Mobile number" error={errors.admin?.phone?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="tel"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="tel"
                  placeholder="+919812345678"
                  {...register('admin.phone')}
                />
              )}
            </Field>

            <Field label="Designation" error={errors.admin?.designation?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Registrar"
                  {...register('admin.designation')}
                />
              )}
            </Field>

            <Field
              label="Password"
              error={errors.admin?.password?.message}
              hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
              required
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  leadingIcon={<Lock />}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  trailingSlot={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  }
                  {...register('admin.password')}
                />
              )}
            </Field>

            <Field
              label="Confirm password"
              error={errors.admin?.confirmPassword?.message}
              required
              className="sm:col-span-2"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  leadingIcon={<Lock />}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  {...register('admin.confirmPassword')}
                />
              )}
            </Field>
          </div>
        </section>

        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby={errors.acceptTerms ? 'terms-error' : undefined}
              {...register('acceptTerms')}
            />
            <span>
              I confirm I am authorised to register this institution and accept the terms of use.
            </span>
          </label>

          {errors.acceptTerms?.message ? (
            <p id="terms-error" role="alert" className="text-xs text-danger">
              {errors.acceptTerms.message}
            </p>
          ) : null}

          <Button type="submit" block isLoading={isSubmitting} loadingText="Creating account">
            Create account
          </Button>
        </div>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
