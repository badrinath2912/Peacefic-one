'use client';

import { ThemeProvider } from 'next-themes';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import type { ReactNode } from 'react';

import { store } from '@/store';

import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        // Transitions on a theme flip look like a rendering fault, not a feature.
        disableTransitionOnChange
      >
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="bottom-right"
              gutter={8}
              toastOptions={{
                duration: 4000,
                className:
                  'rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-raised',
                success: { iconTheme: { primary: 'hsl(var(--success))', secondary: 'white' } },
                error: {
                  duration: 6000,
                  iconTheme: { primary: 'hsl(var(--danger))', secondary: 'white' },
                },
              }}
            />
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </ReduxProvider>
  );
}
