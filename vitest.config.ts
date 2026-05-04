import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['tests/setup.ts'],
    pool: 'forks', // forked children inherit process.env set in globalSetup
    passWithNoTests: true,
    environment: 'node',
  },
});
