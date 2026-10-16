import { describe, expect, it } from 'vitest'
import { firstFamily } from '../fonts'

describe('firstFamily', () => {
  it('takes the first family from a next/font variable', () => {
    expect(firstFamily("'__Outfit_a1b2c3', '__Outfit_Fallback_a1b2c3', system-ui")).toBe('__Outfit_a1b2c3')
    expect(firstFamily(' "JetBrains Mono", monospace ')).toBe('JetBrains Mono')
    expect(firstFamily('__Mono_x9')).toBe('__Mono_x9')
  })
  it('returns null for an empty value', () => {
    expect(firstFamily('')).toBeNull()
    expect(firstFamily('   ')).toBeNull()
  })
})
