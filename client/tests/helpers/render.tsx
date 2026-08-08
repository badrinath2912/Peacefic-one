import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

/**
 * Retries off and no cache between tests: a component under test should render
 * the error state on the first failure, not three seconds later.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
    // React Query logs expected query failures; the suite asserts them instead.
    logger: undefined,
  } as ConstructorParameters<typeof QueryClient>[0]);
}

export function renderWithQuery(ui: ReactElement): RenderResult & { queryClient: QueryClient } {
  const queryClient = createTestQueryClient();

  const result = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return { ...result, queryClient };
}

/**
 * `RouteGuard` reads the auth provider and Next's router. Both are stubbed so a
 * page test exercises the page rather than the session bootstrap.
 */
export function mockAuth(permissions: string[], overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      firstName: 'Meera',
      lastName: 'Iyer',
      email: 'meera.iyer@example.edu',
      roleKey: 'student',
      permissions,
      mustChangePassword: false,
      ...overrides,
    },
    isAuthenticated: true,
    isBootstrapping: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  };
}
