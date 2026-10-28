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

/** Extra tokens for the "On this day" and "Stat of the day" cards. Colours that already exist in GT are reused, not repeated. */
export const OT = {
  border: '#E7E2D8',        // card and divider lines
  subtitle: '#5B5347',      // the subline under the headline
  kicker: GT.muted,         // #5C5A55: kicker and labels
  grey: '#B4B0A8',          // muted bars
  card: '#FFFFFF',
  tile: GT.panel,           // #F1EEE6
  cardRadius: 12,
  tileRadius: 10,
  pad: 40,                  // left and right margin of every card
} as const

/** Logical sizes of the two cards. Landscape exports at 2x (2400x1350); portrait (4:5) exports at 1x (1080x1350). */
export const OTD_SIZES = {
  landscape: { w: 1200, h: 675, ratio: 2, label: '16:9 · 2400x1350' },
  portrait: { w: 1080, h: 1350, ratio: 1, label: '4:5 · 1080x1350' },
} as const
