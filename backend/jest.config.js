/** @type {import('jest').Config} */
const common = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@nx/schema$': '<rootDir>/../packages/schema/src' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
module.exports = {
  projects: [
    { ...common, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...common,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
    },
  ],
};
