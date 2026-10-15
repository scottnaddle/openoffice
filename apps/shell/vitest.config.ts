import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '../../fork/nas-sync/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
})
