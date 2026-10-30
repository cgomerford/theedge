import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit tests for the admin story video (pure logic only — no DOM needed).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/components/admin/story/**/*.test.ts', 'src/components/admin/stat-line/**/*.test.ts', 'src/components/admin/story-v5/**/*.test.ts', 'src/lib/graphics/**/*.test.ts', 'src/lib/sequencing-lab/**/*.test.ts', 'src/lib/stuff-lab/**/*.test.ts',
      'src/lib/follows/**/*.test.ts',
      'src/lib/article-checks.test.ts',
      'src/lib/seo/**/*.test.ts',
      'src/components/pitch-shape/**/*.test.ts',
      'src/lib/pitch-shape/**/*.test.ts',
      'src/components/me/**/*.test.tsx', 'src/lib/ask-lookups.test.ts', 'src/components/graphics/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
