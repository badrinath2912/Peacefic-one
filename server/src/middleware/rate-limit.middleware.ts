import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { config } from '@/config/env';
import { getRedis } from '@/config/redis';
import { requestContext } from '@/config/request-context';
import { RateLimitError } from '@/errors';

/** Redis-backed so limits hold across instances; falls back to memory locally. */
function createStore(prefix: string): Options['store'] | undefined {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}

function build(name: string, windowMs: number, max: number, keyBy: 'ip' | 'user' | 'email' = 'ip') {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore(name),
    skip: () => config.isTest,
    keyGenerator: (req) => {
      if (keyBy === 'user') {
        return requestContext.tryGet()?.userId ?? req.ip ?? 'anonymous';
      }
      if (keyBy === 'email') {
        const email = (req.body as { email?: string } | undefined)?.email;
        return email ? `email:${email.toLowerCase()}` : (req.ip ?? 'anonymous');
      }
      return req.ip ?? 'anonymous';
    },
    handler: (_req, _res, next) => {
      next(new RateLimitError());
    },
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export const globalRateLimit: RateLimitRequestHandler = build(
  'global',
  config.security.rateLimitWindowMs,
  config.security.rateLimitMax,
);

/**
 * Login is limited per IP *and* per email. IP-only fails against distributed
 * credential stuffing; email-only lets an attacker lock out a victim.
 */
export const loginRateLimit: RateLimitRequestHandler = build('login', FIFTEEN_MINUTES, 5);
export const loginEmailRateLimit: RateLimitRequestHandler = build(
  'login-email',
  FIFTEEN_MINUTES,
  10,
  'email',
);

export const registerRateLimit: RateLimitRequestHandler = build('register', ONE_HOUR, 3);
export const forgotPasswordRateLimit: RateLimitRequestHandler = build(
  'forgot',
  ONE_HOUR,
  3,
  'email',
);
export const otpRateLimit: RateLimitRequestHandler = build('otp', FIFTEEN_MINUTES, 3, 'email');
export const uploadRateLimit: RateLimitRequestHandler = build('upload', ONE_HOUR, 20, 'user');
export const importRateLimit: RateLimitRequestHandler = build('import', ONE_HOUR, 5, 'user');
export const exportRateLimit: RateLimitRequestHandler = build('export', ONE_HOUR, 10, 'user');
export const publicVerifyRateLimit: RateLimitRequestHandler = build('verify', ONE_HOUR, 30);
