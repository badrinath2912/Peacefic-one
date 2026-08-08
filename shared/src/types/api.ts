export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string | null;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta: ResponseMeta;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  CONFLICT: 'CONFLICT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface BulkOperationResult {
  totalSubmitted: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    index: number;
    success: boolean;
    identifier?: string;
    id?: string;
    code?: string;
    message?: string;
  }>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  collegeId: string | null;
  collegeName: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
  status: string;
  mustChangePassword: boolean;
  emailVerified: boolean;
  preferences: {
    theme: string;
    locale: string;
    emailNotifications: boolean;
    pushNotifications: boolean;
  };
  studentId?: string | null;
  facultyId?: string | null;
  departmentId?: string | null;
  batchId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}
