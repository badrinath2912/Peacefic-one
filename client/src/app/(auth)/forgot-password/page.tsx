'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@peacefic/shared';
import { ArrowLeft, MailCheck, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPost } from '@/lib/api-client';

/**
 * Requesting a password reset.
 *
 * The server answers identically whether or not the address is registered —
 * "If an account exists…" — because distinguishing would hand over an account
 * enumeration oracle. This page repeats that wording rather than softening it
 * into something that implies the address was found.
 *
 * A successful request emails two things: a six-digit code, and a link to
 * `/reset-password?token=…`. Both are needed to complete the reset.
 */
export default function ForgotPasswordPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    // The same schema the server validates against, so the rules cannot drift.
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiPost('/auth/forgot-password', values);
      setSentTo(values.email);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isValidationError && error.details.length > 0) {
          for (const detail of error.details) {
            setError(detail.field as keyof ForgotPasswordInput, { message: detail.message });
          }
          return;
        }

        // Covers the rate limiter, which answers 429 with its own message.
        setFormError(error.message);
        return;
      }

      setFormError('Something went wrong. Please try again.');
    }
  });

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-info-subtle text-info">
            <MailCheck className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        </div>

        <Alert tone="info">
          If an account exists for{' '}
          <span className="font-medium text-foreground">{sentTo}</span>, we have sent a reset code
          and a link to set a new password. You will need both.
        </Alert>

        <p className="text-center text-sm text-muted-foreground">
          The code expires shortly. If nothing arrives, check your spam folder before requesting
          another.
        </p>

        <Button variant="outline" block asChild>
          <Link href="/login">
            <ArrowLeft aria-hidden />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your registered email address and we will send you a code and a link to set a new
          password.
        </p>
      </header>

      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email address" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              leadingIcon={<Mail />}
              invalid={invalid}
              aria-describedby={describedBy}
              {...register('email')}
            />
          )}
        </Field>

        <Button type="submit" block isLoading={isSubmitting} loadingText="Sending">
          Send reset instructions
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
