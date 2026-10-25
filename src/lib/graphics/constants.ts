// src/lib/graphics/constants.ts
//
// The footer is a constant on purpose: every block renders it and no spec field can hide it.

export const FOOTER_TEXT = 'Built on public game data. Independent, not affiliated with MLB.'
export const HANDLE = '@x9LabHQ'
export const SIZES = { landscape: { w: 1200, h: 675 }, portrait: { w: 1080, h: 1350 } } as const

export const GT = {
  paper: '#FAF8F3',
  ink: '#1A1A1A',
  accent: '#FF5722',
  muted: '#5C5A55',
  hair: '#D6D2C8',
  panel: '#F1EEE6',
  tile: '#BDB9AF',
} as const

export const X9_MARK_URL = '/brand/x9labs-mark.png'
