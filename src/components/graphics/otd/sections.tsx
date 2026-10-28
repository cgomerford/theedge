// src/components/graphics/otd/sections.tsx
//
// The section bodies for the "On this day" and "Stat of the day" cards. Each takes plain data (src/lib/graphics/otd-types.ts) and fills the card it is put in.
// Long text is cut with an ellipsis or shrunk, never allowed to overflow. No variant draws an image.

import type { CSSProperties } from 'react'
import { SANS } from '@/components/team/ui'
import { GT, OT } from '@/lib/graphics/constants'
import type { GameCell, HBar, KvRow, LinescoreRow, TimelinePoint, TradeGroup, VBar } from '@/lib/graphics/otd-types'
import { CAPS } from './parts'

const NOWRAP: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }
const fill: CSSProperties = { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }
const tone = (t: 'orange' | 'grey') => (t === 'orange' ? GT.accent : OT.grey)

// 1. Key-value table: label left (semibold), value right (bold), a 1px divider between rows.
export function KvBody({ rows, portrait }: { rows: KvRow[]; portrait?: boolean }) {
  return (
    <div style={{ ...fill, padding: portrait ? '4px 22px' : '2px 20px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ flex: 1, minHeight: 0, maxHeight: portrait ? 92 : 80, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 16, borderTop: i ? `1px solid ${OT.border}` : 0 }}>
          <span style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 26 : 20, color: GT.ink }}>{r.label}</span>
          <span style={{ ...NOWRAP, maxWidth: portrait ? 460 : 300, textAlign: 'right', fontFamily: SANS, fontWeight: 700, fontSize: portrait ? 28 : 21, color: GT.ink, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// 2. Linescore: TEAM, innings 1..N (extra innings supported), R. Highlighted innings: cream cell, orange text when the value is not 0, orange inning number.
export function LinescoreBody({ innings, highlight, rows, portrait }: { innings: number; highlight: number[]; rows: LinescoreRow[]; portrait?: boolean }) {
  const cols = `${portrait ? 96 : 84}px repeat(${innings}, minmax(0, 1fr)) ${portrait ? 80 : 70}px`
  const hi = new Set(highlight)
  const head: CSSProperties = { ...CAPS, fontSize: portrait ? 15 : 13, color: OT.kicker, textAlign: 'center' }
  return (
    <div style={{ ...fill, padding: portrait ? '10px 22px' : '8px 20px', gap: 4, justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: 34, borderBottom: `1px solid ${OT.border}`, flexShrink: 0 }}>
        <span style={{ ...head, textAlign: 'left' }}>Team</span>
        {Array.from({ length: innings }, (_, i) => <span key={i} style={{ ...head, color: hi.has(i + 1) ? GT.accent : OT.kicker }}>{i + 1}</span>)}
        <span style={{ ...head, color: GT.ink }}>R</span>
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ flex: 1, minHeight: 0, maxHeight: portrait ? 230 : 200, display: 'grid', gridTemplateColumns: cols, alignItems: 'stretch', borderTop: ri ? `1px solid ${OT.border}` : 0 }}>
          <span style={{ ...NOWRAP, display: 'flex', alignItems: 'center', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 30 : 26, color: GT.ink }}>{r.team}</span>
          {Array.from({ length: innings }, (_, i) => {
            const v = r.runs[i] ?? 0
            const on = hi.has(i + 1)
            return <span key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? OT.tile : 'transparent', borderRadius: on ? 6 : 0, margin: on ? '4px 3px' : 0, fontFamily: SANS, fontWeight: on && v !== 0 ? 800 : 600, fontSize: portrait ? 30 : 28, color: on && v !== 0 ? GT.accent : GT.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          })}
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 36 : 34, color: GT.ink, fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
        </div>
      ))}
    </div>
  )
}

// 3. Timeline: a horizontal line with 2 to 5 orange dots; date, label and an optional orange detail centred under each dot. Each point owns an equal column, so end labels stay inside the card.
export function TimelineBody({ points, portrait }: { points: TimelinePoint[]; portrait?: boolean }) {
  const list = points.slice(0, 5)
  const n = Math.max(list.length, 1)
  return (
    <div style={{ ...fill, justifyContent: 'center', padding: portrait ? '24px 22px' : '10px 20px' }}>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 8 }}>
        <div aria-hidden style={{ position: 'absolute', top: 11, left: `${50 / n}%`, right: `${50 / n}%`, height: 2, background: OT.border }} />
        {list.map((p, i) => (
          <div key={i} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 22, background: GT.accent, border: `4px solid ${OT.card}`, boxShadow: `0 0 0 1px ${GT.accent}`, boxSizing: 'border-box', position: 'relative', zIndex: 1 }} />
            <span style={{ ...NOWRAP, maxWidth: '100%', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 30 : 26, color: GT.ink, marginTop: 8 }}>{p.date}</span>
            <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 24 : 20, color: GT.ink, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.label}</span>
            {p.detail ? <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 20 : 16, color: GT.accent, lineHeight: 1.25, maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.detail}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// 4a. Vertical bars: value above each bar, category below, orange or grey per bar, an optional vertical marker between two bars with a small caps label, and an optional orange note top right.
export function VBarsBody({ bars, marker, note, max, portrait }: { bars: VBar[]; marker?: { before: number; label: string }; note?: string; max?: number; portrait?: boolean }) {
  const n = Math.max(bars.length, 1)
  const top = max ?? Math.max(1, ...bars.map(b => b.value))
  return (
    <div style={{ ...fill, padding: portrait ? '10px 22px 14px' : '8px 20px 12px', gap: 6 }}>
      <div style={{ height: 24, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {note ? <span style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 700, fontSize: portrait ? 18 : 15, color: GT.accent }}>{note}</span> : null}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 10 }}>
        {bars.map((b, i) => {
          const pct = Math.max(2, (b.value / top) * 84)
          return (
            <div key={i} style={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${pct}% + 4px)`, textAlign: 'center', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 28 : 24, color: GT.ink, fontVariantNumeric: 'tabular-nums' }}>{b.display ?? b.value}</span>
                <span style={{ position: 'absolute', left: '14%', right: '14%', bottom: 0, height: `${pct}%`, background: tone(b.tone), borderRadius: '6px 6px 0 0' }} />
              </div>
              <span style={{ ...NOWRAP, textAlign: 'center', paddingTop: 6, fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 20 : 17, color: OT.kicker, borderTop: `1px solid ${OT.border}` }}>{b.label}</span>
            </div>
          )
        })}
        {marker && marker.before > 0 && marker.before < n ? (
          <>
            <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${(marker.before / n) * 100}% - 5px)`, width: 0, borderLeft: `2px dashed ${GT.ink}` }} />
            <span style={{ ...CAPS, position: 'absolute', top: -2, left: `calc(${(marker.before / n) * 100}% + 4px)`, fontSize: portrait ? 14 : 12, color: GT.ink, background: OT.card, padding: '0 4px' }}>{marker.label}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

// 4b. Horizontal comparison bars: label left, the bar, the value at the bar's end. A shared scale max can be set.
export function HBarsBody({ rows, max, portrait }: { rows: HBar[]; max?: number; portrait?: boolean }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value))
  return (
    <div style={{ ...fill, padding: portrait ? '8px 22px' : '4px 20px', justifyContent: 'center' }}>
      {rows.map((r, i) => {
        const pct = Math.min(100, (r.value / top) * 100) * 0.78
        return (
          <div key={i} style={{ flex: 1, minHeight: 0, maxHeight: portrait ? 110 : 84, display: 'grid', gridTemplateColumns: `${portrait ? 100 : 72}px minmax(0, 1fr)`, alignItems: 'center', gap: 12 }}>
            <span style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 28 : 24, color: GT.ink }}>{r.label}</span>
            <div style={{ position: 'relative', height: portrait ? 44 : 36 }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: tone(r.tone), borderRadius: 6 }} />
              <span style={{ position: 'absolute', left: `calc(${pct}% + 10px)`, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 30 : 26, color: GT.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.display}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 5. Series scores: one cell per game (4 to 7), "GAME n", a big score and a winner line in caps. Wins for the featured team are cream with an orange winner line; the others are white with a border and a grey one.
export function GamesBody({ games, portrait }: { games: GameCell[]; portrait?: boolean }) {
  const list = games.slice(0, 7)
  const cols = portrait ? Math.min(Math.max(list.length, 1), 4) : Math.max(list.length, 1)
  return (
    <div style={{ ...fill, padding: portrait ? '16px 22px' : '12px 20px', justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10 }}>
        {list.map((g, i) => (
          <div key={i} style={{ minWidth: 0, textAlign: 'center', padding: portrait ? '22px 8px' : '20px 6px', borderRadius: OT.tileRadius, background: g.won ? OT.tile : OT.card, border: g.won ? `1px solid ${OT.tile}` : `1px solid ${OT.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...CAPS, fontSize: portrait ? 15 : 13, color: OT.kicker }}>Game {g.n}</span>
            <span style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 44 : 38, color: GT.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.28 }}>{g.score}</span>
            <span style={{ ...CAPS, ...NOWRAP, fontSize: portrait ? 15 : 13, color: g.won ? GT.accent : OT.grey }}>{g.winner}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 7. Trade panel: groups with an orange caps label and a bold name list, then (under a divider) an optional note block: small subtitle line, one big value, one orange detail line.
export function TradeBody({ groups, note, portrait }: { groups: TradeGroup[]; note?: { title: string; value: string; detail?: string }; portrait?: boolean }) {
  return (
    <div style={{ ...fill, padding: portrait ? '14px 22px' : '10px 20px', gap: 10 }}>
      {groups.map((g, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <div style={{ ...CAPS, ...NOWRAP, fontSize: portrait ? 16 : 14, color: GT.accent }}>{g.label}</div>
          {g.names.map((nm, j) => <div key={j} style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 32 : 26, color: GT.ink, lineHeight: 1.25 }}>{nm}</div>)}
        </div>
      ))}
      {note ? (
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${OT.border}`, paddingTop: 10, minWidth: 0 }}>
          <div style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 400, fontSize: portrait ? 18 : 15, color: OT.subtitle }}>{note.title}</div>
          <div style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 48 : 40, color: GT.ink, lineHeight: 1.28, fontVariantNumeric: 'tabular-nums' }}>{note.value}</div>
          {note.detail ? <div style={{ ...NOWRAP, fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 18 : 15, color: GT.accent }}>{note.detail}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

// Extra body for a single headline number set, e.g. a slash line: big line, caps caption, orange detail.
export function SlashBody({ line, caption, detail, portrait }: { line: string; caption: string; detail?: string; portrait?: boolean }) {
  return (
    <div style={{ ...fill, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '10px 20px', gap: 6 }}>
      <div style={{ ...NOWRAP, maxWidth: '100%', fontFamily: SANS, fontWeight: 800, fontSize: portrait ? 64 : 52, color: GT.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.28 }}>{line}</div>
      <div style={{ ...CAPS, fontSize: portrait ? 17 : 14, color: OT.kicker }}>{caption}</div>
      {detail ? <div style={{ ...NOWRAP, maxWidth: '100%', fontFamily: SANS, fontWeight: 700, fontSize: portrait ? 24 : 19, color: GT.accent }}>{detail}</div> : null}
    </div>
  )
}
