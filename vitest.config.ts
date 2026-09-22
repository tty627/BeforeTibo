import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Saved runs can contain generated tests; only this project's test tree is a suite.
    include: ['tests/**/*.test.ts'],
  },
});
