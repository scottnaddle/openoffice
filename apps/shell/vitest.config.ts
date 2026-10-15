import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '../../fork/company-templates/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
})
