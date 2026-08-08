import winston from 'winston';

import { config } from './env';

/**
 * Fields that must never reach a log file. Applied as a formatter so redaction
 * cannot be forgotten at an individual call site.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'otp',
  'codehash',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'clientsecret',
  'verificationcode',
]);

const REDACTED = '[redacted]';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Date || value instanceof Error) return value;

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Mutates in place rather than returning a rebuilt object. Winston carries the
 * level and message on `Symbol` keys, and `Object.entries` does not see them —
 * rebuilding the info object silently drops every log line.
 */
const redactFormat = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      (info as Record<string, unknown>)[key] = REDACTED;
    } else {
      (info as Record<string, unknown>)[key] = redact(value, 1);
    }
  }
  return info;
});

/**
 * Raw ANSI rather than `winston.format.colorize`. The colorize formatter looks
 * its palette up through the `colors` package at transform time and throws
 * `colors[...] is not a function` when that lookup fails — which it does under
 * Node 24 and under Jest, killing the process on its first log line. Emitting
 * the escape codes directly removes the dependency and the failure mode.
 */
const ANSI = {
  reset: '[0m',
  dim: '[2m',
  red: '[31m',
  yellow: '[33m',
  green: '[32m',
  cyan: '[36m',
  blue: '[34m',
} as const;

const LEVEL_COLOUR: Record<string, string> = {
  error: ANSI.red,
  warn: ANSI.yellow,
  info: ANSI.green,
  http: ANSI.cyan,
  debug: ANSI.blue,
};

const supportsColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function paint(text: string, colour: string): string {
  return supportsColour ? `${colour}${text}${ANSI.reset}` : text;
}

const developmentFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, requestId, ...meta }) => {
    const colouredLevel = paint(level.toUpperCase().padEnd(5), LEVEL_COLOUR[level] ?? ANSI.reset);
    const rid = requestId ? paint(` [${String(requestId).slice(-8)}]`, ANSI.dim) : '';
    const extras = Object.keys(meta).length > 0 ? paint(` ${JSON.stringify(meta)}`, ANSI.dim) : '';
    const trace = stack ? `\n${stack}` : '';
    return `${paint(String(timestamp), ANSI.dim)} ${colouredLevel}${rid} ${message}${extras}${trace}`;
  }),
);

const productionFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

/** Tests get a plain, quiet format — no timestamps, no colour, no noise. */
const testFormat = winston.format.combine(
  redactFormat(),
  winston.format.errors({ stack: true }),
  winston.format.simple(),
);

function selectFormat(): winston.Logform.Format {
  if (config.isTest) return testFormat;
  return config.isProduction ? productionFormat : developmentFormat;
}

export const logger = winston.createLogger({
  level: config.logLevel,
  format: selectFormat(),
  defaultMeta: { service: 'peacefic-api' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
      silent: config.isTest,
    }),
  ],
  exitOnError: false,
});

/** Morgan writes HTTP access lines through Winston so there is one log pipeline. */
export const httpLogStream = {
  write(message: string): void {
    logger.http(message.trim());
  },
};
