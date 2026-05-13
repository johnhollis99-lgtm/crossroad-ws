module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  // Pick up both legacy lib/__tests__ and the new src/**/__tests__ trees.
  testMatch: [
    '**/lib/__tests__/**/*.test.ts',
    '**/src/**/__tests__/**/*.test.ts',
  ],
};
