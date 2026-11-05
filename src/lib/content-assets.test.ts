import { describe, it, expect } from 'vitest'
import { tidyLabel, cleanRole, isAssetPath, sniffImage } from './content-assets'

const bytes = (...n: number[]) => new Uint8Array(n)
describe('calendar images', () => {
  it('tells png, jpeg and webp from their first bytes, and refuses everything else', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png')
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe('webp')
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull(); expect(sniffImage(bytes())).toBeNull(); expect(sniffImage(bytes(0x89, 0x50))).toBeNull()
  })
  it('cleans roles and labels', () => {
    expect(cleanRole('thumbnail')).toBe('thumbnail'); expect(cleanRole('graphic')).toBe('graphic'); expect(cleanRole('banner')).toBe('other'); expect(cleanRole(undefined)).toBe('other')
    expect(tidyLabel('  Thumb   A ', 'x.png')).toBe('Thumb A'); expect(tidyLabel('', 'x.png')).toBe('x.png'); expect(tidyLabel('y'.repeat(200), 'x')).toHaveLength(80)
  })
  it('only accepts the exact path shape for its own item', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000', f = '223e4567-e89b-12d3-a456-426614174000'
    expect(isAssetPath(id, `${id}/${f}.png`)).toBe(true); expect(isAssetPath(id, `${id}/${f}.webp`)).toBe(true)
    for (const bad of [`${f}/${f}.png`, `${id}/../${f}.png`, `${id}/${f}.gif`, `${id}/${f}.png/x`, `../${id}/${f}.png`, `${id}/x.png`, '', null, 5]) expect(isAssetPath(id, bad)).toBe(false)
  })
})
