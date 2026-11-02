import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAINTENANCE_GATED_PREFIXES } from './maintenance-gates'

// src/proxy.ts only runs for the paths in its matcher. A maintenance-gated prefix missing from it would silently stop being gated.
describe('proxy matcher', () => {
  const src = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')
  const block = src.slice(src.indexOf('export const config'))
  const list = block.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? ''
  const entries = [...list.matchAll(/'([^']+)'/g)].map(m => m[1])

  it('covers /admin', () => { expect(entries).toContain('/admin/:path*') })
  it('covers every maintenance-gated prefix', () => {
    for (const p of MAINTENANCE_GATED_PREFIXES) expect(entries, `${p} is gated but missing from the proxy matcher`).toContain(`${p}/:path*`)
  })
  it('lists nothing else', () => {
    expect(entries.length).toBe(MAINTENANCE_GATED_PREFIXES.length + 1)
  })
})
