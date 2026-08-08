'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created in state so each browser session gets one client, and so a server
  // render never shares a cache between users.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              // Retrying a 403 or a 422 just delays the inevitable and hides
              // the real error from the user.
              if (error instanceof ApiError) {
                if (error.statusCode >= 400 && error.statusCode < 500) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
