import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

import { config } from '@/config/env';
import { requestContext } from '@/config/request-context';
import { RateLimitError } from '@/errors';

/**
 * Counters live in this process's memory.
 *
 * The trade-off, stated plainly: limits are **per instance**, not global. One
 * API process enforces exactly what is configured here; behind N processes an
 * attacker gets N times the budget, because nothing is shared between them.
 * That is acceptable for a single-instance deployment and is the reason the
 * login limiter keys on the email as well as the IP — the email key at least
 * narrows credential stuffing aimed at one account within each instance.
 *
 * Restarting the process clears every counter, so a limit is not a durable
 * lockout. Account lockout after repeated failures is enforced separately, in
 * the auth service against the database, and does survive a restart.
 */
function build(_name: string, windowMs: number, max: number, keyBy: 'ip' | 'user' | 'email' = 'ip') {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
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

/**
 * Development gets a far larger budget on the account-creating and code-sending
 * endpoints.
 *
 * Production values are chosen against abuse: three registrations an hour from
 * one address is generous for real users and hostile to bulk signup. Those same
 * three make local work almost impossible, because building and testing a
 * registration flow means running it repeatedly from one machine — and with the
 * in-memory store, the only way to clear a tripped counter is to restart the
 * server.
 *
 * The multiplier applies **only** outside production, so the deployed limits are
 * exactly what they were. It does not touch login: brute-force protection stays
 * identical everywhere, because a weak login limit in development is a habit
 * that ships.
 */
const ABUSE_BUDGET = config.isProduction ? 1 : 20;

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

export const registerRateLimit: RateLimitRequestHandler = build(
  'register',
  ONE_HOUR,
  3 * ABUSE_BUDGET,
);
export const forgotPasswordRateLimit: RateLimitRequestHandler = build(
  'forgot',
  ONE_HOUR,
  3 * ABUSE_BUDGET,
  'email',
);
export const otpRateLimit: RateLimitRequestHandler = build(
  'otp',
  FIFTEEN_MINUTES,
  3 * ABUSE_BUDGET,
  'email',
);
export const uploadRateLimit: RateLimitRequestHandler = build('upload', ONE_HOUR, 20, 'user');
export const importRateLimit: RateLimitRequestHandler = build('import', ONE_HOUR, 5, 'user');
export const exportRateLimit: RateLimitRequestHandler = build('export', ONE_HOUR, 10, 'user');
export const publicVerifyRateLimit: RateLimitRequestHandler = build('verify', ONE_HOUR, 30);
