import type { ApiError } from '@/lib/api-client';

/**
 * Every request goes through the api client, which rejects with an `ApiError`.
 * Registering it here means `query.error` is typed as `ApiError` at every call
 * site, so `error.code`, `error.requestId` and `error.fieldErrors` are
 * available without a cast.
 */
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

export {};
