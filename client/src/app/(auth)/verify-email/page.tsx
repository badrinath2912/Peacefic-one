'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { verifyEmailSchema, type VerifyEmailInput } from '@peacefic/shared';
import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPost } from '@/lib/api-client';

/** The server's own cooldown is 60s; mirroring it avoids a guaranteed 429. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Email verification.
 *
 * This is the step both registration flows depend on and neither could reach:
 * `POST /auth/verify-email` and `POST /auth/resend-otp` have existed since the
 * beginning, but nothing in the client called them, so a registered account sat
 * at `pending_verification` with the emailed code having nowhere to go.
 *
 * **Verification does not sign anyone in.** The endpoint answers with a message
 * and nothing else — no token, no user — so this page never redirects into a
 * portal. What it does is move the account from `pending_verification` to
 * `pending_approval`, which is still not a usable account: login refuses both.
 * The success state says so plainly rather than implying access.
 *
 * The email arrives via the query string as a convenience and stays editable,
 * because the code is bound to the address rather than to a link — a student who
 * opens the mail on another device can simply type both.
 */
export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get('email') ?? '';

  const [formError, setFormError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailInput>({
    // The same schema the server validates against, so "6 digits" is stated
    // once rather than re-implemented here.
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: emailFromQuery, otp: '' },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setResendNotice(null);

    try {
      await apiPost('/auth/verify-email', values);
      setVerified(true);
    } catch (error) {
      if (error instanceof ApiError) {
        // The server reports a wrong or expired code on the `otp` field, so it
        // lands under the input rather than in a banner.
        if (error.details.length > 0) {
          for (const detail of error.details) {
            setError(detail.field as keyof VerifyEmailInput, { message: detail.message });
          }
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  });

  const resend = async () => {
    const email = getValues('email');

    if (!email) {
      setError('email', { message: 'Enter your email address first' });
      return;
    }

    setResending(true);
    setFormError(null);
    setResendNotice(null);

    try {
      await apiPost('/auth/resend-otp', { email, purpose: 'email_verification' });
      setResendNotice('A new code is on its way. It expires in 10 minutes.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      // A 429 here is the server's own one-a-minute rule, not a fault.
      setResendNotice(
        error instanceof ApiError ? error.message : 'Could not send a new code. Please try again.',
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  };

  if (verified) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-subtle text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
          <p className="text-sm text-muted-foreground">
            Thank you. Your email address has been confirmed.
          </p>
        </div>

        {/* Verification is one gate of two. Saying "you can now sign in" here
            would be wrong: login still refuses a pending_approval account. */}
        <Alert tone="info" title="Awaiting approval">
          <p className="text-sm">
            Your registration is now with your administrator for approval. You will be emailed once
            it is approved, and you can sign in after that.
          </p>
        </Alert>

        <Button asChild block variant="outline">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <header className="space-y-1.5">
        <span className="grid size-11 place-items-center rounded-full bg-primary-subtle text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          Enter the six-digit code we emailed you. It expires ten minutes after it is sent.
        </p>
      </header>

      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      {resendNotice ? <Alert tone="info">{resendNotice}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

        <Field label="Verification code" error={errors.otp?.message} required>
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

        <Button type="submit" block isLoading={isSubmitting} loadingText="Verifying…">
          Verify email
        </Button>
      </form>

      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">Did not get the code?</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void resend()}
          isLoading={resending}
          loadingText="Sending…"
          disabled={cooldown > 0 || resending}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already verified?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
