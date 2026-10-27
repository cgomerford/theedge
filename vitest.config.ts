import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit tests for the admin story video (pure logic only — no DOM needed).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/components/admin/story/**/*.test.ts', 'src/components/admin/stat-line/**/*.test.ts', 'src/components/admin/story-v5/**/*.test.ts', 'src/lib/graphics/**/*.test.ts', 'src/lib/ask-lookups.test.ts', 'src/components/graphics/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
