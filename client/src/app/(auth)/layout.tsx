import type { ReactNode } from 'react';

import { GuestGuard } from '@/components/auth/route-guard';
import { BrandLogo } from '@/components/layout/brand-logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GuestGuard>
      <div className="grid min-h-dvh lg:grid-cols-2">
        {/* Width is set by each page rather than here: sign-in wants a narrow
            column, institution registration is a long two-column form. */}
        <main id="main" className="flex items-center justify-center px-6 py-12">
          <div className="w-full space-y-8">
            {/* One brand mark for every auth page, so no page carries its own
                and none of them can drift apart. Hidden on lg, where the
                promotional panel already shows it. */}
            <div className="flex justify-center lg:hidden">
              <BrandLogo size="lg" />
            </div>

            {children}
          </div>
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
            <BrandLogo size="md" tone="inverse" />

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
