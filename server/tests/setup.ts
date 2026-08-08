import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Boot config before anything imports `@/config/env`, which validates and
// exits the process when a required variable is missing.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-32';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-32';
process.env.JWT_INVITE_SECRET ??= 'test-invite-secret-that-is-long-enough-32';
process.env.MONGODB_URI ??= 'mongodb://placeholder';
process.env.REDIS_ENABLED = 'false';
process.env.EMAIL_PROVIDER = 'console';
process.env.BCRYPT_ROUNDS = '10';
process.env.LOG_LEVEL = 'error';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  // A replica set, not a standalone: the service layer uses multi-document
  // transactions and they are unavailable without one.
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  await mongoose.connect(replSet.getUri(), { dbName: 'peacefic_test' });
  await mongoose.connection.asPromise();
}, 120_000);

afterEach(async () => {
  // Tests never share state and never depend on execution order.
  const collections = await mongoose.connection.db?.collections();
  for (const collection of collections ?? []) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
}, 60_000);
