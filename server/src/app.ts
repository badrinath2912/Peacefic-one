import path from 'node:path';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import morgan from 'morgan';

import { isDatabaseHealthy } from '@/config/database';
import { config } from '@/config/env';
import { httpLogStream, logger } from '@/config/logger';
import { isRedisHealthy } from '@/config/redis';
import { errorMiddleware, notFoundMiddleware } from '@/middleware/error.middleware';
import { globalRateLimit } from '@/middleware/rate-limit.middleware';
import { requestContextMiddleware } from '@/middleware/request-context.middleware';
import { registerV1Routes } from '@/routes/v1';

export function createApp(): Application {
  const app = express();

  // Required behind Nginx/Render so `req.ip` is the client, not the proxy —
  // rate limiting keys off it.
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.s3.amazonaws.com'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", config.clientUrl],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  // Explicit allowlist. `origin: '*'` is never used and is incompatible with
  // credentials anyway; reflecting the request origin would defeat CORS entirely.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.security.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        logger.warn('Blocked CORS origin', { origin });
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key', 'If-Match'],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'Retry-After'],
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(compression());

  // Strips `$`-prefixed keys and dots before anything reaches a query.
  app.use(mongoSanitize({ replaceWith: '_' }));

  app.use(requestContextMiddleware);

  app.use(
    morgan(config.isProduction ? 'combined' : 'dev', {
      stream: httpLogStream,
      skip: (req) => req.path.startsWith('/health'),
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    const database = isDatabaseHealthy();
    const redis = isRedisHealthy();
    const ready = database && redis;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      checks: { database, redis },
    });
  });

  if (config.storage.driver === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(process.cwd(), config.storage.localDir), {
        maxAge: '1d',
        setHeaders(res) {
          // An uploaded HTML file must not execute in this origin.
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      }),
    );
  }

  app.use('/api', globalRateLimit);
  app.use('/api/v1', registerV1Routes());

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
