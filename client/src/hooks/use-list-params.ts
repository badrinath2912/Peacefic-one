'use client';

import { useCallback, useMemo, useState } from 'react';

export interface ListParams {
  page: number;
  limit: number;
  sort?: string;
  search?: string;
  [key: string]: unknown;
}

/**
 * List state with one rule baked in: changing a filter, the search term or the
 * sort resets to page 1. Without that, filtering while on page 7 leaves the
 * user staring at an empty table and concluding there are no results.
 */
export function useListParams(initial: Partial<ListParams> = {}) {
  const [params, setParams] = useState<ListParams>({
    page: 1,
    limit: 25,
    ...initial,
  });

  const setPage = useCallback((page: number) => {
    setParams((current) => ({ ...current, page: Math.max(1, page) }));
  }, []);

  const setSort = useCallback((sort: string) => {
    setParams((current) => ({ ...current, sort, page: 1 }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setParams((current) => ({ ...current, search: search || undefined, page: 1 }));
  }, []);

  const setFilter = useCallback((key: string, value: unknown) => {
    setParams((current) => ({
      ...current,
      [key]: value === '' || value === undefined ? undefined : value,
      page: 1,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setParams((current) => ({ page: 1, limit: current.limit, sort: current.sort }));
  }, []);

  const activeFilterCount = useMemo(
    () =>
      Object.entries(params).filter(
        ([key, value]) =>
          !['page', 'limit', 'sort', 'search'].includes(key) && value !== undefined && value !== '',
      ).length,
    [params],
  );

  return { params, setPage, setSort, setSearch, setFilter, resetFilters, activeFilterCount };
}

/** Debounced search box state, so typing does not fire a request per keystroke. */
export function useDebouncedSearch(onSearch: (value: string) => void, delay = 350) {
  const [value, setValue] = useState('');
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      if (timer) clearTimeout(timer);
      setTimer(setTimeout(() => onSearch(next), delay));
    },
    [delay, onSearch, timer],
  );

  return { value, onChange };
}
