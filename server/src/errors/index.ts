import { ERROR_CODES, type ApiErrorDetail, type ErrorCode } from '@peacefic/shared';

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;
  readonly details?: ApiErrorDetail[];
  /** Expected errors are not reported to the error tracker. */
  readonly isOperational: boolean = true;

  constructor(message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = ERROR_CODES.VALIDATION_ERROR;

  constructor(message = 'The submitted data is invalid.', details?: ApiErrorDetail[]) {
    super(message, details);
  }
}

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = ERROR_CODES.BAD_REQUEST;
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code: ErrorCode;

  constructor(message = 'Authentication is required.', code: ErrorCode = ERROR_CODES.UNAUTHENTICATED) {
    super(message);
    this.code = code;
  }
}

export class TokenExpiredError extends AppError {
  readonly statusCode = 401;
  readonly code = ERROR_CODES.TOKEN_EXPIRED;

  constructor(message = 'Your session has expired.') {
    super(message);
  }
}

export class InvalidCredentialsError extends AppError {
  readonly statusCode = 401;
  readonly code = ERROR_CODES.INVALID_CREDENTIALS;

  constructor(message = 'The email or password is incorrect.') {
    super(message);
  }
}

export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly code = ERROR_CODES.FORBIDDEN;

  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

export class AccountInactiveError extends AppError {
  readonly statusCode = 403;
  readonly code = ERROR_CODES.ACCOUNT_INACTIVE;
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = ERROR_CODES.NOT_FOUND;

  constructor(resource = 'Resource') {
    super(`${resource} was not found.`);
  }
}

export class DuplicateResourceError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.DUPLICATE_RESOURCE;

  constructor(message = 'A record with these details already exists.', details?: ApiErrorDetail[]) {
    super(message, details);
  }
}

export class InvalidStateTransitionError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.INVALID_STATE_TRANSITION;

  constructor(from: string, to: string, entity = 'record') {
    super(`A ${entity} cannot move from "${from}" to "${to}".`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.CONFLICT;
}

export class FileTooLargeError extends AppError {
  readonly statusCode = 413;
  readonly code = ERROR_CODES.FILE_TOO_LARGE;
}

export class UnsupportedFileTypeError extends AppError {
  readonly statusCode = 415;
  readonly code = ERROR_CODES.UNSUPPORTED_FILE_TYPE;
}

export class BusinessRuleError extends AppError {
  readonly statusCode = 422;
  readonly code = ERROR_CODES.BUSINESS_RULE_VIOLATION;
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = ERROR_CODES.RATE_LIMITED;

  constructor(message = 'Too many requests. Please try again shortly.') {
    super(message);
  }
}

export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = ERROR_CODES.INTERNAL_ERROR;
  override readonly isOperational = false;

  constructor(message = 'Something went wrong on our side.') {
    super(message);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = ERROR_CODES.SERVICE_UNAVAILABLE;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
