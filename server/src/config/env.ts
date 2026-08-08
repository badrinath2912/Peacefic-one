import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * The server runs from `server/` but the workspace keeps a single `.env` at the
 * repo root, so look in both. First file found wins; nothing is overwritten,
 * which lets real environment variables (CI, Render, Docker) take precedence.
 */
function loadEnvFile(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
}

loadEnvFile();

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    API_BASE_URL: z.string().url().default('http://localhost:5000'),
    CLIENT_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    TRUST_PROXY: booleanFromString.default(false),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_DB_NAME: z.string().min(1).default('peacefic_one'),

    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    REDIS_ENABLED: booleanFromString.default(true),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_INVITE_SECRET: z.string().min(32, 'JWT_INVITE_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRY_SECONDS: z.coerce.number().int().min(60).default(900),
    JWT_REFRESH_EXPIRY_DAYS: z.coerce.number().int().min(1).default(7),
    JWT_REFRESH_REMEMBER_DAYS: z.coerce.number().int().min(1).default(30),
    JWT_ISSUER: z.string().default('peacefic-one'),
    JWT_AUDIENCE: z.string().default('peacefic-one-client'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanFromString.default(false),
    // `strict` is right when the client and API share a registrable domain
    // (including localhost, where the port is irrelevant to same-site).
    // A split deployment — Vercel front end, Render API — is cross-site, and
    // there the browser drops a strict cookie entirely, so refresh silently
    // stops working. Those deployments need `none`, which requires Secure.
    COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
    SESSION_MAX_DEVICES: z.coerce.number().int().min(1).max(20).default(5),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_CALLBACK_URL: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
    LOCAL_UPLOAD_DIR: z.string().default('uploads'),
    AWS_REGION: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(['console', 'smtp', 'sendgrid']).default('console'),
    EMAIL_FROM: z.string().email().default('no-reply@peacefic.one'),
    EMAIL_FROM_NAME: z.string().default('Peacefic One'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: booleanFromString.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),

    MEETING_PROVIDER: z.enum(['zoom', 'google_meet', 'jitsi', 'bigbluebutton']).default('jitsi'),
    JITSI_DOMAIN: z.string().default('meet.jit.si'),

    CORS_ORIGINS: csv,
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().default(300),
    ENABLE_API_DOCS: booleanFromString.default(true),

    ATTENDANCE_LOCK_AFTER_HOURS: z.coerce.number().int().min(1).default(48),
    DEFAULT_ATTENDANCE_THRESHOLD: z.coerce.number().min(0).max(100).default(75),

    AI_PROVIDER: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      if (env.CORS_ORIGINS.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS must be set in production',
        });
      }
      if (env.EMAIL_PROVIDER === 'console') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_PROVIDER'],
          message: 'EMAIL_PROVIDER cannot be "console" in production',
        });
      }
    }

    // Browsers reject `SameSite=None` without `Secure`, and the failure is
    // silent — the cookie is simply never stored.
    if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAME_SITE'],
        message: 'COOKIE_SAME_SITE=none requires COOKIE_SECURE=true',
      });
    }

    if (env.STORAGE_DRIVER === 's3') {
      const missing = (
        ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const
      ).filter((key) => !env[key]);
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: `STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`,
        });
      }
    }

    if (env.STORAGE_DRIVER === 'cloudinary') {
      const missing = (
        ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const
      ).filter((key) => !env[key]);
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: `STORAGE_DRIVER=cloudinary requires: ${missing.join(', ')}`,
        });
      }
    }

    if (env.EMAIL_PROVIDER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_PORT)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=smtp requires SMTP_HOST and SMTP_PORT',
      });
    }

    if (env.EMAIL_PROVIDER === 'sendgrid' && !env.SENDGRID_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // A loud crash at boot beats an `undefined` surfacing three weeks later.
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiBaseUrl: env.API_BASE_URL,
  clientUrl: env.CLIENT_URL,
  logLevel: env.LOG_LEVEL,
  trustProxy: env.TRUST_PROXY,

  db: {
    uri: env.MONGODB_URI,
    name: env.MONGODB_DB_NAME,
  },

  redis: {
    url: env.REDIS_URL,
    enabled: env.REDIS_ENABLED,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    inviteSecret: env.JWT_INVITE_SECRET,
    accessExpirySeconds: env.JWT_ACCESS_EXPIRY_SECONDS,
    refreshExpiryDays: env.JWT_REFRESH_EXPIRY_DAYS,
    refreshRememberDays: env.JWT_REFRESH_REMEMBER_DAYS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },

  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    cookieDomain: env.COOKIE_DOMAIN,
    cookieSecure: env.COOKIE_SECURE,
    cookieSameSite: env.COOKIE_SAME_SITE,
    sessionMaxDevices: env.SESSION_MAX_DEVICES,
    corsOrigins: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : [env.CLIENT_URL],
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
  },

  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_CALLBACK_URL,
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      callbackUrl: env.MICROSOFT_CALLBACK_URL,
      enabled: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
    },
  },

  storage: {
    driver: env.STORAGE_DRIVER,
    localDir: env.LOCAL_UPLOAD_DIR,
    s3: {
      region: env.AWS_REGION,
      bucket: env.AWS_S3_BUCKET,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    },
  },

  email: {
    provider: env.EMAIL_PROVIDER,
    from: env.EMAIL_FROM,
    fromName: env.EMAIL_FROM_NAME,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    },
    sendgridApiKey: env.SENDGRID_API_KEY,
  },

  meeting: {
    provider: env.MEETING_PROVIDER,
    jitsiDomain: env.JITSI_DOMAIN,
  },

  docs: {
    enabled: env.ENABLE_API_DOCS,
  },

  rules: {
    attendanceLockAfterHours: env.ATTENDANCE_LOCK_AFTER_HOURS,
    defaultAttendanceThreshold: env.DEFAULT_ATTENDANCE_THRESHOLD,
  },

  ai: {
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    monthlyTokenBudget: env.AI_MONTHLY_TOKEN_BUDGET,
    enabled: Boolean(env.AI_PROVIDER && env.AI_API_KEY),
  },
} as const;

export type AppConfig = typeof config;
