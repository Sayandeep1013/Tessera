import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    /**
     * `app/**` is here because it was missing, and its absence was silent.
     * docs/specs/12 §10 requires app/api/ai/agent/__tests__/route.test.ts; that
     * file could have been written and would simply never have run. A test glob
     * that quietly excludes a directory is worse than no glob — it reports green.
     */
    include: [
      'lib/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.ts',
      'components/**/__tests__/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    globals: false,
  },
  resolve: {
    // Route handlers import via the @/ alias the app uses.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
