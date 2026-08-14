'use client';

import { THEME, changePasswordSchema, type ChangePasswordInput } from '@peacefic/shared';
import {
  Eye,
  EyeOff,
  Lock,
  LogOut,
  MonitorSmartphone,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';

import {
  useAuthSessions,
  useChangePassword,
  useRevokeSession,
  useSignOutEverywhere,
  useUpdatePreferences,
  type AuthSession,
} from '@/api/auth-queries';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/app-shell';
import { useApiForm } from '@/hooks/use-api-form';
import { formatDateTime, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/**
 * Account settings.
 *
 * Password and sessions only. `UserModel.preferences` (theme, locale,
 * notification opt-ins) is real, populated data that the notification service
 * honours — but no endpoint writes it, so no control for it appears here.
 * Rendering a switch that cannot persist would be a lie about what the product
 * does; the missing endpoint is a backend milestone, not something to fake.
 */
export default function StudentSettingsPage() {
  const { logout } = useAuth();
  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false);

  const sessions = useAuthSessions();
  const revokeSession = useRevokeSession();
  const signOutEverywhere = useSignOutEverywhere(() => void logout());

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account security and active sessions."
      />

      <div className="space-y-4">
        <PreferencesCard />

        <ChangePasswordCard />

        <SessionsCard
          sessions={sessions}
          onRevoke={(id) => revokeSession.mutate(id)}
          revokingId={revokeSession.isPending ? revokeSession.variables : undefined}
        />

        {/* Separated deliberately: this one ends the session you are using. */}
        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-danger" aria-hidden />
              Sign out everywhere
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Signs out every device, including this one. Use this if you think someone else has
              access to your account. You will need to sign in again.
            </p>
          </CardHeader>

          <CardContent>
            <Button
              variant="danger"
              onClick={() => setConfirmingSignOutAll(true)}
              isLoading={signOutEverywhere.isPending}
              loadingText="Signing out"
            >
              <LogOut aria-hidden />
              Sign out everywhere
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmingSignOutAll}
        tone="danger"
        title="Sign out on every device?"
        description="This signs you out everywhere, including this browser. You will need to sign in again to continue."
        confirmLabel="Sign out everywhere"
        isPending={signOutEverywhere.isPending}
        onConfirm={() => {
          setConfirmingSignOutAll(false);
          signOutEverywhere.mutate();
        }}
        onCancel={() => setConfirmingSignOutAll(false)}
      />
    </>
  );
}

/* -------------------------------- preferences ------------------------------- */

const THEME_OPTIONS = THEME.map((value) => ({ value, label: toTitleCase(value) }));

/**
 * Account preferences.
 *
 * These were previously read-only in the product — `UserModel.preferences` was
 * populated, returned by `/auth/session` and honoured by the notification
 * service, but nothing could write it. `PATCH /auth/preferences` closes that,
 * and the response carries the rebuilt session user so the shell updates
 * without a refetch.
 */
function PreferencesCard() {
  const { user, updateUser } = useAuth();
  const current = user?.preferences;

  const preferences = useUpdatePreferences((updated) => updateUser(updated));

  const [theme, setTheme] = useState(current?.theme ?? 'system');
  const [emailNotifications, setEmailNotifications] = useState(
    current?.emailNotifications ?? true,
  );
  const [pushNotifications, setPushNotifications] = useState(current?.pushNotifications ?? true);

  // Only what actually differs is sent, so the server's dot-notation write
  // leaves everything else exactly as stored.
  const changed =
    theme !== current?.theme ||
    emailNotifications !== current?.emailNotifications ||
    pushNotifications !== current?.pushNotifications;

  function save(): void {
    preferences.mutate({
      ...(theme !== current?.theme ? { theme: theme as (typeof THEME)[number] } : {}),
      ...(emailNotifications !== current?.emailNotifications ? { emailNotifications } : {}),
      ...(pushNotifications !== current?.pushNotifications ? { pushNotifications } : {}),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Preferences
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How Peacefic One looks, and when it contacts you.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <Field label="Theme" className="max-w-xs">
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              options={THEME_OPTIONS}
            />
          )}
        </Field>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Notifications</legend>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              checked={emailNotifications}
              onChange={(event) => setEmailNotifications(event.target.checked)}
            />
            <span>
              Email notifications
              <span className="block text-xs text-muted-foreground">
                Turning this off stops routine emails. Security messages such as password resets are
                always sent.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              checked={pushNotifications}
              onChange={(event) => setPushNotifications(event.target.checked)}
            />
            <span>
              Push notifications
              <span className="block text-xs text-muted-foreground">
                In-app notifications always appear in your inbox regardless of this setting.
              </span>
            </span>
          </label>
        </fieldset>

        <Button
          onClick={save}
          disabled={!changed}
          isLoading={preferences.isPending}
          loadingText="Saving"
        >
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ change password ----------------------------- */

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const { form, formError, requestId, handleSubmit } = useApiForm<ChangePasswordInput>({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    onSubmit: (values) => changePassword.mutateAsync(values),
    // Nothing is kept: the values are secrets and the form is done with them.
    onSuccess: () => form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' }),
  });

  const fields = [
    { name: 'currentPassword' as const, label: 'Current password', autoComplete: 'current-password' },
    { name: 'newPassword' as const, label: 'New password', autoComplete: 'new-password' },
    { name: 'confirmPassword' as const, label: 'Confirm new password', autoComplete: 'new-password' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" aria-hidden />
          Change password
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Changing your password keeps you signed in here and signs out your other devices.
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-4">
          {formError ? (
            <Alert tone="danger" title="Could not change your password">
              {formError}
              {requestId ? (
                <span className="mt-1 block font-mono text-2xs opacity-70">
                  Reference: {requestId}
                </span>
              ) : null}
            </Alert>
          ) : null}

          {fields.map((entry) => (
            <Field
              key={entry.name}
              label={entry.label}
              required
              error={form.formState.errors[entry.name]?.message}
              hint={
                entry.name === 'newPassword'
                  ? 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.'
                  : undefined
              }
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type={visible[entry.name] ? 'text' : 'password'}
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
                      onClick={() =>
                        setVisible((current) => ({
                          ...current,
                          [entry.name]: !current[entry.name],
                        }))
                      }
                      aria-label={
                        visible[entry.name]
                          ? `Hide ${entry.label.toLowerCase()}`
                          : `Show ${entry.label.toLowerCase()}`
                      }
                    >
                      {visible[entry.name] ? <EyeOff /> : <Eye />}
                    </Button>
                  }
                  {...form.register(entry.name)}
                />
              )}
            </Field>
          ))}

          <Button type="submit" isLoading={changePassword.isPending} loadingText="Changing">
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- sessions --------------------------------- */

function SessionsCard({
  sessions,
  onRevoke,
  revokingId,
}: {
  sessions: ReturnType<typeof useAuthSessions>;
  onRevoke: (sessionId: string) => void;
  revokingId: string | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphone className="size-4" aria-hidden />
          Active sessions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every device currently signed in to your account.
        </p>
      </CardHeader>

      <CardContent>
        {sessions.isError ? (
          <ErrorState
            title="Could not load your sessions"
            message="Something went wrong while fetching your devices. Please try again."
            requestId={sessions.error.requestId}
            onRetry={() => void sessions.refetch()}
          />
        ) : sessions.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="skeleton h-20 w-full rounded-md" />
            ))}
          </div>
        ) : (sessions.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={MonitorSmartphone}
            title="No active sessions"
            description="Sessions appear here while you are signed in on a device."
          />
        ) : (
          <ul className="space-y-3">
            {sessions.data?.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoke={() => onRevoke(session.id)}
                isRevoking={revokingId === session.id}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SessionRow({
  session,
  onRevoke,
  isRevoking,
}: {
  session: AuthSession;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{session.deviceLabel}</p>
          {session.isCurrent ? <Badge tone="success">This device</Badge> : null}
        </div>

        <dl className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex gap-1">
            <dt>IP address:</dt>
            <dd className="tabular">{session.ip || '—'}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Last active:</dt>
            <dd>{formatDateTime(session.lastUsedAt)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Signed in:</dt>
            <dd>{formatDateTime(session.createdAt)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Expires:</dt>
            <dd>{formatDateTime(session.expiresAt)}</dd>
          </div>
        </dl>
      </div>

      {/* No per-row action for the current device: revoking it would leave this
          tab in a half-signed-in state. "Sign out everywhere" does that
          properly, and the usual sign-out ends this session alone. */}
      {session.isCurrent ? null : (
        <Button
          variant="outline"
          size="sm"
          onClick={onRevoke}
          isLoading={isRevoking}
          loadingText="Signing out"
          aria-label={`Sign out ${session.deviceLabel}`}
        >
          Sign out
        </Button>
      )}
    </li>
  );
}
