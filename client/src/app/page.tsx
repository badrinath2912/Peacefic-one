'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { FullPageSpinner } from '@/components/ui/spinner';
import { homeRouteFor } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

/**
 * The landing route only decides where to send someone. Which portal that is
 * depends on their role, which is not known until the session has resolved.
 */
export default function RootPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isBootstrapping) return;
    router.replace(isAuthenticated && user ? homeRouteFor(user.roleKey) : '/login');
  }, [isAuthenticated, isBootstrapping, router, user]);

  return <FullPageSpinner label="Loading Peacefic One" />;
}
