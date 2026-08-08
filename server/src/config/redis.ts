import Redis, { type RedisOptions } from 'ioredis';

import { config } from './env';
import { logger } from './logger';

const options: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
};

let client: Redis | null = null;
let available = false;

export function getRedis(): Redis | null {
  if (!config.redis.enabled) return null;
  if (!client) {
    client = new Redis(config.redis.url, options);

    client.on('ready', () => {
      available = true;
      logger.info('Redis connected');
    });
    client.on('error', (error) => {
      if (available) logger.error('Redis error', { error: error.message });
      available = false;
    });
    client.on('end', () => {
      available = false;
    });
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn('Redis is disabled. Caching, queues and cross-instance sockets are degraded.');
    return;
  }
  try {
    await redis.connect();
  } catch (error) {
    // Redis is a performance dependency, not a correctness one for a single
    // instance, so a failure here degrades rather than blocks boot.
    logger.error('Redis connection failed; continuing without it', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = null;
  available = false;
}

export function isRedisHealthy(): boolean {
  return !config.redis.enabled || available;
}

/** Duplicated connections are required by the Socket.IO adapter and BullMQ. */
export function duplicateRedis(): Redis | null {
  const redis = getRedis();
  return redis ? redis.duplicate() : null;
}
