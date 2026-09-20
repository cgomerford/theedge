// src/components/team/ui.tsx
//
// Shared, server-safe building blocks for the redesigned team page. Inline
// styles + plain divs (no hooks, no client JS) so every card server-renders.
//
// House style (CLAUDE.md §6): cream #FAF8F3 / orange #FF5722 / yellow #FDE047 /
// black #1A1A1A, Outfit (base sans, the sitewide default — also used, heavy, for
// headers and bold text) · JetBrains Mono (light data labels), § section markers. Team pages are the documented exception to
// zero-radius, so cards keep the soft corners the old team page had.
//
// Rank language: "3rd of 30", green → red by rank. A rank chip is always
// accompanied by the number it ranks — never shown alone.

import Link from 'next/link'
import type { Metric } from '@/lib/team-profile'
import { ordinal } from '@/lib/ordinal'

export const C = {
  cream: '#FAF8F3', card: '#fff', line: '#e7e2d8', soft: '#f1eee6', ink: '#1A1A1A', mute: '#8a8275', faint: '#a89e8c',
  orange: '#FF5722', yellow: '#FDE047', good: '#1D9E75', bad: '#D4533B',
}
// Fonts come from the next/font CSS variables set in app/layout.tsx — NOT
// literal family names (next/font hashes its family names, so 'Fraunces' as a
// string never resolves). Outfit (the Effra stand-in) is the sitewide brand
// default and is used for ALL headers and bold text; mono is only for light
// small-caps labels and plain numbers.
export const SANS = 'var(--font-outfit), system-ui, sans-serif'
export const MONO = 'var(--font-jetbrains), ui-monospace, monospace'
// Headers and big numbers use the rounded brand face (Outfit) at heavy weight —
// NOT Bebas Neue (condensed caps). DISPLAY_WEIGHT is applied wherever DISPLAY is.
export const DISPLAY = SANS
export const DISPLAY_WEIGHT = 800

export function rankTone(rank: number | null, of: number): { fg: string; bg: string; bar: string } {
  if (rank == null || of < 2) return { fg: '#8a8275', bg: '#f1eee6', bar: '#cfc8b8' }
  const p = (of - rank) / (of - 1)          // 1 = best
  if (p >= 0.83) return { fg: '#085041', bg: '#E1F5EE', bar: '#1D9E75' }   // top 5
  if (p >= 0.66) return { fg: '#0F6E56', bg: '#EAF6F0', bar: '#5DCAA5' }   // top ~10
  if (p >= 0.34) return { fg: '#5b5347', bg: '#f1eee6', bar: '#cfc8b8' }   // middle
  if (p >= 0.17) return { fg: '#8A3A24', bg: '#FBEAE4', bar: '#F0997B' }   // bottom ~10
  return { fg: '#7A1F14', bg: '#FAD9D2', bar: '#D4533B' }                  // bottom 5
}

export function Section({ id, num, title, sub, children }: { id: string; num: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 44, scrollMarginTop: 64 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.orange, letterSpacing: '.16em' }}>§ {num}</span>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, letterSpacing: '-.01em', margin: 0, color: C.ink, lineHeight: 1.1 }}>{title}</h2>
      </div>
      {sub && <p style={{ fontFamily: SANS, fontSize: 14, color: '#5b5347', margin: '-6px 0 16px', maxWidth: 760, lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </section>
  )
}

export function Card({ title, note, children, style, id }: { title?: string; note?: string; children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <div id={id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, minWidth: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700 }}>{title}</div>
          {note && <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{note}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', padding: '22px 0', textAlign: 'center', margin: 0 }}>{children}</p>
}

export function Foot({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, lineHeight: 1.6, margin: '12px 0 0' }}>{children}</p>
}

export function RankChip({ m }: { m: Pick<Metric, 'rank' | 'of'> }) {
  const t = rankTone(m.rank, m.of)
  return (
    <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color: t.fg, background: t.bg, whiteSpace: 'nowrap' }}>
      {m.rank == null ? '—' : `${ordinal(m.rank)}`}
    </span>
  )
}

/**
 * One row per metric: label · value · percentile bar · rank chip.
 * Bar length = percentile among the clubs that have the number (longer =
 * better, regardless of whether higher or lower raw values are good), with a
 * tick at the league median so "above/below average" reads at a glance.
 */
export function RankBars({ metrics }: { metrics: Metric[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {metrics.map(m => {
        const t = rankTone(m.rank, m.of)
        const pct = m.rank == null || m.of < 2 ? 0 : ((m.of - m.rank) / (m.of - 1)) * 100
        return (
          <div key={m.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 128px) 54px minmax(0, 1fr) 40px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#5b5347' }}>{m.label}</span>
            <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, color: C.ink, textAlign: 'right' }} title={`League average ${m.leagueDisplay}`}>{m.display}</span>
            <div style={{ position: 'relative', height: 8, background: C.soft, borderRadius: 4 }} title={`League average ${m.leagueDisplay}`}>
              <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', background: t.bar, borderRadius: 4 }} />
              <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#1A1A1A', opacity: 0.35 }} />
            </div>
            <RankChip m={m} />
          </div>
        )
      })}
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 2 }}>Bar = rank among MLB clubs (longer = better) · line = league median · hover a value for the league average</div>
    </div>
  )
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | null }) {
  const color = tone === 'good' ? C.good : tone === 'bad' ? C.bad : C.ink
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, lineHeight: 1.1, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/** Team vs league-average, two slim bars per row (batted ball, OAA, etc.). */
export function VersusBars({ rows, unit = '%', decimals = 1, signed = false, color }: {
  rows: { label: string; team: number | null; league: number | null }[]; unit?: string; decimals?: number; signed?: boolean; color: string
}) {
  const max = Math.max(1, ...rows.flatMap(r => [Math.abs(r.team ?? 0), Math.abs(r.league ?? 0)]))
  const f = (v: number | null) => (v == null ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(decimals)}${unit}`)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5b5347' }}>{r.label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {([['Team', r.team, color], ['MLB avg', r.league, '#cfc8b8']] as const).map(([nm, v, col]) => (
              <div key={nm} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 54px', gap: 6, alignItems: 'center' }}>
                <div style={{ position: 'relative', height: 7, background: C.soft, borderRadius: 4 }}>
                  {signed && <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#1A1A1A', opacity: 0.3 }} />}
                  {v != null && (
                    signed
                      ? <div style={{ position: 'absolute', top: 0, bottom: 0, background: v >= 0 ? col : C.bad, borderRadius: 4, ...(v >= 0 ? { left: '50%', width: `${(Math.abs(v) / max) * 50}%` } : { right: '50%', width: `${(Math.abs(v) / max) * 50}%` }) }} />
                      : <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: col, borderRadius: 4 }} />
                  )}
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, color: nm === 'Team' ? C.ink : C.faint, fontWeight: nm === 'Team' ? 700 : 400, textAlign: 'right' }}>{f(v)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function StackedBar({ segments, height = 22 }: { segments: { label: string; value: number; color: string }[]; height?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (total <= 0) return null
  return (
    <div style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', background: C.soft }}>
      {segments.map(s => (
        <div key={s.label} title={`${s.label} ${((s.value / total) * 100).toFixed(1)}%`} style={{ width: `${(s.value / total) * 100}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {(s.value / total) * 100 >= 8 ? `${((s.value / total) * 100).toFixed(0)}%` : ''}
        </div>
      ))}
    </div>
  )
}

export function PlayerLink({ id, children }: { id: number; children: React.ReactNode }) {
  return <Link href={`/mlb/players/${id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: 600, fontFamily: SANS }}>{children}</Link>
}

export function headshot(id: number, w = 120): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${w},q_auto:best/v1/people/${id}/headshot/67/current`
}
export function teamLogo(id: number): string {
  return `https://www.mlbstatic.com/team-logos/${id}.svg`
}
