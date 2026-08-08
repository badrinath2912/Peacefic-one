import { ERROR_CODES, type ApiErrorDetail, type ApiErrorResponse } from '@peacefic/shared';
import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';

import { config } from '@/config/env';
import { logger } from '@/config/logger';
import { requestContext } from '@/config/request-context';
import { AppError, isAppError } from '@/errors';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  isOperational: boolean;
}

function zodToDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));
}

function normalize(error: unknown): NormalizedError {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: error.isOperational,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'The submitted data is invalid.',
      details: zodToDetails(error),
      isOperational: true,
    };
  }

  if (error instanceof MongooseError.ValidationError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'The submitted data is invalid.',
      details: Object.entries(error.errors).map(([field, err]) => ({
        field,
        message: err.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof MongooseError.CastError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.BAD_REQUEST,
      message: `"${error.path}" is not a valid value.`,
      isOperational: true,
    };
  }

  if (error instanceof MongooseError.VersionError) {
    return {
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'This record changed while you were editing. Reload and try again.',
      isOperational: true,
    };
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    const field = Object.keys((error.keyPattern as Record<string, unknown>) ?? {})[0] ?? 'value';
    return {
      statusCode: 409,
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: 'A record with these details already exists.',
      details: [{ field, message: 'Already in use' }],
      isOperational: true,
    };
  }

  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return {
      statusCode: tooLarge ? 413 : 400,
      code: tooLarge ? ERROR_CODES.FILE_TOO_LARGE : ERROR_CODES.BAD_REQUEST,
      message: tooLarge ? 'That file is too large.' : `Upload failed: ${error.message}`,
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Something went wrong on our side.',
    isOperational: false,
  };
}

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalize(error);
  const requestId = requestContext.requestId();

  const logPayload = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
    userId: requestContext.userId(),
    collegeId: requestContext.collegeId(),
  };

  if (normalized.statusCode >= 500) {
    logger.error(normalized.message, {
      ...logPayload,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } else if (normalized.statusCode === 403 || normalized.statusCode === 429) {
    logger.warn(normalized.message, logPayload);
  } else {
    logger.debug(normalized.message, logPayload);
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: normalized.code,
      // Internal messages and stack traces never cross this boundary.
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    meta: { requestId, timestamp: new Date().toISOString() },
  };

  if (!config.isProduction && !normalized.isOperational && error instanceof Error) {
    (body.error as Record<string, unknown>).stack = error.stack;
  }

  res.status(normalized.statusCode).json(body);
}

export function notFoundMiddleware(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
    meta: { requestId: requestContext.requestId(), timestamp: new Date().toISOString() },
  };
  res.status(404).json(body);
}

export { AppError };
