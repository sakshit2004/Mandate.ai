import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['server/src/test-setup.ts'],
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
