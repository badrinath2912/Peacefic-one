import type { ReactNode } from 'react';

import { GuestGuard } from '@/components/auth/route-guard';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GuestGuard>
      <div className="grid min-h-dvh lg:grid-cols-2">
        <main id="main" className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        {/* Decorative panel: hidden below lg so small screens give the form
            the whole viewport rather than scrolling past artwork. */}
        <aside
          className="relative hidden overflow-hidden bg-primary lg:block"
          aria-hidden
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.12),transparent_50%)]" />

          <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
            <div className="text-lg font-semibold tracking-tight">Peacefic One</div>

            <div className="space-y-4">
              <p className="text-3xl font-semibold leading-tight">
                Learning, placement and institution management in one place.
              </p>
              <p className="max-w-md text-sm text-primary-foreground/80">
                Track attendance, run training programmes, manage placement drives and give every
                student a clear view of their own progress.
              </p>
            </div>

            <p className="text-xs text-primary-foreground/70">
              © {new Date().getFullYear()} Peacefic One
            </p>
          </div>
        </aside>
      </div>
    </GuestGuard>
  );
}
