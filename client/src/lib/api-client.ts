import type { ApiErrorDetail, ApiSuccessResponse, PaginationMeta } from '@peacefic/shared';
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

/** A typed error the UI can branch on without inspecting axios internals. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Maps server field errors onto react-hook-form's setError shape. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((detail) => [detail.field, detail.message]));
  }

  get isAuthError(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isValidationError(): boolean {
    return this.code === 'VALIDATION_ERROR';
  }
}

/**
 * The access token lives in memory only.
 *
 * localStorage would survive a refresh but is readable by any script that gets
 * injected; the refresh token is in an httpOnly cookie precisely so a short
 * in-memory access token can be re-minted on load without persisting anything
 * XSS can reach.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  // Required for the refresh cookie to travel to the API origin.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

/**
 * Single-flight refresh. Without this, a dashboard firing eight parallel
 * requests on a stale token would send eight refreshes — and because refresh
 * rotates the token, seven of them would replay an already-rotated token and
 * trip the server's reuse detection, logging the user out for doing nothing
 * wrong.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= axios
    .post<ApiSuccessResponse<{ accessToken: string; expiresIn: number }>>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true, timeout: 15_000 },
    )
    .then((response) => {
      const token = response.data.data.accessToken;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { code: string; message: string; details?: ApiErrorDetail[] }; meta?: { requestId: string } }>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    // Only an expired token is retriable. A revoked session or a bad token
    // must log out rather than loop.
    const canRetry =
      status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login');

    if (canRetry) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.set('Authorization', `Bearer ${token}`);
        return apiClient(original);
      } catch {
        setAccessToken(null);
        onUnauthenticated?.();
      }
    } else if (status === 401 && !original?.url?.includes('/auth/')) {
      setAccessToken(null);
      onUnauthenticated?.();
    }

    if (!error.response) {
      throw new ApiError(
        'NETWORK_ERROR',
        'Could not reach the server. Check your connection and try again.',
        0,
      );
    }

    const payload = error.response.data?.error;

    throw new ApiError(
      payload?.code ?? 'INTERNAL_ERROR',
      payload?.message ?? 'Something went wrong. Please try again.',
      error.response.status,
      payload?.details ?? [],
      error.response.data?.meta?.requestId,
    );
  },
);

/* ------------------------------ typed helpers ----------------------------- */

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<ApiSuccessResponse<T>>(url, config);
  return response.data.data;
}

/** For list endpoints, where pagination lives in `meta` beside the data. */
export async function apiGetPaginated<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ items: T[]; pagination: PaginationMeta }> {
  const response = await apiClient.get<ApiSuccessResponse<T[]>>(url, config);
  return {
    items: response.data.data,
    pagination:
      response.data.meta.pagination ??
      {
        page: 1,
        limit: response.data.data.length,
        totalItems: response.data.data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
  };
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.post<ApiSuccessResponse<T>>(url, body, config);
  return response.data.data;
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.patch<ApiSuccessResponse<T>>(url, body, config);
  return response.data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiClient.put<ApiSuccessResponse<T>>(url, body);
  return response.data.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<ApiSuccessResponse<T>>(url, config);
  return response.data.data;
}

/** Restores a session on page load using only the httpOnly refresh cookie. */
export async function bootstrapSession(): Promise<string | null> {
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}
