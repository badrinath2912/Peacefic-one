'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { canAny, homeRouteFor } from '@/lib/permissions';

import { FullPageSpinner } from '../ui/spinner';

interface RouteGuardProps {
  children: ReactNode;
  /** At least one of these is required to view the route. */
  permissions?: string[];
  roles?: string[];
}

/**
 * Gates rendering, not data. The server authorises every request independently;
 * this exists so a user is not shown a shell that will only produce 403s.
 */
export function RouteGuard({ children, permissions, roles }: RouteGuardProps) {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isBootstrapping) return;

    if (!isAuthenticated) {
      // Remember where they were headed so login can return them there.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?next=${next}`);
      return;
    }

    if (user?.mustChangePassword && !window.location.pathname.startsWith('/change-password')) {
      router.replace('/change-password');
      return;
    }

    if (roles && user && !roles.includes(user.roleKey)) {
      router.replace(homeRouteFor(user.roleKey));
      return;
    }

    if (permissions && user && !canAny(user.permissions, permissions)) {
      router.replace(homeRouteFor(user.roleKey));
    }
  }, [isAuthenticated, isBootstrapping, permissions, roles, router, user]);

  if (isBootstrapping) return <FullPageSpinner label="Restoring your session" />;
  if (!isAuthenticated) return <FullPageSpinner label="Redirecting to sign in" />;

  if (roles && user && !roles.includes(user.roleKey)) {
    return <FullPageSpinner label="Redirecting" />;
  }

  if (permissions && user && !canAny(user.permissions, permissions)) {
    return <FullPageSpinner label="Redirecting" />;
  }

  return <>{children}</>;
}

/** Inverse guard: keeps a signed-in user off the login and register pages. */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated && user) {
      router.replace(homeRouteFor(user.roleKey));
    }
  }, [isAuthenticated, isBootstrapping, router, user]);

  if (isBootstrapping) return <FullPageSpinner label="Loading" />;
  if (isAuthenticated) return <FullPageSpinner label="Redirecting" />;

  return <>{children}</>;
}
