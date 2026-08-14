'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerStudentSchema, type RegisterStudentInput } from '@peacefic/shared';
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, Phone, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPost } from '@/lib/api-client';

/** `POST /auth/register/student` answers with this. No session is created. */
interface RegisterResult {
  email: string;
  message: string;
}

/**
 * Student self-registration by join code.
 *
 * The college is resolved server-side from the join code; nothing here sends a
 * college id, so this form cannot be pointed at another institution.
 *
 * Validation comes from `registerStudentSchema`, the same object the server
 * validates against, so the rules cannot drift. The password/confirm match is
 * part of that schema's `refine`, not re-implemented here.
 *
 * The success state is careful not to imply access has been granted: two
 * separate gates remain, and saying so here prevents the most common support
 * question after registering.
 */
export default function StudentRegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RegisterResult | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStudentInput>({
    resolver: zodResolver(registerStudentSchema),
    defaultValues: {
      joinCode: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      rollNumber: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await apiPost<RegisterResult>('/auth/register/student', values);
      setSubmitted(result);
    } catch (error) {
      if (error instanceof ApiError) {
        // Field-level messages land on their field — including the server's
        // "invalid join code", which is one message for every reason a code
        // might not resolve.
        if (error.details.length > 0) {
          for (const detail of error.details) {
            setError(detail.field as keyof RegisterStudentInput, { message: detail.message });
          }
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  });

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-subtle text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Registration submitted</h1>
          <p className="text-sm text-muted-foreground">{submitted.message}</p>
        </div>

        <Alert tone="info" title="Two steps remain">
          <ol className="list-inside list-decimal space-y-1 text-sm">
            <li>
              Verify your email — we sent a code to{' '}
              <span className="font-medium">{submitted.email}</span>.
            </li>
            <li>Wait for your college administrator to approve your registration.</li>
          </ol>
          <p className="mt-2 text-sm">You cannot sign in until both are complete.</p>
        </Alert>

        {/* The code is bound to the address, not to a link, so the email is
            carried across and the next step is one click rather than a hunt. */}
        <Button asChild block>
          <Link href={`/verify-email?email=${encodeURIComponent(submitted.email)}`}>
            Verify my email
          </Link>
        </Button>

        <Button asChild block variant="outline">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Register as a student</h1>
        <p className="text-sm text-muted-foreground">
          Use the join code from your institution. Your email is verified first, then your college
          administrator approves your registration.
        </p>
      </header>

      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Join code"
          error={errors.joinCode?.message}
          hint="Ask your college administrator if you do not have one."
          required
        >
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={id}
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="pl-9"
                {...register('joinCode')}
              />
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message} required>
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={id}
                  autoComplete="given-name"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="pl-9"
                  {...register('firstName')}
                />
              </div>
            )}
          </Field>

          <Field label="Last name" error={errors.lastName?.message} required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                autoComplete="family-name"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...register('lastName')}
              />
            )}
          </Field>
        </div>

        <Field label="Email address" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={id}
                type="email"
                autoComplete="email"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="pl-9"
                {...register('email')}
              />
            </div>
          )}
        </Field>

        <Field label="Mobile number" error={errors.phone?.message} required>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={id}
                type="tel"
                autoComplete="tel"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="pl-9"
                {...register('phone')}
              />
            </div>
          )}
        </Field>

        <Field
          label="Roll number"
          error={errors.rollNumber?.message}
          hint="As issued by your college."
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...register('rollNumber')}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password?.message} required>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={id}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="pl-9 pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <Field label="Confirm password" error={errors.confirmPassword?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...register('confirmPassword')}
            />
          )}
        </Field>

        <Button type="submit" block isLoading={isSubmitting} loadingText="Submitting…">
          Submit registration
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Registering an institution instead?{' '}
        <Link href="/register/institution" className="font-medium text-primary hover:underline">
          Register a college
        </Link>
      </p>
    </div>
  );
}
