import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase, supportsTransactions } from '@/config/database';
import { config } from '@/config/env';
import { logger } from '@/config/logger';

/**
 * Verifies the configured database is reachable, reports whether it can run
 * multi-document transactions, and lists the collections that already exist.
 * Run with: npm run check:db --workspace=server
 */
async function main(): Promise<void> {
  const redacted = config.db.uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  logger.info('Connecting', { uri: redacted, database: config.db.name });

  const started = Date.now();
  await connectDatabase();
  logger.info(`Connected in ${Date.now() - started}ms`);

  const admin = mongoose.connection.db?.admin();
  const info = await admin?.serverStatus().catch(() => null);

  logger.info('Server', {
    version: info?.version ?? 'unknown',
    transactions: supportsTransactions() ? 'supported' : 'NOT supported (standalone)',
  });

  const collections = await mongoose.connection.db?.listCollections().toArray();
  logger.info('Collections', {
    count: collections?.length ?? 0,
    names: (collections ?? []).map((c) => c.name).sort(),
  });

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Connection check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
