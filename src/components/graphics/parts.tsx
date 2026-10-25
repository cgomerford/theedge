// src/components/graphics/parts.tsx
//
// Shared pieces for the six blocks, in the Scout Report look: cream card, white rounded section
// panels with a "§ 01" header, beige stat tiles, team logos and headshots. Pure: props in, markup out.
// One font (Red Hat via SANS); labels are uppercase + tracked + tabular-nums instead of a second family.

import XMarkInline from '@/components/graphics/XMarkInline'
import type { CSSProperties, ReactNode } from 'react'
import { SANS } from '@/components/team/ui'
import { GT } from '@/lib/graphics/constants'
import { teamColor, teamStyle } from '@/lib/graphics/teams'
import type { Chip, GraphicImages, Stat, TeamKey } from '@/lib/graphics/types'

export const LABEL: CSSProperties = {
  fontFamily: SANS, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', fontVariantNumeric: 'tabular-nums',
}
export const NUM: CSSProperties = { fontFamily: SANS, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const LINE = '#e7e2d8'

/** Text-only team pill, used in lists where a logo would be too big. */
export function TeamChip({ chip, size = 20 }: { chip: Chip | { text: string; team: TeamKey }; size?: number }) {
  const s = teamStyle(chip.team)
  return (
    <span style={{ ...LABEL, fontWeight: 700, fontSize: size, lineHeight: 1, padding: `${size * 0.3}px ${size * 0.55}px`, borderRadius: 4, background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {chip.text}
    </span>
  )
}

/** Team logo from the preloaded images; falls back to the text chip so a failed load never leaves a hole. */
export function TeamLogo({ abbr, images, h = 44 }: { abbr: TeamKey; images?: GraphicImages; h?: number }) {
  const src = images?.[`team:${abbr}`]
  if (!src) return <TeamChip chip={{ text: abbr, team: abbr }} size={Math.round(h * 0.4)} />
  // eslint-disable-next-line @next/next/no-img-element -- exported via html-to-image; a plain img from a data URL is what it needs
  return <img src={src} alt={abbr} style={{ height: h, width: 'auto', display: 'block' }} />
}

/** Round headshot with a team-colour ring; an empty ring when the photo did not load. */
export function Avatar({ playerId, images, size, ring }: { playerId: number; images?: GraphicImages; size: number; ring: string }) {
  const src = images?.[`player:${playerId}`]
  const box: CSSProperties = { width: size, height: size, borderRadius: '50%', border: `3px solid ${ring}`, background: GT.paper, flexShrink: 0, objectFit: 'cover', display: 'block' }
  // eslint-disable-next-line @next/next/no-img-element -- exported via html-to-image from a data URL
  return src ? <img src={src} alt="" style={box} /> : <div style={box} />
}

/** Blank table cell. */
export function Dot() {
  return <span aria-hidden style={{ display: 'inline-block', width: 4, height: 4, borderRadius: 4, background: GT.tile }} />
}

/** White rounded section: "§ 01 TITLE" header, optional right hint, footnote under the body. */
export function Panel({ n = 1, title, hint, children, style, note, portrait }: { n?: number; title: string; hint?: string; children: ReactNode; style?: CSSProperties; note?: string; portrait?: boolean }) {
  return (
    <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: portrait ? '12px 22px' : '9px 20px', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
        <span style={{ ...LABEL, fontWeight: 800, fontSize: portrait ? 16 : 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: GT.accent, fontWeight: 600, marginRight: 8 }}><XMarkInline /> {String(n).padStart(2, '0')}</span>{title}
        </span>
        {hint && <span style={{ fontFamily: SANS, fontSize: 13, color: GT.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{hint}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
      {note && <div style={{ fontFamily: SANS, fontSize: 13, color: GT.muted, padding: '0 20px 10px', flexShrink: 0 }}>{note}</div>}
    </div>
  )
}

/** Beige rounded stat tiles: small label, big value, orange sub line. */
export function TileStrip({ tiles, portrait, inset }: { tiles: Stat[]; portrait: boolean; inset?: boolean }) {
  if (!tiles.length) return null
  const cols = portrait ? 2 : tiles.length === 6 ? 3 : Math.min(tiles.length, 4)
  const tight = !portrait && tiles.length > cols  // wrapped onto a second row: smaller tiles so the panel above keeps its room
  return (
    <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10, padding: inset ? '0 20px 16px' : 0 }}>
      {tiles.map((t, i) => (
        <div key={i} style={{ minWidth: 0, background: GT.panel, borderRadius: 10, padding: portrait ? '14px 18px' : tight ? '7px 13px' : '11px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4 }}>
          <div style={{ ...LABEL, fontSize: portrait ? 14 : tight ? 12 : 13, color: GT.muted, lineHeight: 1.2 }}>{t.label}</div>
          <div>
            <div style={{ ...NUM, fontSize: t.value && t.value.length > 11 ? (portrait ? 30 : 27) : portrait ? 40 : tight ? 26 : 34, lineHeight: 1.1 }}>{t.value}</div>
            {t.sub && <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: GT.accent, lineHeight: 1.25 }}>{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Pitch table: Pitch (with a team-colour usage bar), Speed (value), then spec.columns from cells. */
export function PitchTable({ rows, columns, portrait, color }: { rows: Stat[]; columns: string[]; portrait: boolean; color: string }) {
  const grid = `1.7fr 1.05fr ${columns.map(() => '1fr').join(' ')}`
  const cell: CSSProperties = { textAlign: 'right', minWidth: 0 }
  const top = Math.max(1, ...rows.map(r => r.n ?? 0))
  const d = density(rows.length, 4.5)  // more pitches than the preset's four: tighten rows so they still fit
  return (
    <div style={{ padding: portrait ? '12px 22px' : '8px 20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ ...LABEL, fontSize: 12, color: GT.muted, display: 'grid', gridTemplateColumns: grid, gap: 8, paddingBottom: 6, borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
        <span>Pitch</span><span style={cell}>Speed</span>{columns.map(c => <span key={c} style={cell}>{c}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center', padding: `${(portrait ? 12 : 7) * d}px 0`, borderBottom: `1px solid ${GT.panel}`, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: (portrait ? 26 : 23) * d, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
            <div style={{ height: 8, marginTop: 3, borderRadius: 4, background: GT.panel }}>
              <div style={{ height: '100%', borderRadius: 4, background: color, opacity: 1 - Math.min(i, 5) * 0.14, width: `${Math.max(4, ((r.n ?? 0) / top) * 100)}%` }} />
            </div>
          </div>
          <span style={{ ...NUM, ...cell, fontWeight: 500, fontSize: 16, color: GT.muted }}>{r.value}</span>
          {columns.map((_, ci) => {
            const v = r.cells?.[ci]
            return <span key={ci} style={{ ...NUM, ...cell, fontSize: (portrait ? 24 : 22) * d, fontWeight: ci === 0 ? 800 : 600 }}>{v ? v : <Dot />}</span>
          })}
        </div>
      ))}
    </div>
  )
}

export const byGroup = (stats: Stat[], g: string) => stats.filter(s => s.group === g)

/** Shrink factor (0.6 to 1) so `count` rows still fit a panel sized for `capacity` rows. */
export const density = (count: number, capacity: number) => Math.max(0.6, Math.min(1, capacity / Math.max(count, 1)))

/** Team colour for the first real team on a spec (bars, headshot ring). */
export function specColor(chips: Chip[], player?: { team?: string }): string {
  const t = player?.team ?? chips.find(c => c.team !== 'neutral')?.team
  return t ? teamColor(t) : '#12295A'
}
