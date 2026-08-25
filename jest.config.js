export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]s$': 'babel-jest'
  },
  coverageDirectory: './coverage',
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  verbose: true
};
