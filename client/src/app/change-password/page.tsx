'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@peacefic/shared';
import { Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { RouteGuard } from '@/components/auth/route-guard';
import { BrandLogo } from '@/components/layout/brand-logo';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, apiPatch } from '@/lib/api-client';
import { homeRouteFor } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

/**
 * The forced password change.
 *
 * `RouteGuard` sends anyone with `mustChangePassword` here and lets only this
 * path through, so without the page an invited user was redirected to a 404 and
 * could reach nothing — a hard lockout rather than a cosmetic gap.
 *
 * It deliberately sits **outside** the `(auth)` route group: that group is
 * wrapped in `GuestGuard`, which ejects a signed-in user, and this page needs
 * one. `RouteGuard` with no permissions gives it "signed in, nothing more".
 */
export default function ChangePasswordPage() {
  return (
    <RouteGuard>
      <ChangePasswordForm />
    </RouteGuard>
  );
}

function ChangePasswordForm() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    // The same schema the server validates against, so the rules cannot drift.
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiPatch('/auth/change-password', values);

      /**
       * The server clears `mustChangePassword` in `setPassword`, but this
       * client still holds the session it bootstrapped with. Refreshing before
       * navigating is what stops `RouteGuard` reading stale state and bouncing
       * the user straight back here.
       */
      await refreshUser();

      router.replace(homeRouteFor(user?.roleKey));
    } catch (error) {
      if (error instanceof ApiError) {
        const mappable = error.details.filter((detail) => detail.field && detail.field !== '_root');

        if (mappable.length > 0) {
          for (const detail of mappable) {
            setError(detail.field as keyof ChangePasswordInput, { message: detail.message });
          }
          return;
        }

        // Covers a wrong current password, a reused password, and an expired
        // session — each already carries a usable message from the server.
        setFormError(error.message);
        return;
      }

      setFormError('Something went wrong. Please try again.');
    }
  });

  const fields = [
    { name: 'currentPassword' as const, label: 'Current password', autoComplete: 'current-password' },
    { name: 'newPassword' as const, label: 'New password', autoComplete: 'new-password' },
    { name: 'confirmPassword' as const, label: 'Confirm new password', autoComplete: 'new-password' },
  ];

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>

        <header className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Change your password</h1>
          <p className="text-sm text-muted-foreground">
            You must set a new password before you can continue.
          </p>
        </header>

        <Alert tone="warning" title="Why you are seeing this">
          Your account was created with a temporary password, or an administrator asked for it to be
          reset.
        </Alert>

        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {fields.map((entry) => (
            <Field
              key={entry.name}
              label={entry.label}
              error={errors[entry.name]?.message}
              hint={
                entry.name === 'newPassword'
                  ? 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.'
                  : undefined
              }
              required
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={entry.autoComplete}
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
                  {...register(entry.name)}
                />
              )}
            </Field>
          ))}

          <Button type="submit" block isLoading={isSubmitting} loadingText="Updating">
            Update password and continue
          </Button>
        </form>

        <p className="flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Changing your password signs out your other devices.</span>
        </p>

        {/* The only way out for someone who cannot complete this. */}
        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => void logout()}
            className="font-medium text-primary hover:underline"
          >
            Sign out instead
          </button>
        </p>
      </div>
    </main>
  );
}
