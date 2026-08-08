const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  '^@peacefic/shared$': '<rootDir>/../shared/src/index.ts',
};

const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: { isolatedModules: true } }],
};

/**
 * Split into two projects so unit tests do not pay for a database.
 *
 * Previously every suite ran `setupFilesAfterEnv`, which boots an in-memory
 * replica set — including pure-function tests that never touch Mongo. Under
 * full-suite contention that startup would occasionally exceed its timeout and
 * fail tests that had nothing to do with the database.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  /**
   * Must live at the root. Jest silently ignores `testTimeout` inside a
   * `projects` entry, so setting it there leaves every test on the 5s default —
   * which passes on a fast machine and fails under contention.
   *
   * Integration tests drive real HTTP against an in-memory replica set and pay
   * a bcrypt hash per account created, so they need the headroom. Unit tests
   * finish in milliseconds and are unaffected by a generous ceiling.
   */
  testTimeout: 60000,

  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
      setupFiles: ['<rootDir>/tests/env.ts'],
      moduleNameMapper,
      transform,
      clearMocks: true,
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      moduleNameMapper,
      transform,
      clearMocks: true,
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/database/seeders/**',
    '!src/database/migrations/**',
    '!src/docs/**',
  ],
  coverageThreshold: {
    global: { statements: 75, branches: 70, functions: 75, lines: 75 },
  },
};
