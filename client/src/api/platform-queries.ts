'use client';

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

export const platformKeys = {
  overview: () => ['platform', 'aggregation', 'overview'] as const,
};

/**
 * Platform-wide totals, as `GET /platform/aggregation/overview` returns them.
 *
 * Counts only — no records. Every figure is already scoped by the server to
 * active, published or joined state as the metric requires, and
 * `attendanceRate` arrives as a percentage, so nothing here recomputes it.
 */
export interface PlatformOverview {
  institutions: number;
  students: number;
  faculty: number;
  examinations: number;
  companies: number;
  placements: number;
  trainingSessions: number;
  /** Already a percentage: 80 means 80%. */
  attendanceRate: number;
}

/** Platform administrators only; the endpoint refuses everyone else. */
export function usePlatformOverview(enabled = true) {
  return useQuery({
    enabled,
    queryKey: platformKeys.overview(),
    queryFn: () => apiGet<PlatformOverview>('/platform/aggregation/overview'),
  });
}
