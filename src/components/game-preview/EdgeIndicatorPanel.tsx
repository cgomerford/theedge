// src/components/game-preview/EdgeIndicatorPanel.tsx
//
// Replaces the old src/components/EdgeIndicator.tsx (archived) for the
// game-preview sidebar slot. That component was built for a wide
// (600px+) hero section — a two-column `1fr 220px` body grid and
// `1fr 130px 68px 18px` per-factor row grid that never collapse inside
// a narrow sidebar (its only responsive breakpoint is a VIEWPORT media
// query, not a container query, so it never fires at typical desktop
// widths even though the column itself is squeezed to 340px). It also
// styled everything off `var(--text-primary)` / `var(--border)` /
// `var(--surface-2)` custom properties that are never defined anywhere
// in this codebase (confirmed via grep) — borders and backgrounds were
// silently falling back to `none`/`transparent`. Together that's what
// "all over the place" was: overlapping text, missing borders/dividers,
// invisible card backgrounds.
//
// New interaction model per George: factors are a compact single-column
// list; clicking one opens a full-page-greying modal with the
// explanation, a data-source note, and (Pro) the detailed away/home
// stat comparison — instead of expanding awkwardly in place.
//
// FACTOR_META descriptions, buildEdgeSummary, and the whole ProDrillDown
// stat-by-stat breakdown are ported near-verbatim from the archived
// component — that content was good, just trapped in a layout that
// couldn't fit here.

'use client'

import { useEffect, useState } from 'react'
import { teamLogoUrl } from '@/lib/mlb'

// ─── Types ────────────────────────────────────────────────────────────────────

type EdgeComponents = {
  starting_pitcher: number
  bullpen: number
  offense: number
  defense: number
  matchup: number
  park: number
  weather: number
  rest: number
  pitcher_situational: number
  offense_situational: number
}

// components_raw is an unverified, loosely-shaped JSON blob (see the old
// EdgeIndicator.tsx's own "UNVERIFIED FIELD SHAPE" comments, ported into
// ProDrillDown below) — no formal type exists for it anywhere in this
// codebase. One disable here, reused everywhere below, instead of one
// per call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawStats = any

export type EdgeIndicatorPanelProps = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
  components_raw?: RawStats
  home_team: string
  away_team: string
  home_team_abbr?: string
  away_team_abbr?: string
  home_primary_color?: string | null
  away_primary_color?: string | null
  updated_at: string
  lineups_confirmed?: boolean
  is_pro?: boolean
  llm_narrative?: string | null
  llm_narrative_pro?: string | null
  pro_takeaways?: Array<{ stat: string; text: string; edge: 'home' | 'away' | 'neutral' }> | null
  home_team_id?: number | null
  away_team_id?: number | null
  home_team_slug?: string | null
  away_team_slug?: string | null
}

// ─── Concrete colors ──────────────────────────────────────────────────────────
// The archived component leaned on undefined `var(--*)` design tokens.
// These are the site's real, already-in-use stone/orange values.

const SAND = '#F5F0E8'
const MIST = '#E8E2D8'
const TEXT_PRIMARY = '#1C1917'
const TEXT_MUTED = '#A8A29E'
const BORDER = '#E7E5E4'

const HOVER_CSS = `
  .edge-tip:hover .edge-tip-bubble { opacity: 1; }
  .edge-spark:hover .edge-spark-bubble { opacity: 1; }

  @media (prefers-reduced-motion: no-preference) {
    .edge-radar-ring {
      transform-origin: center;
      animation: edge-radar-ring-in 500ms ease-out backwards;
    }
    .edge-radar-shape {
      stroke-dasharray: 700;
      stroke-dashoffset: 700;
      animation: edge-radar-draw 900ms cubic-bezier(.22,.9,.34,1) forwards, edge-radar-fade 900ms ease-out forwards;
    }
    .edge-radar-label {
      animation: edge-radar-fade 600ms ease-out backwards;
    }
    .edge-radar:hover .edge-radar-shape { transform: scale(1.02); }
    .edge-radar-shape { transition: transform 220ms ease-out; transform-origin: center; }
  }
  @keyframes edge-radar-ring-in {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes edge-radar-draw {
    to { stroke-dashoffset: 0; }
  }
  @keyframes edge-radar-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`

// ─── Factor metadata ──────────────────────────────────────────────────────────

const FACTOR_META: Record<keyof EdgeComponents, { label: string; description: string; dataSource: string; proTeaser: string }> = {
  starting_pitcher: {
    label: 'Starting pitcher',
    description: 'Compares tonight\'s starters — command, contact quality allowed, and recent form. Historically one of the largest single-game edges in the model.',
    dataSource: 'Season ERA/FIP/xERA and per-pitch contact-quality data from MLB Stats API and Baseball Savant Statcast, refreshed after each start.',
    proTeaser: 'xERA · chase rate · TTO splits · K/BB · quality starts',
  },
  bullpen: {
    label: 'Bullpen',
    description: 'Relief corps quality and fatigue — who\'s fresh, who\'s gassed, and how each pen\'s stuff plays in relief innings tonight.',
    dataSource: 'Bullpen ERA, innings pitched, and availability computed from box scores and pitch logs over the last several days (MLB Stats API).',
    proTeaser: 'Availability matrix · ERA · fatigue tracker · strand %',
  },
  offense: {
    label: 'Offense',
    description: 'Team hitting output and contact quality over the last 30 games, adjusted for the strength of opponents faced.',
    dataSource: 'Rolling 30-game hitting production and contact-quality metrics (xwOBA, hard-hit%) from Baseball Savant Statcast.',
    proTeaser: 'xwOBA · hard hit% · ISO · K% · BB% · sprint speed',
  },
  defense: {
    label: 'Batted-ball & defense',
    description: 'Fielding quality and outs above average, weighted toward how well each defense matches tonight\'s likely contact profile.',
    dataSource: 'Fielding percentage, Outs Above Average, and catcher framing from Baseball Savant Statcast fielding data.',
    proTeaser: 'Fielding% · OAA by zone · GB-collision · pull-side exploit · catcher framing',
  },
  matchup: {
    label: 'Platoon & pitch-type',
    description: 'Hitter-vs-arsenal history — platoon splits and how tonight\'s lineup has handled this pitcher\'s primary pitches specifically.',
    dataSource: 'Platoon splits and pitch-arsenal whiff rates from Statcast pitch-level data, matched against tonight\'s projected lineup.',
    proTeaser: 'Arsenal whiff% vs lineup · platoon OPS splits · H2H history',
  },
  park: {
    label: 'Park factor',
    description: 'How tonight\'s ballpark plays for home runs and run scoring, split by batter handedness where it matters.',
    dataSource: '3-year home-run and run-scoring park factors, plus tonight\'s wind/temperature forecast for the venue.',
    proTeaser: 'HR factor by handedness · altitude · tonight\'s wind',
  },
  weather: {
    label: 'Weather',
    description: 'Temperature and wind effects on ball flight tonight. Usually a small factor unless conditions are extreme.',
    dataSource: 'Live first-pitch temperature and wind conditions for tonight\'s ballpark.',
    proTeaser: 'Wind carry · temperature effect · dome/open analysis',
  },
  rest: {
    label: 'Rest & travel',
    description: 'Days of rest and travel load for both teams — fatigue compounds over a long homestand or road trip.',
    dataSource: 'Days of rest and recent schedule density computed from each team\'s real game log (MLB Stats API).',
    proTeaser: 'Days rest · road trip length · schedule density',
  },
  pitcher_situational: {
    label: 'Pitcher situational',
    description: 'How each starter handles specific game states — fading (or not) as the lineup turns over, first-pitch strike command, and what they actually throw once they\'re ahead in the count.',
    dataSource: 'Times-through-the-order and count-based pitch-selection tendencies from Statcast pitch-level data this season.',
    proTeaser: 'Times-through-order wOBA trend · first-pitch strike% · 2-strike pitch selection',
  },
  offense_situational: {
    label: 'Offense situational',
    description: 'How each lineup performs in the moments that decide games — hitting with runners in scoring position, converting opportunities instead of stranding them, and staying disciplined once behind in the count.',
    dataSource: 'Situational hitting splits (RISP, left-on-base%, plate discipline) from MLB Stats API season splits.',
    proTeaser: 'RISP OPS/AVG · left-on-base% · chase rate & K% behind in count',
  },
}

const FACTOR_ORDER: (keyof EdgeComponents)[] = [
  'starting_pitcher', 'bullpen', 'offense', 'defense',
  'matchup', 'park', 'weather', 'rest',
  'pitcher_situational', 'offense_situational',
]

const RADAR_LABELS: Record<keyof EdgeComponents, string> = {
  starting_pitcher: 'SP', bullpen: 'Pen', offense: 'Off', defense: 'Def',
  matchup: 'Mtch', park: 'Park', weather: 'Wx', rest: 'Rest',
  pitcher_situational: 'P-Sit', offense_situational: 'O-Sit',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPct(score: number, forHome: boolean): number {
  if (score == null || Number.isNaN(score)) return 50
  if (score === 0) return 50
  const abs = Math.abs(score)
  const winning = Math.min(97, 50 + abs * 0.55)
  const losing = Math.max(13, 50 - abs * 0.45)
  return forHome ? (score > 0 ? winning : losing) : (score < 0 ? winning : losing)
}

function f2(v: RawStats): string { const n = parseFloat(v); return isNaN(n) ? '–' : n.toFixed(2) }
function f1(v: RawStats): string { const n = parseFloat(v); return isNaN(n) ? '–' : n.toFixed(1) }
function pct(v: RawStats): string {
  const n = parseFloat(v)
  if (isNaN(n)) return '–'
  return n > 1 ? `${n.toFixed(1)}%` : `${(n * 100).toFixed(1)}%`
}
function sign(v: RawStats): string {
  const n = parseInt(v)
  if (isNaN(n)) return '–'
  return n >= 0 ? `+${n}` : `${n}`
}
function timeAgo(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
function tierLabel(t: string) {
  return { strong: 'Strong lean', moderate: 'Moderate lean', slight: 'Slight lean', tossup: 'Toss-up' }[t] ?? t
}
function tierColor(t: string) {
  return { strong: '#27500A', moderate: '#633806', slight: '#0C447C', tossup: '#5F5E5A' }[t] ?? '#5F5E5A'
}
function tierBg(t: string) {
  return { strong: '#EAF3DE', moderate: '#FAEEDA', slight: '#E6F1FB', tossup: '#F1EFE8' }[t] ?? '#F1EFE8'
}
function daysSince(dateStr: string | null | undefined): string {
  if (!dateStr) return '–'
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? '1 day' : `${diff} days`
}
function daysSinceNum(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
function windLabel(dir: string | null | undefined): string {
  if (!dir) return '–'
  if (dir === 'out') return 'Blowing out ↑ (hitter-friendly)'
  if (dir === 'in') return 'Blowing in ↓ (pitcher-friendly)'
  if (dir === 'cross' || dir === 'crosswind') return 'Crosswind ↔'
  return dir
}
function tempNote(f: number | null | undefined): string {
  if (f == null) return ''
  if (f >= 85) return 'Hot — ball carries well'
  if (f >= 75) return 'Warm — near neutral'
  if (f <= 50) return 'Cold — ball dies'
  if (f <= 60) return 'Cool — slight suppression'
  return 'Neutral'
}
function parkLabel(hr: number | null | undefined, run: number | null | undefined): string {
  if (hr == null && run == null) return 'Park data unavailable'
  const hrN = hr ?? 1.0; const runN = run ?? 1.0
  if (hrN >= 1.10 && runN >= 1.05) return '🔴 Hitter-friendly — balls fly here'
  if (hrN >= 1.05) return '🟠 Slight HR boost vs neutral'
  if (hrN <= 0.90 && runN <= 0.95) return '🟢 Pitcher-friendly — runs suppressed'
  if (hrN <= 0.95) return '🟡 Slight HR suppression'
  return '⚪ Neutral park — no significant factor bias'
}
function fallbackTeamSlug(name: string): string {
  return name.trim().split(' ').pop()?.toLowerCase() ?? name.toLowerCase()
}

function buildEdgeSummary(components: EdgeComponents, winner: string, winnerLeans: number, tier: string) {
  const topFactors = FACTOR_ORDER
    .filter(k => Math.abs(components[k]) > 5)
    .sort((a, b) => Math.abs(components[b]) - Math.abs(components[a]))
    .slice(0, 3)

  const phrases: Partial<Record<keyof EdgeComponents, string>> = {
    starting_pitcher: 'starting pitching edge',
    bullpen: 'bullpen advantage',
    offense: 'offensive output edge',
    defense: 'batted-ball & defensive edge',
    matchup: 'platoon & pitch-type advantage',
    park: 'park factor tilt',
    weather: 'weather conditions',
    rest: 'rest and travel edge',
    pitcher_situational: 'situational pitching edge',
    offense_situational: 'situational hitting edge',
  }

  const factors = topFactors
    .filter(k => {
      const s = components[k]
      return (winner === 'home' && s > 5) || (winner !== 'home' && s < -5)
    })
    .map(k => phrases[k] ?? FACTOR_META[k].label)

  const headlines: Record<string, string> = {
    strong: `${winnerLeans} of ${FACTOR_ORDER.length} factors clearly favour ${winner}`,
    moderate: `${winnerLeans} of ${FACTOR_ORDER.length} factors lean ${winner}`,
    slight: `A slim lean toward ${winner}`,
    tossup: 'The data is split',
  }
  const bodies: Record<string, string> = {
    strong: `The data points clearly to ${winner} tonight. Multiple high-weight factors align.`,
    moderate: `${winner} holds a meaningful advantage across multiple factors.`,
    slight: `The factors are close but not equal — ${winner} has the marginal edge.`,
    tossup: 'Both teams have genuine edges in different areas. Context decides this one.',
  }

  return { headline: headlines[tier] ?? headlines.slight, body: bodies[tier] ?? '', factors }
}

// ─── Tip / Spark (ported unchanged — no broken tokens in these) ───────────────

function Tip({ text }: { text: string }) {
  return (
    <span className="edge-tip" style={{ position: 'relative', display: 'inline-block', marginLeft: 4, cursor: 'help' }}>
      <span style={{ borderBottom: '1px dotted ' + TEXT_MUTED }}>ⓘ</span>
      <span className="edge-tip-bubble" style={{
        position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
        transform: 'translateX(-50%)', width: 190, background: '#1A1A1A',
        color: '#FAF8F3', fontSize: 10, lineHeight: 1.5, padding: '7px 9px',
        borderRadius: 6, opacity: 0, pointerEvents: 'none' as const,
        transition: 'opacity 140ms ease', zIndex: 20,
        boxShadow: '0 8px 20px -6px rgba(0,0,0,0.35)',
      }}>
        {text}
      </span>
    </span>
  )
}

function Spark({ data, color, w = 120, h = 34, pad = 3 }: { data: number[]; color: string; w?: number; h?: number; pad?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = (max - min) || 1
  const step = (w - pad * 2) / (data.length - 1)
  const path = data.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastX = w - pad
  const lastY = h - pad - ((data[data.length - 1] - min) / range) * (h - pad * 2)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={color} />
    </svg>
  )
}

function SparkTip({ value, series, color, sampleLabel = 'Season trend' }: {
  value: string; series?: number[] | null; color: string; sampleLabel?: string
}) {
  if (!series || series.length < 2) return <>{value}</>
  return (
    <span className="edge-spark" style={{ position: 'relative', display: 'inline-block', cursor: 'help', borderBottom: `1px dotted ${color}` }}>
      {value}
      <span className="edge-spark-bubble" style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
        transform: 'translateX(-50%)', width: 140, background: '#1A1A1A',
        color: '#FAF8F3', padding: '8px 9px 6px', borderRadius: 6,
        opacity: 0, pointerEvents: 'none' as const, transition: 'opacity 140ms ease',
        zIndex: 30, boxShadow: '0 10px 24px -8px rgba(0,0,0,0.5)', textAlign: 'left',
      }}>
        <span style={{ fontSize: 8.5, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'rgba(250,248,243,.6)', display: 'block', marginBottom: 4 }}>
          {sampleLabel}
        </span>
        <Spark data={series} color={color} />
      </span>
    </span>
  )
}

// ─── StatRow / DrillSection (ported — var(--*) tokens swapped for real hex) ───

function StatRow({
  label, away, home, note, tip, awayBetter, homeBetter, awayColor, homeColor,
  awaySeries, homeSeries, seriesLabel,
}: {
  label: string; away: string; home: string
  note?: string; tip?: string; awayBetter?: boolean; homeBetter?: boolean
  awayColor: string; homeColor: string
  awaySeries?: number[] | null; homeSeries?: number[] | null; seriesLabel?: string
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', gap: 8,
      padding: '7px 0', borderBottom: `0.5px solid ${BORDER}`,
      fontSize: 11,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontWeight: awayBetter ? 600 : 400,
        color: awayBetter ? awayColor : TEXT_PRIMARY, textAlign: 'right',
      }}>
        <SparkTip value={away} series={awaySeries} color={awayColor} sampleLabel={seriesLabel} />
      </span>
      <span style={{ textAlign: 'center', minWidth: 100 }}>
        <span style={{ fontSize: 10, color: TEXT_MUTED, display: 'block' }}>
          {label}{tip && <Tip text={tip} />}
        </span>
        {note && <span style={{ fontSize: 9, color: TEXT_MUTED }}>{note}</span>}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontWeight: homeBetter ? 600 : 400,
        color: homeBetter ? homeColor : TEXT_PRIMARY,
      }}>
        <SparkTip value={home} series={homeSeries} color={homeColor} sampleLabel={seriesLabel} />
      </span>
    </div>
  )
}

function DrillSection({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.07em', color: '#888', padding: '8px 0 2px', fontWeight: 600 }}>
      {title}
    </div>
  )
}

// ─── ProDrillDown (ported verbatim — this content was always fine) ───────────

function ProDrillDown({ factorKey, raw, awayColor, homeColor }: {
  factorKey: keyof EdgeComponents; raw: RawStats
  awayColor: string; homeColor: string
}) {
  const ap = raw?.away_pitcher
  const hp = raw?.home_pitcher
  const at = raw?.away_team
  const ht = raw?.home_team
  const w = raw?.weather
  const pk = raw?.park
  const ap6 = raw?.away_platoon
  const hp6 = raw?.home_platoon
  const trendsAway = raw?.trends?.away ?? {}
  const trendsHome = raw?.trends?.home ?? {}

  const lo = (a: RawStats, b: RawStats) => a != null && b != null && parseFloat(a) < parseFloat(b)
  const hi = (a: RawStats, b: RawStats) => a != null && b != null && parseFloat(a) > parseFloat(b)
  if (factorKey === 'starting_pitcher') return (
    <div>
      <DrillSection title="Results" />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="ERA (season)" note="lower = better"
        away={f2(ap?.era)} home={f2(hp?.era)}
        awayBetter={lo(ap?.era, hp?.era)} homeBetter={lo(hp?.era, ap?.era)}
        awaySeries={trendsAway.era} homeSeries={trendsHome.era} seriesLabel="ERA · season trend"
      />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="FIP" note="defence-independent" away={f2(ap?.fip)} home={f2(hp?.fip)} awayBetter={lo(ap?.fip, hp?.fip)} homeBetter={lo(hp?.fip, ap?.fip)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="xERA" note="Statcast expected" away={f2(ap?.xera)} home={f2(hp?.xera)} awayBetter={lo(ap?.xera, hp?.xera)} homeBetter={lo(hp?.xera, ap?.xera)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="WHIP" away={f2(ap?.whip)} home={f2(hp?.whip)} awayBetter={lo(ap?.whip, hp?.whip)} homeBetter={lo(hp?.whip, ap?.whip)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="L3 ERA" note="recent form" away={f2(ap?.l3_era)} home={f2(hp?.l3_era)} awayBetter={lo(ap?.l3_era, hp?.l3_era)} homeBetter={lo(hp?.l3_era, ap?.l3_era)} />
      <DrillSection title="Command" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="K/9" away={f1(ap?.k_per_9)} home={f1(hp?.k_per_9)} awayBetter={hi(ap?.k_per_9, hp?.k_per_9)} homeBetter={hi(hp?.k_per_9, ap?.k_per_9)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="BB/9" note="lower = better" away={f1(ap?.bb_per_9)} home={f1(hp?.bb_per_9)} awayBetter={lo(ap?.bb_per_9, hp?.bb_per_9)} homeBetter={lo(hp?.bb_per_9, ap?.bb_per_9)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Chase rate" note="O-swing%; higher = wins for pitcher" away={pct(ap?.chase_rate)} home={pct(hp?.chase_rate)} awayBetter={hi(ap?.chase_rate, hp?.chase_rate)} homeBetter={hi(hp?.chase_rate, ap?.chase_rate)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Whiff%" away={pct(ap?.whiff_pct)} home={pct(hp?.whiff_pct)} awayBetter={hi(ap?.whiff_pct, hp?.whiff_pct)} homeBetter={hi(hp?.whiff_pct, ap?.whiff_pct)} />
      <DrillSection title="Contact quality against" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Hard hit%" note="EV≥95mph; lower = better" away={pct(ap?.hard_hit_pct)} home={pct(hp?.hard_hit_pct)} awayBetter={lo(ap?.hard_hit_pct, hp?.hard_hit_pct)} homeBetter={lo(hp?.hard_hit_pct, ap?.hard_hit_pct)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Barrel%" note="lower = better" away={pct(ap?.barrel_pct)} home={pct(hp?.barrel_pct)} awayBetter={lo(ap?.barrel_pct, hp?.barrel_pct)} homeBetter={lo(hp?.barrel_pct, ap?.barrel_pct)} />
      <DrillSection title="Workload" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Days rest" away={ap?.days_rest != null ? `${ap.days_rest}d` : '–'} home={hp?.days_rest != null ? `${hp.days_rest}d` : '–'} awayBetter={hi(ap?.days_rest, hp?.days_rest)} homeBetter={hi(hp?.days_rest, ap?.days_rest)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="GB%" note="groundball rate" away={ap?.gb_rate != null ? `${Number(ap.gb_rate).toFixed(1)}%` : '–'} home={hp?.gb_rate != null ? `${Number(hp.gb_rate).toFixed(1)}%` : '–'} />
      {(ap?.tto1_xwoba != null || hp?.tto1_xwoba != null || ap?.tto1_era != null) && (
        <>
          <DrillSection title="Times through order (xwOBA)" />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="1st time" away={f2(ap?.tto1_xwoba ?? ap?.tto1_era)} home={f2(hp?.tto1_xwoba ?? hp?.tto1_era)} awayBetter={lo(ap?.tto1_xwoba ?? ap?.tto1_era, hp?.tto1_xwoba ?? hp?.tto1_era)} homeBetter={lo(hp?.tto1_xwoba ?? hp?.tto1_era, ap?.tto1_xwoba ?? ap?.tto1_era)} />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="2nd time" away={f2(ap?.tto2_xwoba ?? ap?.tto2_era)} home={f2(hp?.tto2_xwoba ?? hp?.tto2_era)} awayBetter={lo(ap?.tto2_xwoba ?? ap?.tto2_era, hp?.tto2_xwoba ?? hp?.tto2_era)} homeBetter={lo(hp?.tto2_xwoba ?? hp?.tto2_era, ap?.tto2_xwoba ?? ap?.tto2_era)} />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="3rd time" note="fade risk" away={f2(ap?.tto3_xwoba ?? ap?.tto3_era)} home={f2(hp?.tto3_xwoba ?? hp?.tto3_era)} awayBetter={lo(ap?.tto3_xwoba ?? ap?.tto3_era, hp?.tto3_xwoba ?? hp?.tto3_era)} homeBetter={lo(hp?.tto3_xwoba ?? hp?.tto3_era, ap?.tto3_xwoba ?? ap?.tto3_era)} />
        </>
      )}
    </div>
  )

  if (factorKey === 'bullpen') {
    const fatigueLabel = (ip: RawStats) => {
      const n = parseFloat(ip)
      if (isNaN(n)) return '–'
      if (n >= 5) return 'Gassed 🔴'; if (n >= 3) return 'Taxed 🟠'
      if (n >= 1) return 'Used 🟡'; return 'Fresh 🟢'
    }
    const dot = (v: boolean | null | undefined) => v == null ? '–' : v ? '● Available' : '○ Unavailable'
    return (
      <div>
        <DrillSection title="Quality" />
        <StatRow awayColor={awayColor} homeColor={homeColor}
          label="Bullpen ERA" note="lower = better"
          away={f2(at?.bullpen_era)} home={f2(ht?.bullpen_era)}
          awayBetter={lo(at?.bullpen_era, ht?.bullpen_era)} homeBetter={lo(ht?.bullpen_era, at?.bullpen_era)}
          awaySeries={trendsAway.bullpen_era} homeSeries={trendsHome.bullpen_era} seriesLabel="Bullpen ERA · trend"
        />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="K/9 (pen)" away={f1(at?.bullpen_k_per_9)} home={f1(ht?.bullpen_k_per_9)} awayBetter={hi(at?.bullpen_k_per_9, ht?.bullpen_k_per_9)} homeBetter={hi(ht?.bullpen_k_per_9, at?.bullpen_k_per_9)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="HR/9 (pen)" note="lower = better" away={f1(at?.bullpen_hr_per_9)} home={f1(ht?.bullpen_hr_per_9)} awayBetter={lo(at?.bullpen_hr_per_9, ht?.bullpen_hr_per_9)} homeBetter={lo(ht?.bullpen_hr_per_9, at?.bullpen_hr_per_9)} />
        <DrillSection title="Fatigue" />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="IP yesterday" away={at?.bullpen_innings_yesterday != null ? `${f1(at.bullpen_innings_yesterday)} IP` : '–'} home={ht?.bullpen_innings_yesterday != null ? `${f1(ht.bullpen_innings_yesterday)} IP` : '–'} awayBetter={lo(at?.bullpen_innings_yesterday, ht?.bullpen_innings_yesterday)} homeBetter={lo(ht?.bullpen_innings_yesterday, at?.bullpen_innings_yesterday)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="IP last 3 days" away={at?.bullpen_ip_last_3 != null ? `${f1(at.bullpen_ip_last_3)} IP` : '–'} home={ht?.bullpen_ip_last_3 != null ? `${f1(ht.bullpen_ip_last_3)} IP` : '–'} awayBetter={lo(at?.bullpen_ip_last_3, ht?.bullpen_ip_last_3)} homeBetter={lo(ht?.bullpen_ip_last_3, at?.bullpen_ip_last_3)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="Status" away={fatigueLabel(at?.bullpen_innings_yesterday)} home={fatigueLabel(ht?.bullpen_innings_yesterday)} />
        <DrillSection title="Availability" />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="Closer" away={dot(at?.closer_available)} home={dot(ht?.closer_available)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="Setup arm 1" away={dot(at?.setup1_available)} home={dot(ht?.setup1_available)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="Setup arm 2" away={dot(at?.setup2_available)} home={dot(ht?.setup2_available)} />
      </div>
    )
  }

  if (factorKey === 'offense') return (
    <div>
      <DrillSection title="Recent form" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="R/game (L30)" away={f1(at?.runs_per_game_l30)} home={f1(ht?.runs_per_game_l30)} awayBetter={hi(at?.runs_per_game_l30, ht?.runs_per_game_l30)} homeBetter={hi(ht?.runs_per_game_l30, at?.runs_per_game_l30)} />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="OPS (L30)"
        away={f2(at?.ops_l30)} home={f2(ht?.ops_l30)}
        awayBetter={hi(at?.ops_l30, ht?.ops_l30)} homeBetter={hi(ht?.ops_l30, at?.ops_l30)}
        awaySeries={trendsAway.ops_l30} homeSeries={trendsHome.ops_l30} seriesLabel="OPS · rolling L30"
      />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="ISO (power)" note=".150 = avg" away={at?.iso != null ? f2(at.iso) : '–'} home={ht?.iso != null ? f2(ht.iso) : '–'} awayBetter={hi(at?.iso, ht?.iso)} homeBetter={hi(ht?.iso, at?.iso)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="K%" note="lower = better contact" away={pct(at?.k_pct)} home={pct(ht?.k_pct)} awayBetter={lo(at?.k_pct, ht?.k_pct)} homeBetter={lo(ht?.k_pct, at?.k_pct)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="BB%" note="8.5% = avg" away={pct(at?.bb_pct)} home={pct(ht?.bb_pct)} awayBetter={hi(at?.bb_pct, ht?.bb_pct)} homeBetter={hi(ht?.bb_pct, at?.bb_pct)} />
      <DrillSection title="Contact quality" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="xwOBA" tip="Expected weighted on-base average — strips out defense/luck, based on exit velocity and launch angle." note=".315 = avg (luck-adjusted)" away={at?.xwoba_l30 != null ? f2(at.xwoba_l30) : '–'} home={ht?.xwoba_l30 != null ? f2(ht.xwoba_l30) : '–'} awayBetter={hi(at?.xwoba_l30, ht?.xwoba_l30)} homeBetter={hi(ht?.xwoba_l30, at?.xwoba_l30)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Hard hit%" note="EV≥95mph; 36% = avg" away={pct(at?.hard_hit_pct)} home={pct(ht?.hard_hit_pct)} awayBetter={hi(at?.hard_hit_pct, ht?.hard_hit_pct)} homeBetter={hi(ht?.hard_hit_pct, at?.hard_hit_pct)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Chase rate" note="lower = more patient" away={pct(at?.chase_rate)} home={pct(ht?.chase_rate)} awayBetter={lo(at?.chase_rate, ht?.chase_rate)} homeBetter={lo(ht?.chase_rate, at?.chase_rate)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="SB%" away={pct(at?.stolen_base_pct)} home={pct(ht?.stolen_base_pct)} awayBetter={hi(at?.stolen_base_pct, ht?.stolen_base_pct)} homeBetter={hi(ht?.stolen_base_pct, at?.stolen_base_pct)} />
    </div>
  )

  if (factorKey === 'defense') return (
    <div>
      <DrillSection title="Fielding quality" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Fielding %" note=".984 = avg" away={at?.fielding_pct != null ? Number(at.fielding_pct).toFixed(3) : '–'} home={ht?.fielding_pct != null ? Number(ht.fielding_pct).toFixed(3) : '–'} awayBetter={hi(at?.fielding_pct, ht?.fielding_pct)} homeBetter={hi(ht?.fielding_pct, at?.fielding_pct)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Defensive efficiency" tip="Share of balls in play converted to outs — the whole staff's team defense, not just OAA." note="balls in play converted to outs" away={at?.defensive_efficiency != null ? Number(at.defensive_efficiency).toFixed(3) : '–'} home={ht?.defensive_efficiency != null ? Number(ht.defensive_efficiency).toFixed(3) : '–'} awayBetter={hi(at?.defensive_efficiency, ht?.defensive_efficiency)} homeBetter={hi(ht?.defensive_efficiency, at?.defensive_efficiency)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Errors/game (L30)" note="lower = cleaner" away={f2(at?.errors_per_game_l30)} home={f2(ht?.errors_per_game_l30)} awayBetter={lo(at?.errors_per_game_l30, ht?.errors_per_game_l30)} homeBetter={lo(ht?.errors_per_game_l30, at?.errors_per_game_l30)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Catcher framing" note="runs above avg; higher = better" away={sign(at?.catcher_framing_runs)} home={sign(ht?.catcher_framing_runs)} awayBetter={hi(at?.catcher_framing_runs, ht?.catcher_framing_runs)} homeBetter={hi(ht?.catcher_framing_runs, at?.catcher_framing_runs)} />
      <DrillSection title="Outs above average" />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="OAA (total)" note="0 = avg; + = elite"
        away={sign(at?.oaa)} home={sign(ht?.oaa)}
        awayBetter={hi(at?.oaa, ht?.oaa)} homeBetter={hi(ht?.oaa, at?.oaa)}
        awaySeries={trendsAway.oaa} homeSeries={trendsHome.oaa} seriesLabel="OAA · season cumulative"
      />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Infield OAA" away={sign(at?.infield_oaa)} home={sign(ht?.infield_oaa)} awayBetter={hi(at?.infield_oaa, ht?.infield_oaa)} homeBetter={hi(ht?.infield_oaa, at?.infield_oaa)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Outfield OAA" away={sign(at?.outfield_oaa)} home={sign(ht?.outfield_oaa)} awayBetter={hi(at?.outfield_oaa, ht?.outfield_oaa)} homeBetter={hi(ht?.outfield_oaa, at?.outfield_oaa)} />
      <DrillSection title="Batted-ball synergy" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="GB% (batting team)" note="collision with opposing pitcher's GB%" away={at?.gb_percent_batting != null ? pct(at.gb_percent_batting) : '–'} home={ht?.gb_percent_batting != null ? pct(ht.gb_percent_batting) : '–'} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="OAA — RF" note="targeted by LHB pull tendency" away={at?.oaa_rf != null ? sign(at.oaa_rf) : '–'} home={ht?.oaa_rf != null ? sign(ht.oaa_rf) : '–'} awayBetter={hi(at?.oaa_rf, ht?.oaa_rf)} homeBetter={hi(ht?.oaa_rf, at?.oaa_rf)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="OAA — LF" note="targeted by RHB pull tendency" away={at?.oaa_lf != null ? sign(at.oaa_lf) : '–'} home={ht?.oaa_lf != null ? sign(ht.oaa_lf) : '–'} awayBetter={hi(at?.oaa_lf, ht?.oaa_lf)} homeBetter={hi(ht?.oaa_lf, at?.oaa_lf)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Pull% (LHB / RHB)" note="lineup handedness pull tendency" away={ap6 ? `${ap6?.pull_pct_lhb ?? '–'} / ${ap6?.pull_pct_rhb ?? '–'}` : '–'} home={hp6 ? `${hp6?.pull_pct_lhb ?? '–'} / ${hp6?.pull_pct_rhb ?? '–'}` : '–'} />
    </div>
  )

  if (factorKey === 'matchup') {
    const awayArsenal: RawStats[] = raw?.away_pitcher_arsenal ?? []
    const homeArsenal: RawStats[] = raw?.home_pitcher_arsenal ?? []
    const bestPitch = (arsenal: RawStats[]) =>
      [...arsenal].sort((a, b) => (b.whiff_percent ?? b.whiff_pct ?? 0) - (a.whiff_percent ?? a.whiff_pct ?? 0))[0]
    const aBest = bestPitch(awayArsenal)
    const hBest = bestPitch(homeArsenal)
    return (
      <div>
        <DrillSection title="Platoon splits" />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="vs LHB avg" note="pitcher vs lefties" away={f2(ap?.vs_lhb_baa)} home={f2(hp?.vs_lhb_baa)} awayBetter={lo(ap?.vs_lhb_baa, hp?.vs_lhb_baa)} homeBetter={lo(hp?.vs_lhb_baa, ap?.vs_lhb_baa)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="vs RHB avg" note="pitcher vs righties" away={f2(ap?.vs_rhb_baa)} home={f2(hp?.vs_rhb_baa)} awayBetter={lo(ap?.vs_rhb_baa, hp?.vs_rhb_baa)} homeBetter={lo(hp?.vs_rhb_baa, ap?.vs_rhb_baa)} />
        {(aBest || hBest) && (
          <>
            <DrillSection title="Best pitch tonight (whiff%)" />
            <StatRow awayColor={awayColor} homeColor={homeColor}
              label="Weapon"
              away={aBest ? `${aBest.pitch_name ?? aBest.pitch_type} ${pct(aBest.whiff_percent ?? aBest.whiff_pct)}` : '–'}
              home={hBest ? `${hBest.pitch_name ?? hBest.pitch_type} ${pct(hBest.whiff_percent ?? hBest.whiff_pct)}` : '–'}
              awayBetter={hi(aBest?.whiff_percent ?? aBest?.whiff_pct, hBest?.whiff_percent ?? hBest?.whiff_pct)}
              homeBetter={hi(hBest?.whiff_percent ?? hBest?.whiff_pct, aBest?.whiff_percent ?? aBest?.whiff_pct)}
            />
          </>
        )}
      </div>
    )
  }

  if (factorKey === 'park') return (
    <div>
      <div style={{ background: '#F0EDE8', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#3D3830', margin: '4px 0 8px', lineHeight: 1.55 }}>
        {parkLabel(pk?.hr_factor, pk?.run_factor)}
        {pk?.is_dome ? ' · Dome — weather irrelevant tonight.' : ''}
        {!pk?.is_dome && w?.wind_dir ? ` · Wind ${windLabel(w.wind_dir)}${w.wind_mph ? ` at ${w.wind_mph} mph` : ''}.` : ''}
      </div>
      <DrillSection title="Park factors (3-year avg)" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="HR factor" note=">1.0 = more HRs" away={pk?.hr_factor ? f2(pk.hr_factor) : '–'} home="park avg" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Run factor" note=">1.0 = more runs" away={pk?.run_factor ? f2(pk.run_factor) : '–'} home="park avg" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Altitude" away={pk?.altitude_feet != null ? `${Number(pk.altitude_feet).toLocaleString()} ft` : '–'} home="—" />
      {pk?.hr_factor_rhb != null && <StatRow awayColor={awayColor} homeColor={homeColor} label="HR factor (RHB)" note="righties" away={f2(pk.hr_factor_rhb)} home="park avg" />}
      {pk?.hr_factor_lhb != null && <StatRow awayColor={awayColor} homeColor={homeColor} label="HR factor (LHB)" note="lefties" away={f2(pk.hr_factor_lhb)} home="park avg" />}
      <DrillSection title="Tonight at this park" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Wind direction" away={w?.wind_dir ? windLabel(w.wind_dir) : pk?.is_dome ? 'Dome — N/A' : '–'} home={w?.wind_mph != null ? `${w.wind_mph} mph` : '–'} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Temperature" away={w?.temp_f != null ? `${Math.round(w.temp_f)}°F / ${Math.round((w.temp_f - 32) * 5/9)}°C` : pk?.is_dome ? 'Controlled' : '–'} home={w?.temp_f != null ? tempNote(w.temp_f) : '–'} />
    </div>
  )

  if (factorKey === 'weather') return (
    <div>
      {pk?.is_dome ? (
        <div style={{ fontSize: 11, color: '#5F5E5A', background: '#F5F0E8', borderRadius: 6, padding: '9px 11px', lineHeight: 1.5 }}>
          🏟 Dome venue — temperature, wind and precipitation have <strong>no effect</strong> on this game.
        </div>
      ) : w == null ? (
        <div style={{ fontSize: 11, color: '#5F5E5A', background: '#F5F0E8', borderRadius: 6, padding: '9px 11px' }}>
          Weather data not yet available. Check back closer to first pitch.
        </div>
      ) : (
        <>
          <DrillSection title="Conditions at first pitch" />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="Temperature" away={`${Math.round(w.temp_f)}°F / ${Math.round((w.temp_f - 32) * 5/9)}°C`} home={tempNote(w.temp_f)} />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="Wind speed" away={w.wind_mph != null ? `${w.wind_mph} mph` : '–'} home="—" />
          <StatRow awayColor={awayColor} homeColor={homeColor} label="Wind direction" note="relative to CF" away={windLabel(w.wind_dir)} home="—" />
          <DrillSection title="What this means tonight" />
          <div style={{ fontSize: 11, color: '#3D3830', background: '#F0EDE8', borderRadius: 6, padding: '9px 11px', lineHeight: 1.6 }}>
            {w.wind_dir === 'out' && (w.wind_mph ?? 0) >= 10
              ? `💨 Wind out at ${w.wind_mph} mph — fly balls carry significantly further. HR factors amplified.`
              : w.wind_dir === 'in' && (w.wind_mph ?? 0) >= 10
              ? `💨 Wind in at ${w.wind_mph} mph — outfield fly balls die. Pitchers benefit, hitters struggle for extra bases.`
              : w.wind_dir === 'cross'
              ? `↔ Crosswind at ${w.wind_mph ?? '?'} mph — no clear HR effect but affects swing mechanics slightly.`
              : (w.temp_f ?? 70) >= 85
              ? `🌡 Hot at ${Math.round(w.temp_f)}°F — ball carries well in warm air. Slight offensive boost.`
              : (w.temp_f ?? 70) <= 50
              ? `🥶 Cold at ${Math.round(w.temp_f)}°F — ball doesn't carry. Suppresses HR and extra-base hits.`
              : `Conditions are broadly neutral — no significant weather edge tonight.`
            }
          </div>
        </>
      )}
    </div>
  )

  if (factorKey === 'rest') return (
    <div>
      <DrillSection title="Schedule load" />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="Last game"
        away={daysSince(at?.last_game_date)}
        home={daysSince(ht?.last_game_date)}
        awayBetter={(() => { const an = daysSinceNum(at?.last_game_date); const hn = daysSinceNum(ht?.last_game_date); return an != null && hn != null && an > hn })()}
        homeBetter={(() => { const an = daysSinceNum(at?.last_game_date); const hn = daysSinceNum(ht?.last_game_date); return an != null && hn != null && hn > an })()}
        note="more rest = fresher"
      />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Games (last 10 days)" note="schedule density" away={at?.games_last_10_days != null ? String(at.games_last_10_days) : '–'} home={ht?.games_last_10_days != null ? String(ht.games_last_10_days) : '–'} awayBetter={lo(at?.games_last_10_days, ht?.games_last_10_days)} homeBetter={lo(ht?.games_last_10_days, at?.games_last_10_days)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Day after night?" away={at?.day_after_night ? 'Yes ⚠' : 'No'} home={ht?.day_after_night ? 'Yes ⚠' : 'No'} awayBetter={!at?.day_after_night && ht?.day_after_night} homeBetter={!ht?.day_after_night && at?.day_after_night} />
      <DrillSection title="Travel (away team)" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Road trip games" note="consecutive away" away={at?.consecutive_road_games != null ? `${at.consecutive_road_games}g` : '–'} home="Home" awayBetter={false} homeBetter={(at?.consecutive_road_games ?? 0) >= 4} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Miles (last trip)" note="away team" away={at?.travel_miles_last != null && at.travel_miles_last > 0 ? `${Math.round(at.travel_miles_last).toLocaleString()} mi` : '–'} home="Home" />
    </div>
  )

  if (factorKey === 'pitcher_situational') {
    function bestTwoStrikePitch(mix: RawStats): { name: string; two_strike_pct: number } | null {
      if (!mix) return null
      const entries = Object.values(mix) as { name: string; two_strike_pct: number }[]
      if (entries.length === 0) return null
      return [...entries].sort((a, b) => (b.two_strike_pct ?? 0) - (a.two_strike_pct ?? 0))[0]
    }
    const aBest = bestTwoStrikePitch(ap?.two_strike_mix)
    const hBest = bestTwoStrikePitch(hp?.two_strike_mix)
    return (
      <div>
        <DrillSection title="Times through the order (wOBA against)" />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="1st time" away={f2(ap?.tto1_woba)} home={f2(hp?.tto1_woba)} awayBetter={lo(ap?.tto1_woba, hp?.tto1_woba)} homeBetter={lo(hp?.tto1_woba, ap?.tto1_woba)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="2nd time" away={f2(ap?.tto2_woba)} home={f2(hp?.tto2_woba)} awayBetter={lo(ap?.tto2_woba, hp?.tto2_woba)} homeBetter={lo(hp?.tto2_woba, ap?.tto2_woba)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="3rd time" note="fade risk" away={f2(ap?.tto3_woba)} home={f2(hp?.tto3_woba)} awayBetter={lo(ap?.tto3_woba, hp?.tto3_woba)} homeBetter={lo(hp?.tto3_woba, ap?.tto3_woba)} />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="Verified?" note="self-reconciled vs real batters faced" away={ap?.tto_verified_at ? '✓ verified' : '– not yet'} home={hp?.tto_verified_at ? '✓ verified' : '– not yet'} />
        <DrillSection title="0-0 count" />
        <StatRow awayColor={awayColor} homeColor={homeColor} label="First-pitch strike%" away={pct(ap?.first_pitch_strike_pct)} home={pct(hp?.first_pitch_strike_pct)} awayBetter={hi(ap?.first_pitch_strike_pct, hp?.first_pitch_strike_pct)} homeBetter={hi(hp?.first_pitch_strike_pct, ap?.first_pitch_strike_pct)} />
        <DrillSection title="Ahead in the count" />
        <StatRow awayColor={awayColor} homeColor={homeColor}
          label="Most-thrown at 2 strikes"
          away={aBest ? `${aBest.name} ${pct(aBest.two_strike_pct)}` : '–'}
          home={hBest ? `${hBest.name} ${pct(hBest.two_strike_pct)}` : '–'}
        />
      </div>
    )
  }

  if (factorKey === 'offense_situational') return (
    <div>
      <DrillSection title="Runners in scoring position" />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="OPS with RISP"
        away={f2(at?.ops_with_risp ?? at?.risp_ops)} home={f2(ht?.ops_with_risp ?? ht?.risp_ops)}
        awayBetter={hi(at?.ops_with_risp ?? at?.risp_ops, ht?.ops_with_risp ?? ht?.risp_ops)}
        homeBetter={hi(ht?.ops_with_risp ?? ht?.risp_ops, at?.ops_with_risp ?? at?.risp_ops)}
      />
      <StatRow awayColor={awayColor} homeColor={homeColor}
        label="AVG with RISP"
        away={f2(at?.ba_risp ?? at?.risp_avg ?? at?.avg_with_risp)} home={f2(ht?.ba_risp ?? ht?.risp_avg ?? ht?.avg_with_risp)}
        awayBetter={hi(at?.ba_risp ?? at?.risp_avg ?? at?.avg_with_risp, ht?.ba_risp ?? ht?.risp_avg ?? ht?.avg_with_risp)}
        homeBetter={hi(ht?.ba_risp ?? ht?.risp_avg ?? ht?.avg_with_risp, at?.ba_risp ?? at?.risp_avg ?? at?.avg_with_risp)}
      />
      <DrillSection title="Converting opportunities" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="LOB%" note="lower = fewer runners stranded" away={pct(at?.lob_pct)} home={pct(ht?.lob_pct)} awayBetter={lo(at?.lob_pct, ht?.lob_pct)} homeBetter={lo(ht?.lob_pct, at?.lob_pct)} />
      <DrillSection title="Discipline once behind in the count" />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="Chase rate" note="lower = better process" away={pct(at?.chase_rate)} home={pct(ht?.chase_rate)} awayBetter={lo(at?.chase_rate, ht?.chase_rate)} homeBetter={lo(ht?.chase_rate, at?.chase_rate)} />
      <StatRow awayColor={awayColor} homeColor={homeColor} label="K%" note="lower = better" away={pct(at?.k_pct)} home={pct(ht?.k_pct)} awayBetter={lo(at?.k_pct, ht?.k_pct)} homeBetter={lo(ht?.k_pct, at?.k_pct)} />
    </div>
  )

  return <div style={{ fontSize: 11, color: TEXT_MUTED, padding: '8px 0' }}>Detailed data available with Pro.</div>
}

// ─── RadarChart (ported unchanged) ────────────────────────────────────────────

function RadarChart({ components, homeAbbr, awayAbbr, awayColor, homeColor, size = 180 }: {
  components: EdgeComponents; homeAbbr: string; awayAbbr: string
  awayColor: string; homeColor: string; size?: number
}) {
  const VB = 200; const CX = VB / 2; const CY = VB / 2
  const RADIUS = 60; const LABEL_R = RADIUS + 18

  function spokePoint(i: number, r: number): [number, number] {
    const a = (i / FACTOR_ORDER.length) * 2 * Math.PI - Math.PI / 2
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
  }
  function polygon(forHome: boolean): string {
    return FACTOR_ORDER.map((key, i) => {
      const [x, y] = spokePoint(i, Math.max(5, toPct(components[key], forHome) / 100 * RADIUS))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}
      role="img" aria-label={`Radar comparing ${awayAbbr} and ${homeAbbr}`}
      className="edge-radar"
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((p, ri) => (
        <polygon key={ri}
          className="edge-radar-ring"
          style={{ animationDelay: `${ri * 40}ms` }}
          points={FACTOR_ORDER.map((_, i) => { const [x, y] = spokePoint(i, p * RADIUS); return `${x.toFixed(1)},${y.toFixed(1)}` }).join(' ')}
          fill="none" stroke={MIST} strokeWidth={ri === 3 ? 1 : 0.6} />
      ))}
      {FACTOR_ORDER.map((_, i) => { const [x, y] = spokePoint(i, RADIUS); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke={MIST} strokeWidth="0.6" /> })}
      <polygon
        className="edge-radar-shape"
        style={{ animationDelay: '80ms' }}
        points={polygon(false)} fill={awayColor} fillOpacity={0.12} stroke={awayColor} strokeWidth={2} strokeLinejoin="round"
      />
      <polygon
        className="edge-radar-shape"
        style={{ animationDelay: '230ms' }}
        points={polygon(true)} fill={homeColor} fillOpacity={0.12} stroke={homeColor} strokeWidth={2} strokeLinejoin="round"
      />
      {FACTOR_ORDER.map((key, i) => {
        const [x, y] = spokePoint(i, LABEL_R)
        return (
          <text
            key={key} x={x.toFixed(1)} y={y.toFixed(1)}
            className="edge-radar-label" style={{ animationDelay: `${400 + i * 30}ms` }}
            textAnchor="middle" dominantBaseline="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#888780"
          >
            {RADAR_LABELS[key]}
          </text>
        )
      })}
    </svg>
  )
}

// ─── FactorRow — compact, flex-based (no fixed-width grid to break) ──────────

function FactorRow({ factorKey, score, awayColor, homeColor, onOpen }: {
  factorKey: keyof EdgeComponents; score: number
  awayColor: string; homeColor: string
  onOpen: (key: keyof EdgeComponents) => void
}) {
  const meta = FACTOR_META[factorKey]
  const homePct = toPct(score, true)
  const awayPct = toPct(score, false)
  const homeWins = score > 5
  const awayWins = score < -5

  return (
    <button
      onClick={() => onOpen(factorKey)}
      className="w-full flex items-center gap-2 py-2 px-1.5 -mx-1.5 rounded-md border-b border-stone-100 last:border-0 text-left hover:bg-stone-50 transition"
    >
      <span className="text-[11.5px] text-stone-800 flex-1 min-w-0 truncate">{meta.label}</span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: awayWins ? awayColor : '#D6D3D1' }} />
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: homeWins ? homeColor : '#D6D3D1' }} />
      </span>
      <span className="text-[9px] font-mono text-stone-400 shrink-0 w-12 text-right">{Math.round(awayPct)}|{Math.round(homePct)}</span>
      <span className="text-stone-300 text-[11px] shrink-0">›</span>
    </button>
  )
}

// ─── FactorDetailModal — the "grey the page out" interaction ─────────────────

function FactorDetailModal({
  factorKey, onClose, raw, awayAbbr, homeAbbr, awayColor, homeColor, isPro,
}: {
  factorKey: keyof EdgeComponents
  onClose: () => void
  raw: RawStats
  awayAbbr: string; homeAbbr: string
  awayColor: string; homeColor: string
  isPro: boolean
}) {
  const meta = FACTOR_META[factorKey]

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-[1px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-start justify-between gap-3 rounded-t-2xl">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">Data factor</p>
            <h3 className="font-sans text-lg text-stone-900 leading-tight">{meta.label}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-stone-900 text-2xl leading-none shrink-0">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-stone-600 leading-relaxed">{meta.description}</p>

          <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-1">Where this data comes from</p>
            <p className="text-xs text-stone-500 leading-snug">{meta.dataSource}</p>
          </div>

          {isPro ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '0 0 6px', borderBottom: `0.5px solid ${BORDER}`, marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: awayColor, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{awayAbbr}</span>
                <span style={{ fontSize: 9, color: TEXT_MUTED, textAlign: 'center', minWidth: 100 }}>stat</span>
                <span style={{ fontSize: 9, color: homeColor, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{homeAbbr}</span>
              </div>
              <ProDrillDown factorKey={factorKey} raw={raw} awayColor={awayColor} homeColor={homeColor} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-stone-900 rounded-lg px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1">⊕ Pro — full drill-down</p>
                <p className="text-xs text-stone-300">{meta.proTeaser}</p>
              </div>
              <a href="/pricing" onClick={(e) => e.stopPropagation()} className="shrink-0 text-[10px] font-bold px-3 py-1.5 bg-amber-300 text-stone-900 rounded whitespace-nowrap">
                Unlock →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EdgeIndicatorPanel(props: EdgeIndicatorPanelProps) {
  const [openFactor, setOpenFactor] = useState<keyof EdgeComponents | null>(null)

  const isPro = props.is_pro === true
  const homeAbbr = props.home_team_abbr ?? props.home_team.slice(0, 3).toUpperCase()
  const awayAbbr = props.away_team_abbr ?? props.away_team.slice(0, 3).toUpperCase()
  const awayColor = props.away_primary_color ?? '#FF5722'
  const homeColor = props.home_primary_color ?? '#1A1A1A'
  const winner = props.predicted_winner === 'home' ? homeAbbr : awayAbbr
  const winnerColor = props.predicted_winner === 'home' ? homeColor : awayColor
  const sliderPct = Math.max(3, Math.min(97, 50 + props.edge_score / 2))
  const homeLeans = FACTOR_ORDER.filter(k => props.components[k] > 5).length
  const awayLeans = FACTOR_ORDER.filter(k => props.components[k] < -5).length
  const winnerLeans = props.predicted_winner === 'home' ? homeLeans : awayLeans
  const raw = props.components_raw
  const summary = buildEdgeSummary(props.components, winner, winnerLeans, props.confidence_tier)

  const awaySlug = props.away_team_slug ?? fallbackTeamSlug(props.away_team)
  const homeSlug = props.home_team_slug ?? fallbackTeamSlug(props.home_team)

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <style>{HOVER_CSS}</style>

      {openFactor && (
        <FactorDetailModal
          factorKey={openFactor}
          onClose={() => setOpenFactor(null)}
          raw={raw}
          awayAbbr={awayAbbr} homeAbbr={homeAbbr}
          awayColor={awayColor} homeColor={homeColor}
          isPro={isPro}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ background: SAND }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {props.away_team_id != null && (
              <a href={`/mlb/teams/${awaySlug}`} className="shrink-0" title={`Open ${props.away_team}`}>
                <img src={teamLogoUrl(props.away_team_id)} alt={props.away_team} className="w-4 h-4 object-contain" />
              </a>
            )}
            <span className="text-lg font-medium tracking-tight whitespace-nowrap">
              <span style={{ color: props.predicted_winner === 'away' ? awayColor : TEXT_PRIMARY }}>{awayAbbr}</span>
              <span className="text-stone-400 font-normal text-sm mx-1.5">at</span>
              <span style={{ color: props.predicted_winner === 'home' ? homeColor : TEXT_PRIMARY }}>{homeAbbr}</span>
            </span>
            {props.home_team_id != null && (
              <a href={`/mlb/teams/${homeSlug}`} className="shrink-0" title={`Open ${props.home_team}`}>
                <img src={teamLogoUrl(props.home_team_id)} alt={props.home_team} className="w-4 h-4 object-contain" />
              </a>
            )}
          </div>
          <span className="text-[9px] font-medium px-2 py-1 rounded-full shrink-0" style={{ background: tierBg(props.confidence_tier), color: tierColor(props.confidence_tier) }}>
            {tierLabel(props.confidence_tier)}
          </span>
        </div>

        <div className="bg-white rounded-lg px-3 py-2 mb-2.5">
          <p className="text-[10px] text-stone-400 mb-0.5">Data factors lean</p>
          <p className="text-xl font-medium" style={{ color: winnerColor }}>
            {winnerLeans}<span className="text-sm text-stone-400 font-normal">/{FACTOR_ORDER.length}</span>
            <span className="text-sm text-stone-500 font-normal ml-1.5">{winner}</span>
          </p>
        </div>

        <div className="relative h-1.5 rounded-full" style={{ background: MIST }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, borderRadius: 999,
            background: winnerColor,
            ...(props.predicted_winner === 'home'
              ? { left: '50%', right: `${100 - sliderPct}%` }
              : { left: `${sliderPct}%`, right: '50%' }),
          }} />
          <div style={{ position: 'absolute', top: '50%', left: `${sliderPct}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#FDE047', border: '2px solid rgba(0,0,0,.15)', boxShadow: `0 0 0 3px ${winnerColor}44` }} />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-stone-400 mt-1">
          <span style={{ color: awayColor, fontWeight: 600 }}>{awayAbbr}</span>
          <span>Neutral</span>
          <span style={{ color: homeColor, fontWeight: 600 }}>{homeAbbr}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-stone-100">
        <p className="text-[12.5px] font-medium leading-snug mb-1" style={{ color: winnerColor }}>{summary.headline}</p>
        <p className="text-[11.5px] text-stone-500 leading-relaxed">{summary.body}</p>
      </div>

      {/* LLM narrative — previously fetched but never rendered */}
      {(props.llm_narrative || props.llm_narrative_pro) && (
        <div className="px-4 py-3 border-b border-stone-100 space-y-2.5">
          {props.llm_narrative && (
            <p className="text-[11.5px] text-stone-600 leading-relaxed font-sans italic">{props.llm_narrative}</p>
          )}
          {isPro && props.llm_narrative_pro && (
            <p className="text-[11.5px] text-stone-600 leading-relaxed">{props.llm_narrative_pro}</p>
          )}
          {!isPro && props.llm_narrative_pro && (
            <div className="flex items-center justify-between gap-3 bg-stone-900 rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-stone-300">⊕ Deeper analysis is a Pro feature</p>
              <a href="/pricing" className="shrink-0 text-[9.5px] font-bold px-2.5 py-1 bg-amber-300 text-stone-900 rounded whitespace-nowrap">Unlock →</a>
            </div>
          )}
        </div>
      )}

      {/* Radar */}
      <div className="px-4 py-3 border-b border-stone-100 flex flex-col items-center">
        <RadarChart components={props.components} homeAbbr={homeAbbr} awayAbbr={awayAbbr} awayColor={awayColor} homeColor={homeColor} size={170} />
        <div className="flex gap-3 mt-1.5">
          <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold" style={{ color: awayColor }}>
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: awayColor }} />{awayAbbr}
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold" style={{ color: homeColor }}>
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: homeColor }} />{homeAbbr}
          </span>
        </div>
      </div>

      {/* Factor list — click a row to open the detail modal */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-1 px-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold">Factors</span>
          <span className="text-[9px] font-mono text-stone-300">{awayAbbr}|{homeAbbr}</span>
        </div>
        {FACTOR_ORDER.map(key => (
          <FactorRow
            key={key} factorKey={key} score={props.components[key]}
            awayColor={awayColor} homeColor={homeColor}
            onOpen={setOpenFactor}
          />
        ))}
      </div>

      {!isPro && (
        <div className="mx-4 mb-3 bg-stone-900 rounded-lg px-3.5 py-3">
          <p className="text-[10px] text-amber-300 font-bold uppercase tracking-wide mb-1">⊕ Pro · £4/mo founding rate</p>
          <p className="text-[11px] text-stone-300 leading-snug mb-2">Full drill-down on every factor — every stat behind the numbers.</p>
          <a href="/pricing" className="inline-block text-[10px] font-bold px-3 py-1.5 bg-amber-300 text-stone-900 rounded">See Pro pricing →</a>
        </div>
      )}

      {isPro && props.pro_takeaways && props.pro_takeaways.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold">Pro takeaways</p>
          {props.pro_takeaways.map((t, i) => (
            <div key={i} className="bg-stone-50 rounded-lg px-3 py-2" style={{ borderLeft: `2px solid ${t.edge === 'home' ? homeColor : t.edge === 'away' ? awayColor : '#888780'}` }}>
              <p className="text-[9px] uppercase tracking-wide text-stone-400 mb-0.5">{t.stat}</p>
              <p className="text-[11px] text-stone-800">{t.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-stone-100 flex items-center justify-between flex-wrap gap-1" style={{ background: SAND }}>
        <span className="text-[9px] font-mono text-stone-400">⊕ Info only · Not betting advice</span>
        <span className="text-[9px] text-stone-400">Updated {timeAgo(props.updated_at)}</span>
      </div>
      {props.lineups_confirmed && (
        <div className="px-4 pb-3 -mt-1" style={{ background: SAND }}>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-50 text-green-800 font-medium">✓ Lineups confirmed</span>
        </div>
      )}
    </div>
  )
}
