import type { NextFunction, Request, Response } from 'express';

import { createEmptyContext, requestContext } from '@/config/request-context';
import { generateRequestId } from '@/utils/crypto';

/**
 * Establishes the per-request AsyncLocalStorage store. Must run before any
 * middleware that reads context, which is everything downstream.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-Id');
  const requestId = incoming && incoming.length <= 64 ? incoming : generateRequestId();

  const context = createEmptyContext(requestId);
  context.ip = req.ip ?? req.socket.remoteAddress ?? null;
  context.userAgent = req.header('User-Agent') ?? null;

  // Returned so a user can quote it from an error toast and it can be found
  // in the logs.
  res.setHeader('X-Request-Id', requestId);

  requestContext.run(context, () => next());
}
