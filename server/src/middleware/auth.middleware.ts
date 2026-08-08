import { hasAnyPermission, hasPermission } from '@peacefic/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { requestContext } from '@/config/request-context';
import {
  AccountInactiveError,
  AuthenticationError,
  AuthorizationError,
} from '@/errors';
import { verifyAccessToken, type AccessTokenClaims } from '@/utils/jwt';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenClaims;
  }
}

function extractToken(req: Request): string | null {
  const header = req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Verifies the access token and populates request context. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AuthenticationError('You must be signed in to do that.');
    }

    const claims = verifyAccessToken(token);
    req.auth = claims;

    requestContext.patch({
      userId: claims.sub,
      collegeId: claims.cid,
      roleKey: claims.rol,
      permissions: claims.per,
      sessionId: claims.sid,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/** Attaches identity when a token is present, but never rejects. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const claims = verifyAccessToken(token);
    req.auth = claims;
    requestContext.patch({
      userId: claims.sub,
      collegeId: claims.cid,
      roleKey: claims.rol,
      permissions: claims.per,
      sessionId: claims.sid,
    });
  } catch {
    // An invalid token on an optional route is treated as anonymous.
  }
  next();
}

/**
 * Blocks accounts that are authenticated but not usable, and forces a password
 * change through before anything else is reachable.
 */
export function requireActiveAccount(req: Request, _res: Response, next: NextFunction): void {
  const claims = req.auth;
  if (!claims) {
    next(new AuthenticationError());
    return;
  }
  next();
}

const PASSWORD_CHANGE_ALLOWLIST = new Set([
  '/api/v1/auth/change-password',
  '/api/v1/auth/session',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
]);

export function blockUntilPasswordChanged(mustChange: boolean): RequestHandler {
  return (req, _res, next) => {
    if (mustChange && !PASSWORD_CHANGE_ALLOWLIST.has(req.path)) {
      next(new AccountInactiveError('You must change your password before continuing.'));
      return;
    }
    next();
  };
}

/** Requires every listed permission. */
export function authorize(...required: string[]): RequestHandler {
  return (_req, _res, next) => {
    const granted = requestContext.tryGet()?.permissions ?? [];
    const missing = required.filter((permission) => !hasPermission(granted, permission));

    if (missing.length > 0) {
      next(
        new AuthorizationError(
          `You do not have permission to perform this action (${missing.join(', ')}).`,
        ),
      );
      return;
    }
    next();
  };
}

/** Requires at least one of the listed permissions. */
export function authorizeAny(...required: string[]): RequestHandler {
  return (_req, _res, next) => {
    const granted = requestContext.tryGet()?.permissions ?? [];
    if (!hasAnyPermission(granted, required)) {
      next(new AuthorizationError('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

export function requireRole(...roleKeys: string[]): RequestHandler {
  return (_req, _res, next) => {
    const roleKey = requestContext.tryGet()?.roleKey;
    if (!roleKey || !roleKeys.includes(roleKey)) {
      next(new AuthorizationError('This area is not available for your role.'));
      return;
    }
    next();
  };
}

export function requirePlatformAdmin(): RequestHandler {
  return requireRole('platform_admin');
}
