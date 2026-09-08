/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/setup/'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  globalSetup: '<rootDir>/src/__tests__/setup/globalSetup.ts',
  setupFiles: ['<rootDir>/src/__tests__/setup/setupEnv.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/testDbCleanup.ts'],
};

