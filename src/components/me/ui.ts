// src/components/me/ui.ts
//
// Shared look for the My x9Lab dashboard. Red Hat Display is the site's one font (CLAUDE.md section 6): display labels are Red Hat at weight 800, uppercase and letter-spaced; every
// number is Red Hat with tabular figures. The tokens are the site's own (cream page, white rounded cards, orange labels); nothing new is added.

import type { CSSProperties } from 'react'
import { C, SANS } from '@/components/team/ui'

export { C, SANS }
export const CARD: CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, minWidth: 0 }
export const EYEBROW: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontFamily: SANS }
export const NUMS: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFamily: SANS }
export const GREY = '#8a8275'
export const ROWLINE = `1px solid ${C.soft}`
export const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const dateLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
