export default {
  testEnvironment: 'node',
  testTimeout: 20000,
  // Garantit le garde-fou "aucun email réel pendant les tests"
  // (services/email.js) et les limites de rate limiting élevées.
  setupFiles: ['<rootDir>/__tests__/helpers/setup-env.js'],
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
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  verbose: true
};
