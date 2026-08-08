import type { ApiSuccessResponse, PaginationMeta, ResponseMeta } from '@peacefic/shared';
import type { Response } from 'express';

import { requestContext } from '@/config/request-context';

function buildMeta(pagination?: PaginationMeta): ResponseMeta {
  return {
    requestId: requestContext.requestId(),
    timestamp: new Date().toISOString(),
    ...(pagination ? { pagination } : {}),
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiSuccessResponse<T> = { success: true, data, meta: buildMeta() };
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationMeta,
  statusCode = 200,
): Response {
  const body: ApiSuccessResponse<T[]> = {
    success: true,
    data: items,
    meta: buildMeta(pagination),
  };
  return res.status(statusCode).json(body);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}
