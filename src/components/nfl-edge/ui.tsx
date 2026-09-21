// src/components/nfl-edge/ui.tsx
//
// NFL game-page building blocks that sit ON TOP of the shared design system (components/team/ui.tsx —
// C / SANS / MONO / Section / Card / Tile / Foot / Empty). Nothing here restyles those; it only adds the
// football-specific pieces: team-coloured game hero, logo, tilt gauge, weather / rest / injury badges,
// the Preview · Scout · Postgame tab strip, and the responsive CSS block.
//
// Server-safe: inline styles, no hooks, no client JS. Fonts come from the next/font variables via
// SANS / MONO (never literal family names). Responsive layout is plain CSS @media in <NflStyles/>
// because Tailwind responsive classes are unreliable under Turbopack (CLAUDE.md §4).

import Link from 'next/link'
import type { NflTeam } from '@/lib/nfl-edge/teams'
import type { NflGame, RoofKind } from '@/lib/nfl-edge/games'
import { C, MONO, SANS, DISPLAY } from '@/components/team/ui'

export { C, MONO, SANS, DISPLAY }
export { Section, Card, Tile, Foot, Empty } from '@/components/team/ui'

export const NFL_CSS = `
.tp-root b,.tp-root strong,.tp-root h1,.tp-root h2,.tp-root h3,.tp-root .font-bold,.tp-root .font-semibold,.tp-root .font-black,.tp-root .font-serif{font-family:var(--font-outfit),system-ui,sans-serif !important;font-variant-numeric:tabular-nums}
.tp-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.tp-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.tp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.tp-nav a{font-family:${MONO};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#5b5347;text-decoration:none;padding:6px 10px;border-radius:999px;white-space:nowrap}
.tp-nav a:hover{background:#1A1A1A;color:#FAF8F3}
.ne-rail{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x proximity}
.ne-rail>*{scroll-snap-align:start;flex:0 0 auto}
.ne-hero-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:20px}
.ne-hover:hover{border-color:#FF5722 !important}
@media (max-width:900px){
  .tp-grid-2,.tp-grid-3{grid-template-columns:1fr}
  .tp-grid-2>*,.tp-grid-3>*{grid-column:auto !important}
  .ne-hero-grid{grid-template-columns:1fr;text-align:center;gap:12px}
  .ne-hero-grid>*{justify-self:center}
}
`

export function NflStyles() {
  return <style dangerouslySetInnerHTML={{ __html: NFL_CSS }} />
}

export function TeamLogo({ team, size = 40 }: { team: NflTeam; size?: number }) {
  // Plain <img>: logos are small remote PNGs from nfl_teams.team_logo_url and the rest of the site does the same.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={team.logo} alt={`${team.name} logo`} width={size} height={size} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

export function Chip({ children, tone = 'plain', title }: { children: React.ReactNode; tone?: 'plain' | 'orange' | 'good' | 'bad' | 'dark' | 'yellow'; title?: string }) {
  const t = {
    plain: { bg: C.soft, fg: '#5b5347' }, orange: { bg: '#FFE9E0', fg: '#B23A12' }, good: { bg: '#E1F5EE', fg: '#085041' },
    bad: { bg: '#FBEAE4', fg: '#8A3A24' }, dark: { bg: C.ink, fg: '#FAF8F3' }, yellow: { bg: C.yellow, fg: C.ink },
  }[tone]
  return (
    <span title={title} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {children}
    </span>
  )
}

/** Simple line-art weather / roof glyphs (SVG, no emoji, so they render identically everywhere). */
export function WeatherIcon({ roof, temp, wind, size = 18 }: { roof: RoofKind; temp?: number | null; wind?: number | null; size?: number }) {
  const s = { width: size, height: size, flexShrink: 0 } as const
  const common = { fill: 'none', stroke: '#5b5347', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  if (roof === 'dome') {
    return (
      <svg viewBox="0 0 24 24" style={s} aria-label="Roofed stadium" role="img"><path {...common} d="M3 18a9 9 0 0 1 18 0M2 18h20M12 9V6" /></svg>
    )
  }
  if (roof === 'outdoors' && wind != null && wind >= 15) {
    return (
      <svg viewBox="0 0 24 24" style={s} aria-label="Windy" role="img"><path {...common} d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7" /></svg>
    )
  }
  if (roof === 'outdoors' && temp != null && temp <= 32) {
    return (
      <svg viewBox="0 0 24 24" style={s} aria-label="Freezing" role="img"><path {...common} d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" /></svg>
    )
  }
  if (roof === 'outdoors') {
    return (
      <svg viewBox="0 0 24 24" style={s} aria-label="Outdoor stadium" role="img"><circle {...common} cx="12" cy="12" r="4" /><path {...common} d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" style={s} aria-label="Roof status not yet set" role="img"><path {...common} d="M3 18a9 9 0 0 1 18 0M2 18h20" strokeDasharray="2 3" /></svg>
  )
}

export function roofText(roof: RoofKind, raw: string | null): string {
  if (roof === 'dome') return raw === 'closed' ? 'Retractable · roof closed' : 'Dome'
  if (roof === 'outdoors') return raw === 'open' ? 'Retractable · roof open' : 'Outdoors'
  return 'Retractable · roof set on game day'
}

export function RestBadge({ days, label }: { days: number | null; label?: string }) {
  if (days == null) return null
  const short = days <= 5
  const long = days >= 10
  return (
    <Chip tone={short ? 'bad' : long ? 'good' : 'plain'} title={short ? 'Short week' : long ? 'Extra rest (bye or long break)' : 'Standard rest'}>
      {label ? `${label} ` : ''}{days}d rest{short ? ' · short' : long ? ' · extra' : ''}
    </Chip>
  )
}

const INJ_COLOR = { Out: '#D4533B', Doubtful: '#E58A2B', Questionable: '#E8C22E' } as const

export function InjuryDot({ status, practice }: { status: 'Out' | 'Doubtful' | 'Questionable' | null; practice?: string | null }) {
  const color = status ? INJ_COLOR[status] : practice && /Limited/i.test(practice) ? '#E8C22E' : practice && /Did Not/i.test(practice) ? '#E58A2B' : '#1D9E75'
  const label = status ?? (practice ? practice.replace(' in Practice', '').replace('Participation', 'practice') : 'No designation')
  return <span title={label} aria-label={label} style={{ width: 9, height: 9, borderRadius: 999, background: color, display: 'inline-block', flexShrink: 0 }} />
}

/**
 * Tilt gauge: a half-circle split between the two clubs' colours with a needle pointing toward the club
 * that leads on more factors. It shows a COUNT difference, never a probability or a score.
 */
export function TiltGauge({ home, away, homeCount, awayCount, total, size = 150 }: { home: NflTeam; away: NflTeam; homeCount: number; awayCount: number; total: number; size?: number }) {
  const w = size, h = size * 0.62, cx = w / 2, cy = h - 6, r = size * 0.44
  const tilt = total > 0 ? (homeCount - awayCount) / total : 0          // −1 (all away) … +1 (all home)
  // Positions on the half-circle are parameterised by a ∈ [0, π]: 0 = far left (away), π = far right (home).
  const at = (a: number, rad: number) => [cx + rad * Math.cos(Math.PI - a), cy - rad * Math.sin(Math.PI - a)]
  const [nx, ny] = at((Math.PI * (tilt + 1)) / 2, r - 10)
  const arc = (a0: number, a1: number, col: string) => {
    const [x0, y0] = at(a0, r), [x1, y1] = at(a1, r)
    return <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} stroke={col} strokeWidth={10} fill="none" strokeLinecap="butt" />
  }
  return (
    <svg viewBox={`0 0 ${w} ${h + 4}`} width={w} height={h + 4} role="img" aria-label={`${homeCount} factors lean ${home.id}, ${awayCount} lean ${away.id}, of ${total}`}>
      {arc(0, Math.PI / 2, away.color)}
      {arc(Math.PI / 2, Math.PI, home.color)}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.ink} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill={C.ink} />
    </svg>
  )
}

/** The lean as a pill: "Moderate lean BUF · 6 of 9 factors". Count language only. */
export function LeanPill({ label, count, total, ready }: { label: string; count: number; total: number; ready: boolean }) {
  if (!ready) return <Chip>Read builds as games are played</Chip>
  return (
    <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: C.ink, background: '#FFF4A8', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {label}{count > 0 ? <span style={{ fontWeight: 500, color: '#5b5347' }}> · {count} of {total} factors</span> : null}
    </span>
  )
}

export function TabStrip({ game, active }: { game: NflGame; active: 'preview' | 'scout' | 'postgame' }) {
  const base = `/nfl/${game.slug}`
  const tabs: { id: 'preview' | 'scout' | 'postgame'; label: string; href: string }[] = [
    { id: 'preview', label: 'Game Preview', href: base },
    { id: 'scout', label: 'Scout Report', href: `${base}/scout` },
    { id: 'postgame', label: 'Postgame', href: `${base}/postgame` },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 0' }}>
      {tabs.map(t => (
        <Link key={t.id} href={t.href} style={{
          fontFamily: SANS, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', padding: '8px 14px', borderRadius: 10,
          background: t.id === active ? C.ink : C.card, color: t.id === active ? '#FAF8F3' : C.ink, border: `1px solid ${t.id === active ? C.ink : C.line}`,
        }}>{t.label}</Link>
      ))}
    </div>
  )
}

/** Team-coloured matchup hero shared by Preview, Scout and Postgame. */
export function GameHero({ game, home, away, kicker, homeRec, awayRec, children }: {
  game: NflGame; home: NflTeam; away: NflTeam; kicker: string; homeRec?: string; awayRec?: string; children?: React.ReactNode
}) {
  const ink = (t: NflTeam) => t.textOn
  const side = (t: NflTeam, rec?: string, align: 'left' | 'right' = 'left') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: align === 'left' ? 'flex-start' : 'flex-end', flexDirection: align === 'left' ? 'row' : 'row-reverse', minWidth: 0 }}>
      <div style={{ background: 'rgba(255,255,255,.92)', borderRadius: 999, width: 76, height: 76, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <TeamLogo team={t} size={54} />
      </div>
      <div style={{ minWidth: 0, textAlign: align }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .75, color: ink(t) }}>{t.city}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(26px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1, color: ink(t) }}>{t.nick}</div>
        {rec && <div style={{ fontFamily: MONO, fontSize: 11, opacity: .8, marginTop: 4, color: ink(t) }}>{rec}</div>}
      </div>
    </div>
  )
  // Two-tone hero: away colour on the left, home on the right, joined by a soft diagonal.
  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', position: 'relative', background: `linear-gradient(100deg, ${away.color} 0%, ${away.color} 46%, ${home.color} 54%, ${home.color} 100%)`, color: '#fff' }}>
      <div style={{ padding: '22px 26px 18px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.35)', marginBottom: 14 }}>⊕ {kicker}</div>
        <div className="ne-hero-grid">
          {side(away, awayRec, 'left')}
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.2em', background: 'rgba(26,26,26,.78)', color: '#FAF8F3', padding: '6px 12px', borderRadius: 999 }}>@</div>
          {side(home, homeRec, 'right')}
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spark({ values, color = C.orange, width = 84, height = 22 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x != null)
  if (v.length < 2) return <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>n/a</span>
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * (width - 4) + 2},${height - 3 - ((x - min) / span) * (height - 6)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(' ').slice(-1)[0].split(',')[0]} cy={pts.split(' ').slice(-1)[0].split(',')[1]} r={2.4} fill={color} />
    </svg>
  )
}

/** Two-sided bar compare: away bar grows left, home bar grows right, scaled to the larger value. */
export function CompareBar({ label, away, home, awayDisplay, homeDisplay, awayColor, homeColor, higherBetter = true, note }: {
  label: string; away: number | null; home: number | null; awayDisplay: string; homeDisplay: string; awayColor: string; homeColor: string; higherBetter?: boolean; note?: string
}) {
  const max = Math.max(Math.abs(away ?? 0), Math.abs(home ?? 0), 1e-9)
  const aw = away == null ? 0 : (Math.abs(away) / max) * 100
  const hw = home == null ? 0 : (Math.abs(home) / max) * 100
  const aBetter = away != null && home != null && (higherBetter ? away > home : away < home)
  const hBetter = away != null && home != null && (higherBetter ? home > away : home < away)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 116px minmax(0,1fr) 64px', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: aBetter ? 800 : 500, textAlign: 'right', color: C.ink }}>{awayDisplay}</span>
      <div style={{ height: 8, background: C.soft, borderRadius: 4, display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: `${aw}%`, background: awayColor, borderRadius: 4, opacity: aBetter ? 1 : .55 }} /></div>
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, textAlign: 'center' }} title={note}>{label}</span>
      <div style={{ height: 8, background: C.soft, borderRadius: 4 }}><div style={{ width: `${hw}%`, background: homeColor, borderRadius: 4, opacity: hBetter ? 1 : .55 }} /></div>
      <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: hBetter ? 800 : 500, color: C.ink }}>{homeDisplay}</span>
    </div>
  )
}

export const fmtEpa = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
export const fmtPct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)
export const fmtNum = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d))

export const DISCLAIMER =
  'The Edge is an information and analysis product, not betting advice. Reads describe what the data shows about each club. They are not predictions or recommendations.'
