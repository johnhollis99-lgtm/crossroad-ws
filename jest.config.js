module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  testMatch: ['**/lib/__tests__/**/*.test.ts'],
};
