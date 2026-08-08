/**
 * Environment for tests that do not need a database.
 *
 * `@/config/env` validates at import time and exits the process when a required
 * variable is missing, so these must be set before any module is loaded.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-32';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-32';
process.env.JWT_INVITE_SECRET ??= 'test-invite-secret-that-is-long-enough-32';
process.env.MONGODB_URI ??= 'mongodb://placeholder';
process.env.REDIS_ENABLED = 'false';
process.env.EMAIL_PROVIDER = 'console';
process.env.BCRYPT_ROUNDS = '10';
process.env.LOG_LEVEL = 'error';
