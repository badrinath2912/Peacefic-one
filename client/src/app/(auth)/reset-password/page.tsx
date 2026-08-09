'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@peacefic/shared';
import { CheckCircle2, Eye, EyeOff, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPost } from '@/lib/api-client';

/**
 * Completing a password reset.
 *
 * The reset is two-factor by design: the emailed link carries a signed token and
 * the email separately carries a six-digit code. `AuthService.resetPassword`
 * checks both, so the form asks for the code and reads the token from the query
 * string — the same URL `forgotPassword` builds.
 *
 * The token is kept in a registered hidden field rather than component state or
 * storage: it goes straight into the request body and is never logged, echoed
 * back, or persisted.
 */
export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    // The same schema the server validates against, so the rules cannot drift.
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, otp: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiPost('/auth/reset-password', values);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.details.length > 0) {
          const mappable = error.details.filter((detail) => detail.field && detail.field !== '_root');

          if (mappable.length > 0) {
            for (const detail of mappable) {
              setError(detail.field as keyof ResetPasswordInput, { message: detail.message });
            }
            return;
          }
        }

        // An expired or reused link arrives here as an authentication error.
        setFormError(error.message);
        return;
      }

      setFormError('Something went wrong. Please try again.');
    }
  });

  /* A link with no token cannot be completed, so say so rather than fail on submit. */
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-danger-subtle text-danger">
            <TriangleAlert className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">This link is incomplete</h1>
        </div>

        <Alert tone="danger">
          The reset link is missing its token. Open the most recent link from your email, or request
          a new one.
        </Alert>

        <Button block asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success-subtle text-success">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Password reset</h1>
        </div>

        <Alert tone="success">
          Your password has been changed and every device has been signed out. Sign in again with
          your new password.
        </Alert>

        <Button block asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Enter the six-digit code from your email along with your new password.
        </p>
      </header>

      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Carried straight from the URL into the body — never displayed. */}
        <input type="hidden" {...register('token')} />

        <Field label="Reset code" error={errors.otp?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              invalid={invalid}
              aria-describedby={describedBy}
              {...register('otp')}
            />
          )}
        </Field>

        <Field
          label="New password"
          error={errors.newPassword?.message}
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              leadingIcon={<Lock />}
              invalid={invalid}
              aria-describedby={describedBy}
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
              {...register('newPassword')}
            />
          )}
        </Field>

        <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              leadingIcon={<Lock />}
              invalid={invalid}
              aria-describedby={describedBy}
              {...register('confirmPassword')}
            />
          )}
        </Field>

        <Button type="submit" block isLoading={isSubmitting} loadingText="Resetting">
          Reset password
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Need a new link?{' '}
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Start again
        </Link>
      </p>
    </div>
  );
}
