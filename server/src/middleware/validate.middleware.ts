import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { ValidationError } from '@/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
  }));
}

/**
 * The real trust boundary. Client-side validation is a UX affordance only.
 *
 * Unknown keys are stripped rather than ignored: without this a client could
 * smuggle `role: 'college_admin'` into a profile update and hope a downstream
 * spread operator picks it up.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        // Express 4 defines `query` as a getter on some versions; assigning
        // through defineProperty keeps it writable across both.
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ValidationError('The submitted data is invalid.', toDetails(error)));
        return;
      }
      next(error);
    }
  };
}

/** Shorthand for the common body-only case. */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return validate({ body: schema });
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return validate({ query: schema });
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return validate({ params: schema });
}
