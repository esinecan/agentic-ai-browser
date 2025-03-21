export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json'
      },
    ],
  },
  // Fix module mapping issues
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)$': '$1',
  },
  // Explicitly ignore compiled files and utility files
  testPathIgnorePatterns: [
    "node_modules/",
    ".history/",
    "dist/",  // Explicitly ignore the dist folder
    "src/__tests__/utils/mocks.ts",
    "src/__tests__/utils/testHelpers.ts"
  ],
  // Setup files
  setupFilesAfterEnv: ['./jest.setup.js'],
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    "node_modules/",
    "dist/",
    "__tests__/"
  ],
  verbose: true,
  testTimeout: 10000
}