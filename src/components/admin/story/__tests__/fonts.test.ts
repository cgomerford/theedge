import { describe, expect, it } from 'vitest'
import { firstFamily } from '../fonts'

describe('firstFamily', () => {
  it('takes the first family from a next/font variable', () => {
    expect(firstFamily("'__Red_Hat_Display_a1b2c3', '__Red_Hat_Display_Fallback_a1b2c3', system-ui")).toBe('__Red_Hat_Display_a1b2c3')
    expect(firstFamily(' "Red Hat Display", sans-serif ')).toBe('Red Hat Display')
    expect(firstFamily('__Mono_x9')).toBe('__Mono_x9')
  })
  it('returns null for an empty value', () => {
    expect(firstFamily('')).toBeNull()
    expect(firstFamily('   ')).toBeNull()
  })
})
