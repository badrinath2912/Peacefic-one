import dns from "node:dns";

// Force Node to use Google DNS
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import mongoose from 'mongoose';

import { config } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);
if (config.isDevelopment) {
  mongoose.set('debug', config.logLevel === 'debug');
}

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  connecting = mongoose
    .connect(config.db.uri, {
      dbName: config.db.name,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 20,
      minPoolSize: 2,
      retryWrites: true,
      autoIndex: !config.isProduction,
    })
    .then((m) => {
      logger.info('MongoDB connected', { database: config.db.name });
      return m;
    })
    .catch((error) => {
      connecting = null;
      throw error;
    });

  return connecting;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  connecting = null;
  logger.info('MongoDB disconnected');
}

export function isDatabaseHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Transactions require a replica set. A standalone local Mongo cannot run them,
 * so single-node development falls back to running the callback unwrapped
 * rather than failing every write that spans collections.
 */
export async function withTransaction<T>(
  callback: (session: mongoose.ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (!supportsTransactions()) {
    return callback(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

let transactionSupport: boolean | null = null;

export function supportsTransactions(): boolean {
  if (transactionSupport !== null) return transactionSupport;
  const client = mongoose.connection.getClient();
  // topology description is not part of the public typings
  const topology = (client as unknown as { topology?: { description?: { type?: string } } })
    .topology;
  const type = topology?.description?.type;
  transactionSupport = type === 'ReplicaSetWithPrimary' || type === 'Sharded';
  return transactionSupport;
}

export function resetTransactionSupportCache(): void {
  transactionSupport = null;
}

mongoose.connection.on('error', (error) => {
  logger.error('MongoDB connection error', { error: error.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});
