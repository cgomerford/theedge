'use client'

import { useState } from 'react'
import { teamLogoUrl, playerHeadshotUrl } from '@/lib/mlb'

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
}

export type FormResult = 'W' | 'L'

export type TrendPoint = { date: string; edge_score: number }

// Per-stat season-history arrays, oldest → newest. Optional and additive —
// nothing renders differently until a real query populates this on
// `components_raw.trends`. Keys are a subset of stats we currently drill
// into (era, bullpen_era, ops_l30, oaa); add more as the data exists.
export type StatTrendSet = {
  away?: Partial<Record<string, number[]>>
  home?: Partial<Record<string, number[]>>
}

export type EdgeIndicatorV6Props = {
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: EdgeComponents
  components_raw?: any
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

  // ── New, all optional — component degrades gracefully without them ──────
  home_team_id?: number | null
  away_team_id?: number | null
  // Real route slugs, e.g. "guardians" for /mlb/teams/guardians. Pass these
  // from the parent (findTeamByName or similar) — the fallback slugifier
  // below only handles single-word nicknames correctly.
  home_team_slug?: string | null
  away_team_slug?: string | null
  team_page_href?: (teamId: number, slug?: string | null) => string
  player_page_href?: (playerId: number) => string
  form?: {
    away: { results: FormResult[]; record: string }
    home: { results: FormResult[]; record: string }
  } | null
  // Rolling Edge Score history for the predicted winner's team, oldest first.
  // Real source: historical edge_predictions rows — this component doesn't
  // fetch, so the parent page/route needs to query and pass this in.
  trend?: TrendPoint[] | null
}

// ─── Static constants ────────────────────────────────────────────────────────

const SAND = '#F5F0E8'
const MIST = '#E8E2D8'

// ─── Shared responsive + hover CSS ──────────────────────────────────────────
// Fixed pixel-width grid columns (220px, 130px, 68px, 18px) don't shrink on
// narrow viewports when set via inline style — inline styles can't respond
// to media queries, only real CSS can. These classes replace the previous
// inline gridTemplateColumns on the two-column body/header rows and the
// factor row, with breakpoints that collapse/shrink them instead of forcing
// horizontal scroll.
//
// Also holds the pure-CSS hover reveals for Tip, SparkTip, headshots, and
// team logos — same pattern throughout: opacity 0 → 1 on :hover, no JS
// needed for the reveal itself.

const RESPONSIVE_CSS = `
  .edge-tip:hover .edge-tip-bubble { opacity: 1; }
  .edge-spark:hover .edge-spark-bubble { opacity: 1; }

  .edge-headshot-link:hover .edge-headshot-img { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,.22); }
  .edge-headshot-link:hover .edge-view-tag { opacity: 1; transform: translateY(0); }
  .edge-headshot-img { transition: transform .18s ease, box-shadow .18s ease; }
  .edge-view-tag { opacity: 0; transform: translateY(-3px); transition: .16s ease; pointer-events: none; }

  .edge-logo-link:hover .edge-logo-img { transform: scale(1.08); filter: drop-shadow(0 4px 10px rgba(0,0,0,.18)); }
  .edge-logo-img { transition: transform .18s ease, filter .18s ease; }

  .edge-head-grid, .edge-body-grid { display: grid; grid-template-columns: 1fr 220px; }
  .edge-head-left { border-right: 0.5px solid var(--border); border-bottom: 2px solid #E0D8CE; }
  .edge-head-right { border-bottom: 2px solid transparent; }
  .edge-factors-col { border-right: 0.5px solid var(--border); }

  .edge-factor-row, .edge-factor-header-row {
    display: grid; grid-template-columns: 1fr 130px 68px 18px; gap: 8px; align-items: center;
  }

  @media (max-width: 720px) {
    .edge-head-grid, .edge-body-grid { grid-template-columns: 1fr; }
    .edge-head-left, .edge-factors-col { border-right: none; border-bottom: 0.5px solid var(--border); }
  }

  @media (max-width: 480px) {
    .edge-factor-row, .edge-factor-header-row { grid-template-columns: 1fr 84px 46px 16px; gap: 6px; }
  }
`

// ─── Factor metadata ──────────────────────────────────────────────────────────

const FACTOR_META: Record<keyof EdgeComponents, { label: string; description: string; proTeaser: string }> = {
  starting_pitcher: {
    label: 'Starting pitcher',
    description: 'Compares tonight\'s starters — command, contact quality allowed, and recent form. Historically one of the largest single-game edges in the model.',
    proTeaser: 'xERA · chase rate · TTO splits · K/BB · quality starts',
  },
  bullpen: {
    label: 'Bullpen',
    description: 'Relief corps quality and fatigue — who\'s fresh, who\'s gassed, and how each pen\'s stuff plays in relief innings tonight.',
    proTeaser: 'Availability matrix · ERA · fatigue tracker · strand %',
  },
  offense: {
    label: 'Offense',
    description: 'Team hitting output and contact quality over the last 30 games, adjusted for the strength of opponents faced.',
    proTeaser: 'xwOBA · hard hit% · ISO · K% · BB% · sprint speed',
  },
  defense: {
    label: 'Batted-ball & defense',
    description: 'Fielding quality and outs above average, weighted toward how well each defense matches tonight\'s likely contact profile.',
    proTeaser: 'Fielding% · OAA by zone · GB-collision · pull-side exploit · catcher framing',
  },
  matchup: {
    label: 'Platoon & pitch-type',
    description: 'Hitter-vs-arsenal history — platoon splits and how tonight\'s lineup has handled this pitcher\'s primary pitches specifically.',
    proTeaser: 'Arsenal whiff% vs lineup · platoon OPS splits · H2H history',
  },
  park: {
    label: 'Park factor',
    description: 'How tonight\'s ballpark plays for home runs and run scoring, split by batter handedness where it matters.',
    proTeaser: 'HR factor by handedness · altitude · tonight\'s wind',
  },
  weather: {
    label: 'Weather',
    description: 'Temperature and wind effects on ball flight tonight. Usually a small factor unless conditions are extreme.',
    proTeaser: 'Wind carry · temperature effect · dome/open analysis',
  },
  rest: {
    label: 'Rest & travel',
    description: 'Days of rest and travel load for both teams — fatigue compounds over a long homestand or road trip.',
    proTeaser: 'Days rest · road trip length · schedule density',
  },
}

const FACTOR_ORDER: (keyof EdgeComponents)[] = [
  'starting_pitcher', 'bullpen', 'offense', 'defense',
  'matchup', 'park', 'weather', 'rest',
]

const RADAR_LABELS: Record<keyof EdgeComponents, string> = {
  starting_pitcher: 'SP', bullpen: 'Pen', offense: 'Off', defense: 'Def',
  matchup: 'Mtch', park: 'Park', weather: 'Wx', rest: 'Rest',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPct(score: number, forHome: boolean): number {
  if (score === 0) return 50
  const abs     = Math.abs(score)
  const winning = Math.min(97, 50 + abs * 0.55)
  const losing  = Math.max(13, 50 - abs * 0.45)
  return forHome ? (score > 0 ? winning : losing) : (score < 0 ? winning : losing)
}

function f2(v: any): string { const n = parseFloat(v); return isNaN(n) ? '–' : n.toFixed(2) }
function f1(v: any): string { const n = parseFloat(v); return isNaN(n) ? '–' : n.toFixed(1) }
function pct(v: any): string {
  const n = parseFloat(v)
  if (isNaN(n)) return '–'
  return n > 1 ? `${n.toFixed(1)}%` : `${(n * 100).toFixed(1)}%`
}
function sign(v: any): string {
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
function pctColor(p: number) {
  if (p >= 80) return '#27500A'; if (p >= 60) return '#185FA5'
  if (p <= 25) return '#791F1F'; if (p <= 40) return '#633806'
  return '#5F5E5A'
}
function pctBg(p: number) {
  if (p >= 80) return '#EAF3DE'; if (p >= 60) return '#E6F1FB'
  if (p <= 25) return '#FCEBEB'; if (p <= 40) return '#FAEEDA'
  return '#F1EFE8'
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
  if (dir === 'in')  return 'Blowing in ↓ (pitcher-friendly)'
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

// Best-effort fallback only — correctly handles single-word nicknames
// (Guardians, Yankees, Dodgers) but NOT multi-word ones (Red Sox, Blue Jays,
// White Sox). Pass home_team_slug/away_team_slug explicitly to avoid this
// entirely; this exists so links don't silently 404 to nothing while that's
// being wired up.
function fallbackTeamSlug(name: string): string {
  return name.trim().split(' ').pop()?.toLowerCase() ?? name.toLowerCase()
}

// ─── Edge summary ─────────────────────────────────────────────────────────────

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
  }

  const factors = topFactors
    .filter(k => {
      const s = components[k]
      return (winner === 'home' && s > 5) || (winner !== 'home' && s < -5)
    })
    .map(k => phrases[k] ?? FACTOR_META[k].label)

  const headlines: Record<string, string> = {
    strong:   `${winnerLeans} of 8 factors clearly favour ${winner}`,
    moderate: `${winnerLeans} of 8 factors lean ${winner}`,
    slight:   `A slim lean toward ${winner}`,
    tossup:   'The data is split',
  }
  const bodies: Record<string, string> = {
    strong:   `The data points clearly to ${winner} tonight. Multiple high-weight factors align.`,
    moderate: `${winner} holds a meaningful advantage across multiple factors.`,
    slight:   `The factors are close but not equal — ${winner} has the marginal edge.`,
    tossup:   'Both teams have genuine edges in different areas. Context decides this one.',
  }

  return { headline: headlines[tier] ?? headlines.slight, body: bodies[tier] ?? '', factors }
}

// ─── Tip ──────────────────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  return (
    <span className="edge-tip" style={{ position: 'relative', display: 'inline-block', marginLeft: 4, cursor: 'help' }}>
      <span style={{ borderBottom: '1px dotted var(--text-muted)' }}>ⓘ</span>
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

// ─── Spark / SparkTip ─────────────────────────────────────────────────────────
// Pure SVG sparkline + a hover popover, same reveal mechanism as Tip (CSS
// opacity, no JS state). Renders nothing if fewer than 2 points — callers
// don't need to guard, the component degrades on its own.

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

// ─── StatRow ──────────────────────────────────────────────────────────────────

function StatRow({
  label, away, home, note, tip, awayBetter, homeBetter, awayColor, homeColor,
  awaySeries, homeSeries, seriesLabel,
}: {
  label: string; away: string; home: string
  note?: string; tip?: string; awayBetter?: boolean; homeBetter?: boolean
  awayColor: string; homeColor: string
  // Optional — oldest→newest values for the season-trend hover popover.
  // No-op until a real data source populates these (see StatTrendSet).
  awaySeries?: number[] | null; homeSeries?: number[] | null; seriesLabel?: string
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', gap: 8,
      padding: '7px 0', borderBottom: '0.5px solid var(--border)',
      fontSize: 11,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontWeight: awayBetter ? 600 : 400,
        color: awayBetter ? awayColor : 'var(--text-primary)', textAlign: 'right',
      }}>
        <SparkTip value={away} series={awaySeries} color={awayColor} sampleLabel={seriesLabel} />
      </span>
      <span style={{ textAlign: 'center', minWidth: 100 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>
          {label}{tip && <Tip text={tip} />}
        </span>
        {note && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{note}</span>}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontWeight: homeBetter ? 600 : 400,
        color: homeBetter ? homeColor : 'var(--text-primary)',
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

// ─── ProDrillDown ─────────────────────────────────────────────────────────────

function ProDrillDown({ factorKey, raw, awayAbbr, homeAbbr, awayColor, homeColor }: {
  factorKey: keyof EdgeComponents; raw: any
  awayAbbr: string; homeAbbr: string
  awayColor: string; homeColor: string
}) {
  const ap = raw?.away_pitcher
  const hp = raw?.home_pitcher
  const at = raw?.away_team
  const ht = raw?.home_team
  const w  = raw?.weather
  const pk = raw?.park
  const ap6 = raw?.away_platoon
  const hp6 = raw?.home_platoon
  // Optional season-trend arrays — see StatTrendSet. Undefined until the
  // parent page queries a rolling-history source and passes it through
  // components_raw.trends; every consumer below degrades to plain values.
  const trendsAway = raw?.trends?.away ?? {}
  const trendsHome = raw?.trends?.home ?? {}

  const lo = (a: any, b: any) => a != null && b != null && parseFloat(a) < parseFloat(b)
  const hi = (a: any, b: any) => a != null && b != null && parseFloat(a) > parseFloat(b)
  const SR = (props: Omit<Parameters<typeof StatRow>[0], 'awayColor' | 'homeColor'>) =>
    <StatRow {...props} awayColor={awayColor} homeColor={homeColor} />

  if (factorKey === 'starting_pitcher') return (
    <div>
      <DrillSection title="Results" />
      <SR
        label="ERA (season)" note="lower = better"
        away={f2(ap?.era)} home={f2(hp?.era)}
        awayBetter={lo(ap?.era, hp?.era)} homeBetter={lo(hp?.era, ap?.era)}
        awaySeries={trendsAway.era} homeSeries={trendsHome.era} seriesLabel="ERA · season trend"
      />
      <SR label="FIP" note="defence-independent" away={f2(ap?.fip)} home={f2(hp?.fip)} awayBetter={lo(ap?.fip, hp?.fip)} homeBetter={lo(hp?.fip, ap?.fip)} />
      <SR label="xERA" note="Statcast expected" away={f2(ap?.xera)} home={f2(hp?.xera)} awayBetter={lo(ap?.xera, hp?.xera)} homeBetter={lo(hp?.xera, ap?.xera)} />
      <SR label="WHIP" away={f2(ap?.whip)} home={f2(hp?.whip)} awayBetter={lo(ap?.whip, hp?.whip)} homeBetter={lo(hp?.whip, ap?.whip)} />
      <SR label="L3 ERA" note="recent form" away={f2(ap?.l3_era)} home={f2(hp?.l3_era)} awayBetter={lo(ap?.l3_era, hp?.l3_era)} homeBetter={lo(hp?.l3_era, ap?.l3_era)} />
      <DrillSection title="Command" />
      <SR label="K/9" away={f1(ap?.k_per_9)} home={f1(hp?.k_per_9)} awayBetter={hi(ap?.k_per_9, hp?.k_per_9)} homeBetter={hi(hp?.k_per_9, ap?.k_per_9)} />
      <SR label="BB/9" note="lower = better" away={f1(ap?.bb_per_9)} home={f1(hp?.bb_per_9)} awayBetter={lo(ap?.bb_per_9, hp?.bb_per_9)} homeBetter={lo(hp?.bb_per_9, ap?.bb_per_9)} />
      <SR label="Chase rate" note="O-swing%; higher = wins for pitcher" away={pct(ap?.chase_rate)} home={pct(hp?.chase_rate)} awayBetter={hi(ap?.chase_rate, hp?.chase_rate)} homeBetter={hi(hp?.chase_rate, ap?.chase_rate)} />
      <SR label="Whiff%" away={pct(ap?.whiff_pct)} home={pct(hp?.whiff_pct)} awayBetter={hi(ap?.whiff_pct, hp?.whiff_pct)} homeBetter={hi(hp?.whiff_pct, ap?.whiff_pct)} />
      <DrillSection title="Contact quality against" />
      <SR label="Hard hit%" note="EV≥95mph; lower = better" away={pct(ap?.hard_hit_pct)} home={pct(hp?.hard_hit_pct)} awayBetter={lo(ap?.hard_hit_pct, hp?.hard_hit_pct)} homeBetter={lo(hp?.hard_hit_pct, ap?.hard_hit_pct)} />
      <SR label="Barrel%" note="lower = better" away={pct(ap?.barrel_pct)} home={pct(hp?.barrel_pct)} awayBetter={lo(ap?.barrel_pct, hp?.barrel_pct)} homeBetter={lo(hp?.barrel_pct, ap?.barrel_pct)} />
      <DrillSection title="Workload" />
      <SR label="Days rest" away={ap?.days_rest != null ? `${ap.days_rest}d` : '–'} home={hp?.days_rest != null ? `${hp.days_rest}d` : '–'} awayBetter={hi(ap?.days_rest, hp?.days_rest)} homeBetter={hi(hp?.days_rest, ap?.days_rest)} />
      <SR label="GB%" note="groundball rate" away={ap?.gb_rate != null ? `${Number(ap.gb_rate).toFixed(1)}%` : '–'} home={hp?.gb_rate != null ? `${Number(hp.gb_rate).toFixed(1)}%` : '–'} />
      {(ap?.tto1_xwoba != null || hp?.tto1_xwoba != null || ap?.tto1_era != null) && (
        <>
          <DrillSection title="Times through order (xwOBA)" />
          <SR label="1st time" away={f2(ap?.tto1_xwoba ?? ap?.tto1_era)} home={f2(hp?.tto1_xwoba ?? hp?.tto1_era)} awayBetter={lo(ap?.tto1_xwoba ?? ap?.tto1_era, hp?.tto1_xwoba ?? hp?.tto1_era)} homeBetter={lo(hp?.tto1_xwoba ?? hp?.tto1_era, ap?.tto1_xwoba ?? ap?.tto1_era)} />
          <SR label="2nd time" away={f2(ap?.tto2_xwoba ?? ap?.tto2_era)} home={f2(hp?.tto2_xwoba ?? hp?.tto2_era)} awayBetter={lo(ap?.tto2_xwoba ?? ap?.tto2_era, hp?.tto2_xwoba ?? hp?.tto2_era)} homeBetter={lo(hp?.tto2_xwoba ?? hp?.tto2_era, ap?.tto2_xwoba ?? ap?.tto2_era)} />
          <SR label="3rd time" note="fade risk" away={f2(ap?.tto3_xwoba ?? ap?.tto3_era)} home={f2(hp?.tto3_xwoba ?? hp?.tto3_era)} awayBetter={lo(ap?.tto3_xwoba ?? ap?.tto3_era, hp?.tto3_xwoba ?? hp?.tto3_era)} homeBetter={lo(hp?.tto3_xwoba ?? hp?.tto3_era, ap?.tto3_xwoba ?? ap?.tto3_era)} />
        </>
      )}
    </div>
  )

  if (factorKey === 'bullpen') {
    const fatigueLabel = (ip: any) => {
      const n = parseFloat(ip)
      if (isNaN(n)) return '–'
      if (n >= 5) return 'Gassed 🔴'; if (n >= 3) return 'Taxed 🟠'
      if (n >= 1) return 'Used 🟡'; return 'Fresh 🟢'
    }
    const dot = (v: boolean | null | undefined) => v == null ? '–' : v ? '● Available' : '○ Unavailable'
    return (
      <div>
        <DrillSection title="Quality" />
        <SR
          label="Bullpen ERA" note="lower = better"
          away={f2(at?.bullpen_era)} home={f2(ht?.bullpen_era)}
          awayBetter={lo(at?.bullpen_era, ht?.bullpen_era)} homeBetter={lo(ht?.bullpen_era, at?.bullpen_era)}
          awaySeries={trendsAway.bullpen_era} homeSeries={trendsHome.bullpen_era} seriesLabel="Bullpen ERA · trend"
        />
        <SR label="K/9 (pen)" away={f1(at?.bullpen_k_per_9)} home={f1(ht?.bullpen_k_per_9)} awayBetter={hi(at?.bullpen_k_per_9, ht?.bullpen_k_per_9)} homeBetter={hi(ht?.bullpen_k_per_9, at?.bullpen_k_per_9)} />
        <SR label="HR/9 (pen)" note="lower = better" away={f1(at?.bullpen_hr_per_9)} home={f1(ht?.bullpen_hr_per_9)} awayBetter={lo(at?.bullpen_hr_per_9, ht?.bullpen_hr_per_9)} homeBetter={lo(ht?.bullpen_hr_per_9, at?.bullpen_hr_per_9)} />
        <DrillSection title="Fatigue" />
        <SR label="IP yesterday" away={at?.bullpen_innings_yesterday != null ? `${f1(at.bullpen_innings_yesterday)} IP` : '–'} home={ht?.bullpen_innings_yesterday != null ? `${f1(ht.bullpen_innings_yesterday)} IP` : '–'} awayBetter={lo(at?.bullpen_innings_yesterday, ht?.bullpen_innings_yesterday)} homeBetter={lo(ht?.bullpen_innings_yesterday, at?.bullpen_innings_yesterday)} />
        <SR label="IP last 3 days" away={at?.bullpen_ip_last_3 != null ? `${f1(at.bullpen_ip_last_3)} IP` : '–'} home={ht?.bullpen_ip_last_3 != null ? `${f1(ht.bullpen_ip_last_3)} IP` : '–'} awayBetter={lo(at?.bullpen_ip_last_3, ht?.bullpen_ip_last_3)} homeBetter={lo(ht?.bullpen_ip_last_3, at?.bullpen_ip_last_3)} />
        <SR label="Status" away={fatigueLabel(at?.bullpen_innings_yesterday)} home={fatigueLabel(ht?.bullpen_innings_yesterday)} />
        <DrillSection title="Availability" />
        <SR label="Closer" away={dot(at?.closer_available)} home={dot(ht?.closer_available)} />
        <SR label="Setup arm 1" away={dot(at?.setup1_available)} home={dot(ht?.setup1_available)} />
        <SR label="Setup arm 2" away={dot(at?.setup2_available)} home={dot(ht?.setup2_available)} />
      </div>
    )
  }

  if (factorKey === 'offense') return (
    <div>
      <DrillSection title="Recent form" />
      <SR label="R/game (L30)" away={f1(at?.runs_per_game_l30)} home={f1(ht?.runs_per_game_l30)} awayBetter={hi(at?.runs_per_game_l30, ht?.runs_per_game_l30)} homeBetter={hi(ht?.runs_per_game_l30, at?.runs_per_game_l30)} />
      <SR
        label="OPS (L30)"
        away={f2(at?.ops_l30)} home={f2(ht?.ops_l30)}
        awayBetter={hi(at?.ops_l30, ht?.ops_l30)} homeBetter={hi(ht?.ops_l30, at?.ops_l30)}
        awaySeries={trendsAway.ops_l30} homeSeries={trendsHome.ops_l30} seriesLabel="OPS · rolling L30"
      />
      <SR label="ISO (power)" note=".150 = avg" away={at?.iso != null ? f2(at.iso) : '–'} home={ht?.iso != null ? f2(ht.iso) : '–'} awayBetter={hi(at?.iso, ht?.iso)} homeBetter={hi(ht?.iso, at?.iso)} />
      <SR label="K%" note="lower = better contact" away={pct(at?.k_pct)} home={pct(ht?.k_pct)} awayBetter={lo(at?.k_pct, ht?.k_pct)} homeBetter={lo(ht?.k_pct, at?.k_pct)} />
      <SR label="BB%" note="8.5% = avg" away={pct(at?.bb_pct)} home={pct(ht?.bb_pct)} awayBetter={hi(at?.bb_pct, ht?.bb_pct)} homeBetter={hi(ht?.bb_pct, at?.bb_pct)} />
      <DrillSection title="Contact quality" />
      <SR label="xwOBA" tip="Expected weighted on-base average — strips out defense/luck, based on exit velocity and launch angle." note=".315 = avg (luck-adjusted)" away={at?.xwoba_l30 != null ? f2(at.xwoba_l30) : '–'} home={ht?.xwoba_l30 != null ? f2(ht.xwoba_l30) : '–'} awayBetter={hi(at?.xwoba_l30, ht?.xwoba_l30)} homeBetter={hi(ht?.xwoba_l30, at?.xwoba_l30)} />
      <SR label="Hard hit%" note="EV≥95mph; 36% = avg" away={pct(at?.hard_hit_pct)} home={pct(ht?.hard_hit_pct)} awayBetter={hi(at?.hard_hit_pct, ht?.hard_hit_pct)} homeBetter={hi(ht?.hard_hit_pct, at?.hard_hit_pct)} />
      <SR label="Chase rate" note="lower = more patient" away={pct(at?.chase_rate)} home={pct(ht?.chase_rate)} awayBetter={lo(at?.chase_rate, ht?.chase_rate)} homeBetter={lo(ht?.chase_rate, at?.chase_rate)} />
      <SR label="SB%" away={pct(at?.stolen_base_pct)} home={pct(ht?.stolen_base_pct)} awayBetter={hi(at?.stolen_base_pct, ht?.stolen_base_pct)} homeBetter={hi(ht?.stolen_base_pct, at?.stolen_base_pct)} />
    </div>
  )

  if (factorKey === 'defense') return (
    <div>
      <DrillSection title="Fielding quality" />
      <SR label="Fielding %" note=".984 = avg" away={at?.fielding_pct != null ? Number(at.fielding_pct).toFixed(3) : '–'} home={ht?.fielding_pct != null ? Number(ht.fielding_pct).toFixed(3) : '–'} awayBetter={hi(at?.fielding_pct, ht?.fielding_pct)} homeBetter={hi(ht?.fielding_pct, at?.fielding_pct)} />
      <SR label="Defensive efficiency" tip="Share of balls in play converted to outs — the whole staff's team defense, not just OAA." note="balls in play converted to outs" away={at?.defensive_efficiency != null ? Number(at.defensive_efficiency).toFixed(3) : '–'} home={ht?.defensive_efficiency != null ? Number(ht.defensive_efficiency).toFixed(3) : '–'} awayBetter={hi(at?.defensive_efficiency, ht?.defensive_efficiency)} homeBetter={hi(ht?.defensive_efficiency, at?.defensive_efficiency)} />
      <SR label="Errors/game (L30)" note="lower = cleaner" away={f2(at?.errors_per_game_l30)} home={f2(ht?.errors_per_game_l30)} awayBetter={lo(at?.errors_per_game_l30, ht?.errors_per_game_l30)} homeBetter={lo(ht?.errors_per_game_l30, at?.errors_per_game_l30)} />
      <SR label="Catcher framing" note="runs above avg; higher = better" away={sign(at?.catcher_framing_runs)} home={sign(ht?.catcher_framing_runs)} awayBetter={hi(at?.catcher_framing_runs, ht?.catcher_framing_runs)} homeBetter={hi(ht?.catcher_framing_runs, at?.catcher_framing_runs)} />
      <DrillSection title="Outs above average" />
      <SR
        label="OAA (total)" note="0 = avg; + = elite"
        away={sign(at?.oaa)} home={sign(ht?.oaa)}
        awayBetter={hi(at?.oaa, ht?.oaa)} homeBetter={hi(ht?.oaa, at?.oaa)}
        awaySeries={trendsAway.oaa} homeSeries={trendsHome.oaa} seriesLabel="OAA · season cumulative"
      />
      <SR label="Infield OAA" away={sign(at?.infield_oaa)} home={sign(ht?.infield_oaa)} awayBetter={hi(at?.infield_oaa, ht?.infield_oaa)} homeBetter={hi(ht?.infield_oaa, at?.infield_oaa)} />
      <SR label="Outfield OAA" away={sign(at?.outfield_oaa)} home={sign(ht?.outfield_oaa)} awayBetter={hi(at?.outfield_oaa, ht?.outfield_oaa)} homeBetter={hi(ht?.outfield_oaa, at?.outfield_oaa)} />
      <DrillSection title="Batted-ball synergy (V6)" />
      <SR label="GB% (batting team)" note="collision with opposing pitcher's GB%" away={at?.gb_percent_batting != null ? pct(at.gb_percent_batting) : '–'} home={ht?.gb_percent_batting != null ? pct(ht.gb_percent_batting) : '–'} />
      <SR label="OAA — RF" note="targeted by LHB pull tendency" away={at?.oaa_rf != null ? sign(at.oaa_rf) : '–'} home={ht?.oaa_rf != null ? sign(ht.oaa_rf) : '–'} awayBetter={hi(at?.oaa_rf, ht?.oaa_rf)} homeBetter={hi(ht?.oaa_rf, at?.oaa_rf)} />
      <SR label="OAA — LF" note="targeted by RHB pull tendency" away={at?.oaa_lf != null ? sign(at.oaa_lf) : '–'} home={ht?.oaa_lf != null ? sign(ht.oaa_lf) : '–'} awayBetter={hi(at?.oaa_lf, ht?.oaa_lf)} homeBetter={hi(ht?.oaa_lf, at?.oaa_lf)} />
      <SR label="Pull% (LHB / RHB)" note="lineup handedness pull tendency" away={ap6 ? `${ap6?.pull_pct_lhb ?? '–'} / ${ap6?.pull_pct_rhb ?? '–'}` : '–'} home={hp6 ? `${hp6?.pull_pct_lhb ?? '–'} / ${hp6?.pull_pct_rhb ?? '–'}` : '–'} />
    </div>
  )

  if (factorKey === 'matchup') {
    const awayArsenal: any[] = raw?.away_pitcher_arsenal ?? []
    const homeArsenal: any[] = raw?.home_pitcher_arsenal ?? []
    const bestPitch = (arsenal: any[]) =>
      [...arsenal].sort((a, b) => (b.whiff_percent ?? b.whiff_pct ?? 0) - (a.whiff_percent ?? a.whiff_pct ?? 0))[0]
    const aBest = bestPitch(awayArsenal)
    const hBest = bestPitch(homeArsenal)
    return (
      <div>
        <DrillSection title="Platoon splits" />
        <SR label="vs LHB avg" note="pitcher vs lefties" away={f2(ap?.vs_lhb_baa)} home={f2(hp?.vs_lhb_baa)} awayBetter={lo(ap?.vs_lhb_baa, hp?.vs_lhb_baa)} homeBetter={lo(hp?.vs_lhb_baa, ap?.vs_lhb_baa)} />
        <SR label="vs RHB avg" note="pitcher vs righties" away={f2(ap?.vs_rhb_baa)} home={f2(hp?.vs_rhb_baa)} awayBetter={lo(ap?.vs_rhb_baa, hp?.vs_rhb_baa)} homeBetter={lo(hp?.vs_rhb_baa, ap?.vs_rhb_baa)} />
        {(aBest || hBest) && (
          <>
            <DrillSection title="Best pitch tonight (whiff%)" />
            <SR
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
      <SR label="HR factor" note=">1.0 = more HRs" away={pk?.hr_factor ? f2(pk.hr_factor) : '–'} home="park avg" />
      <SR label="Run factor" note=">1.0 = more runs" away={pk?.run_factor ? f2(pk.run_factor) : '–'} home="park avg" />
      <SR label="Altitude" away={pk?.altitude_feet != null ? `${Number(pk.altitude_feet).toLocaleString()} ft` : '–'} home="—" />
      {pk?.hr_factor_rhb != null && <SR label="HR factor (RHB)" note="righties" away={f2(pk.hr_factor_rhb)} home="park avg" />}
      {pk?.hr_factor_lhb != null && <SR label="HR factor (LHB)" note="lefties" away={f2(pk.hr_factor_lhb)} home="park avg" />}
      <DrillSection title="Tonight at this park" />
      <SR label="Wind direction" away={w?.wind_dir ? windLabel(w.wind_dir) : pk?.is_dome ? 'Dome — N/A' : '–'} home={w?.wind_mph != null ? `${w.wind_mph} mph` : '–'} />
      <SR label="Temperature" away={w?.temp_f != null ? `${Math.round(w.temp_f)}°F / ${Math.round((w.temp_f - 32) * 5/9)}°C` : pk?.is_dome ? 'Controlled' : '–'} home={w?.temp_f != null ? tempNote(w.temp_f) : '–'} />
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
          <SR label="Temperature" away={`${Math.round(w.temp_f)}°F / ${Math.round((w.temp_f - 32) * 5/9)}°C`} home={tempNote(w.temp_f)} />
          <SR label="Wind speed" away={w.wind_mph != null ? `${w.wind_mph} mph` : '–'} home="—" />
          <SR label="Wind direction" note="relative to CF" away={windLabel(w.wind_dir)} home="—" />
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
      <SR
        label="Last game"
        away={daysSince(at?.last_game_date)}
        home={daysSince(ht?.last_game_date)}
        awayBetter={(() => { const an = daysSinceNum(at?.last_game_date); const hn = daysSinceNum(ht?.last_game_date); return an != null && hn != null && an > hn })()} 
        homeBetter={(() => { const an = daysSinceNum(at?.last_game_date); const hn = daysSinceNum(ht?.last_game_date); return an != null && hn != null && hn > an })()} 
        note="more rest = fresher"
      />
      <SR label="Games (last 10 days)" note="schedule density" away={at?.games_last_10_days != null ? String(at.games_last_10_days) : '–'} home={ht?.games_last_10_days != null ? String(ht.games_last_10_days) : '–'} awayBetter={lo(at?.games_last_10_days, ht?.games_last_10_days)} homeBetter={lo(ht?.games_last_10_days, at?.games_last_10_days)} />
      <SR label="Day after night?" away={at?.day_after_night ? 'Yes ⚠' : 'No'} home={ht?.day_after_night ? 'Yes ⚠' : 'No'} awayBetter={!at?.day_after_night && ht?.day_after_night} homeBetter={!ht?.day_after_night && at?.day_after_night} />
      <DrillSection title="Travel (away team)" />
      <SR label="Road trip games" note="consecutive away" away={at?.consecutive_road_games != null ? `${at.consecutive_road_games}g` : '–'} home="Home" awayBetter={false} homeBetter={(at?.consecutive_road_games ?? 0) >= 4} />
      <SR label="Miles (last trip)" note="away team" away={at?.travel_miles_last != null && at.travel_miles_last > 0 ? `${Math.round(at.travel_miles_last).toLocaleString()} mi` : '–'} home="Home" />
    </div>
  )

  return <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Detailed data available with Pro.</div>
}

// ─── RadarChart ───────────────────────────────────────────────────────────────
// V2: now sized for a full-width standalone section rather than squeezed
// into the hero row — dimensions bumped from 160 to 220, everything else
// (math, legend) unchanged.

function RadarChart({ components, homeAbbr, awayAbbr, awayColor, homeColor, size = 220 }: {
  components: EdgeComponents; homeAbbr: string; awayAbbr: string
  awayColor: string; homeColor: string; size?: number
}) {
  const VB = 200; const CX = VB / 2; const CY = VB / 2
  const RADIUS = 60; const LABEL_R = RADIUS + 18

  function spokePoint(i: number, r: number): [number, number] {
    const a = (i / 8) * 2 * Math.PI - Math.PI / 2
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
      style={{ display: 'block', flexShrink: 0 }}>
      {[0.25, 0.5, 0.75, 1].map((p, ri) => (
        <polygon key={ri}
          points={FACTOR_ORDER.map((_, i) => { const [x, y] = spokePoint(i, p * RADIUS); return `${x.toFixed(1)},${y.toFixed(1)}` }).join(' ')}
          fill="none" stroke={MIST} strokeWidth={ri === 3 ? 1 : 0.6} />
      ))}
      {FACTOR_ORDER.map((_, i) => { const [x, y] = spokePoint(i, RADIUS); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke={MIST} strokeWidth="0.6" /> })}
      <polygon points={polygon(false)} fill={awayColor} fillOpacity={0.12} stroke={awayColor} strokeWidth={2} strokeLinejoin="round" />
      <polygon points={polygon(true)}  fill={homeColor} fillOpacity={0.12} stroke={homeColor} strokeWidth={2} strokeLinejoin="round" />
      {FACTOR_ORDER.map((key, i) => {
        const [x, y] = spokePoint(i, LABEL_R)
        return <text key={key} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#888780">{RADAR_LABELS[key]}</text>
      })}
    </svg>
  )
}

// ─── EdgeTrendChart ─────────────────────────────────────────────────────────

function EdgeTrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  if (!points || points.length < 2) return null
  const W = 640, H = 70, PAD = 6
  const values = points.map(p => p.edge_score)
  const min = Math.min(...values, -10), max = Math.max(...values, 10)
  const range = max - min || 1
  const xStep = (W - PAD * 2) / (points.length - 1)
  const yFor = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)
  const zeroY = yFor(0)
  const coords = points.map((p, i) => [PAD + i * xStep, yFor(p.edge_score)] as [number, number])
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={MIST} strokeWidth={1} strokeDasharray="3,4" />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2.2}
          fill={color} stroke={i === coords.length - 1 ? '#fff' : 'none'} strokeWidth={i === coords.length - 1 ? 1 : 0} />
      ))}
    </svg>
  )
}

// ─── FormStrip ────────────────────────────────────────────────────────────────

function FormStrip({ abbr, color, results, record }: {
  abbr: string; color: string; results: FormResult[]; record: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color, width: 30 }}>{abbr}</span>
      <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' as const }}>
        {results.map((r, i) => (
          <span key={i} style={{
            width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700,
            background: r === 'W' ? `${color}22` : MIST,
            color: r === 'W' ? color : 'var(--text-muted)',
            border: `1px solid ${r === 'W' ? `${color}55` : 'var(--border)'}`,
          }}>{r}</span>
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', width: 36, textAlign: 'right' }}>{record}</span>
    </div>
  )
}

// ─── ProbablePitcherRow ──────────────────────────────────────────────────────

function ProbablePitcherRow({ pitcher, abbr, color, align, playerPageHref }: {
  pitcher: any; abbr: string; color: string; align: 'left' | 'right'
  playerPageHref: (id: number) => string
}) {
  if (!pitcher?.player_id) return null
  const flexDir = align === 'right' ? 'row-reverse' : 'row'
  return (
    <a href={playerPageHref(pitcher.player_id)} className="edge-headshot-link" style={{
      display: 'flex', flexDirection: flexDir as any, alignItems: 'center', gap: 8,
      textDecoration: 'none', flex: 1, minWidth: 0, position: 'relative',
    }}>
      <img
        className="edge-headshot-img"
        src={playerHeadshotUrl(pitcher.player_id)}
        alt={pitcher.player_name ?? 'Pitcher'}
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: MIST, border: '1px solid var(--border)', flexShrink: 0 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pitcher.player_name ?? '—'}</span>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color, fontWeight: 700, letterSpacing: '.03em' }}>{abbr}{pitcher.era != null ? ` · ${f2(pitcher.era)} ERA` : ''}</span>
      </div>
      <span className="edge-view-tag" style={{
        position: 'absolute', bottom: -13, [align === 'right' ? 'right' : 'left']: 0,
        fontSize: 8, letterSpacing: '.05em', color: '#FF5722', fontWeight: 700, whiteSpace: 'nowrap' as const,
      }}>
        VIEW PROFILE →
      </span>
    </a>
  )
}
function FactorLabelTip({ label, description }: { label: string; description: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help', minWidth: 0 }}
    >
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        borderBottom: '1px dotted var(--text-muted)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>ⓘ</span>
      {show && (
     <span style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width: 220, background: '#1A1A1A', color: '#FAF8F3', fontSize: 10.5, lineHeight: 1.55,
          padding: '9px 11px', borderRadius: 6, zIndex: 50, pointerEvents: 'none' as const,
          boxShadow: '0 8px 20px -6px rgba(0,0,0,0.35)',
        }}>
          {description}
        </span>
      )}
    </span>
  )
}
// ─── FactorBar ────────────────────────────────────────────────────────────────

function FactorBar({ factorKey, score, homeAbbr, awayAbbr, isPro, raw, awayColor, homeColor }: {
  factorKey: keyof EdgeComponents; score: number
  homeAbbr: string; awayAbbr: string; isPro: boolean; raw: any
  awayColor: string; homeColor: string
}) {
  // `pinned` = click-to-toggle (works on touch, sticks until tapped again).
  // `hovering` = desktop mouseenter/mouseleave, purely additive — never
  // fires on touch devices, so mobile behaviour is unchanged.
const [pinned, setPinned] = useState(false)
  const expanded = pinned
  const meta     = FACTOR_META[factorKey]
  const homePct  = toPct(score, true)
  const awayPct  = toPct(score, false)
  const homeWins = score > 5
  const awayWins = score < -5
  const clamp    = (v: number) => Math.max(3, Math.min(97, v))
  const homePos  = clamp(homePct)
  const awayPos  = clamp(awayPct)

  return (
 <div style={{ borderBottom: '0.5px solid var(--border)' }}>
      <div onClick={() => setPinned(!pinned)} className="edge-factor-row" style={{ padding: '11px 0', cursor: 'pointer', userSelect: 'none' as const }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <FactorLabelTip label={meta.label} description={meta.description} />
        </div>

        {/* Dual track — away on top, home below */}
        <div style={{ position: 'relative', overflow: 'visible' }}>
          {/* Away track */}
          <div style={{ position: 'relative', height: 5, marginBottom: 5, overflow: 'visible' }}>
            <div style={{ position: 'absolute', inset: 0, background: MIST, borderRadius: 3 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${awayPos}%`, background: awayColor, opacity: awayWins ? 1 : 0.3, borderRadius: 3 }} />
            <div style={{
              position: 'absolute', left: `${awayPos}%`, top: '50%',
              transform: 'translate(-50%,-50%)', width: 11, height: 11, borderRadius: '50%',
              background: awayWins ? awayColor : '#C0B8AD',
              border: `2px solid ${awayWins ? awayColor : '#9A9288'}`,
              boxShadow: awayWins ? `0 0 0 3px ${awayColor}33` : 'none',
              zIndex: 2,
            }} />
          </div>
          {/* Home track */}
          <div style={{ position: 'relative', height: 5, overflow: 'visible' }}>
            <div style={{ position: 'absolute', inset: 0, background: MIST, borderRadius: 3 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${homePos}%`, background: homeColor, opacity: homeWins ? 1 : 0.3, borderRadius: 3 }} />
            <div style={{
              position: 'absolute', left: `${homePos}%`, top: '50%',
              transform: 'translate(-50%,-50%)', width: 11, height: 11, borderRadius: '50%',
              background: homeWins ? homeColor : '#C0B8AD',
              border: `2px solid ${homeWins ? homeColor : '#9A9288'}`,
              boxShadow: homeWins ? `0 0 0 3px ${homeColor}33` : 'none',
              zIndex: 2,
            }} />
          </div>
        </div>

        {/* Percentile pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
          <span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500, color: pctColor(awayPct), background: pctBg(awayPct), padding: '2px 5px', borderRadius: 4 }}>
            {Math.round(awayPct)}
          </span>
          <span style={{ fontSize: 9, color: '#B0A898' }}>|</span>
          <span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500, color: pctColor(homePct), background: pctBg(homePct), padding: '2px 5px', borderRadius: 4 }}>
            {Math.round(homePct)}
          </span>
        </div>

        {/* Chevron */}
        <div style={{ textAlign: 'center', color: '#A0998E', fontSize: 12 }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Expanded drill-down — opens on hover (desktop) or click-pin (any device) */}
      {expanded && (
        <div style={{ background: SAND, margin: '0 -16px', padding: '10px 16px 12px', borderTop: '0.5px solid var(--border)' }}>
          {isPro ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '0 0 6px', borderBottom: '0.5px solid var(--border)', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: awayColor, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{awayAbbr}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', minWidth: 100 }}>stat</span>
                <span style={{ fontSize: 9, color: homeColor, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{homeAbbr}</span>
              </div>
              <ProDrillDown factorKey={factorKey} raw={raw} awayAbbr={awayAbbr} homeAbbr={homeAbbr} awayColor={awayColor} homeColor={homeColor} />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: '#888', marginBottom: 2, fontWeight: 600 }}>⊕ Pro — full drill-down</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{meta.proTeaser}</div>
              </div>
              <a href="/pricing" onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '5px 12px', background: '#1A1A1A', color: '#FDE047', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                Unlock →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EdgePanel ────────────────────────────────────────────────────────────────

function EdgePanel({ components, predicted_winner, confidence_tier, homeAbbr, awayAbbr, winnerLeans, pro_takeaways, isPro, lineups_confirmed, updated_at, awayColor, homeColor }: {
  components: EdgeComponents; predicted_winner: string; confidence_tier: string
  homeAbbr: string; awayAbbr: string; winnerLeans: number
  pro_takeaways?: Array<{ stat: string; text: string; edge: 'home' | 'away' | 'neutral' }> | null
  isPro: boolean; lineups_confirmed?: boolean; updated_at: string
  awayColor: string; homeColor: string
}) {
  const winner      = predicted_winner === 'home' ? homeAbbr : awayAbbr
  const winnerColor = predicted_winner === 'home' ? homeColor : awayColor
  const summary     = buildEdgeSummary(components, winner, winnerLeans, confidence_tier)

  return (
    <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column' as const, gap: 14, height: '100%' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: winnerColor, marginBottom: 4, lineHeight: 1.3 }}>
          {summary.headline}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {summary.body}
        </div>
      </div>

      {summary.factors.length > 0 && (
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 6 }}>Key factors</div>
          {summary.factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 5 }}>
              <span style={{ flexShrink: 0, marginTop: 2, width: 6, height: 6, borderRadius: '50%', background: winnerColor, display: 'inline-block' }} />
              {f}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: SAND, borderRadius: 8, padding: '9px 10px' }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 5 }}>How to read this</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Each bar shows where both teams rank for that factor. Coloured dots mark the stronger team. Numbers are relative percentile ranks.
        </div>
      </div>

      {isPro && pro_takeaways && pro_takeaways.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.07em', color: 'var(--text-muted)' }}>Pro takeaways</div>
          {pro_takeaways.map((t, i) => (
            <div key={i} style={{ background: SAND, borderRadius: 7, padding: '8px 10px', borderLeft: `2px solid ${t.edge === 'home' ? homeColor : t.edge === 'away' ? awayColor : '#888780'}` }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 3 }}>{t.stat}</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>{t.text}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 10, paddingBottom: 12, borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span>Updated {timeAgo(updated_at)}</span>
        {lineups_confirmed && (
          <span style={{ padding: '2px 7px', borderRadius: 20, background: '#EAF3DE', color: '#27500A', fontWeight: 500 }}>✓ Confirmed</span>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EdgeIndicatorV6(props: EdgeIndicatorV6Props) {
  const isPro       = props.is_pro === true
  const homeAbbr    = props.home_team_abbr ?? props.home_team.slice(0, 3).toUpperCase()
  const awayAbbr    = props.away_team_abbr ?? props.away_team.slice(0, 3).toUpperCase()

  const awayCOLOR   = props.away_primary_color ?? '#b9d01f'
  const homeCOLOR   = props.home_primary_color ?? '#d212c2'

  const winner      = props.predicted_winner === 'home' ? homeAbbr : awayAbbr
  const sliderPct   = Math.max(3, Math.min(97, 50 + props.edge_score / 2))
  const homeLeans   = FACTOR_ORDER.filter(k => props.components[k] > 5).length
  const awayLeans   = FACTOR_ORDER.filter(k => props.components[k] < -5).length
  const winnerLeans = props.predicted_winner === 'home' ? homeLeans : awayLeans
  const winnerColor = props.predicted_winner === 'home' ? homeCOLOR : awayCOLOR
  const raw         = props.components_raw

  // Player route is unambiguous — /mlb/players/[id] (plural). Team route
  // needs a slug, not the numeric ID, so we resolve it from the explicit
  // *_team_slug prop first and only fall back to a best-effort guess.
  const awaySlug   = props.away_team_slug ?? fallbackTeamSlug(props.away_team)
  const homeSlug   = props.home_team_slug ?? fallbackTeamSlug(props.home_team)
  const teamHref   = props.team_page_href   ?? ((_id: number, slug?: string | null) => `/mlb/teams/${slug ?? ''}`)
  const playerHref = props.player_page_href ?? ((id: number) => `/mlb/players/${id}`)

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '0.5px solid var(--border)', background: 'var(--surface-2)' }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Hero */}
      <div style={{ background: SAND, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {props.away_team_id != null && (
              <a href={teamHref(props.away_team_id, awaySlug)} className="edge-logo-link" style={{ display: 'block', flexShrink: 0 }} title={`Open ${props.away_team}`}>
                <img className="edge-logo-img" src={teamLogoUrl(props.away_team_id)} alt={props.away_team} style={{ width: 22, height: 22, display: 'block' }} />
              </a>
            )}
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.3px', whiteSpace: 'nowrap' as const }}>
              <span style={{ color: props.predicted_winner === 'away' ? awayCOLOR : 'var(--text-primary)' }}>{awayAbbr}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 14, margin: '0 6px' }}>at</span>
              <span style={{ color: props.predicted_winner === 'home' ? homeCOLOR : 'var(--text-primary)' }}>{homeAbbr}</span>
            </div>
            {props.home_team_id != null && (
              <a href={teamHref(props.home_team_id, homeSlug)} className="edge-logo-link" style={{ display: 'block', flexShrink: 0 }} title={`Open ${props.home_team}`}>
                <img className="edge-logo-img" src={teamLogoUrl(props.home_team_id)} alt={props.home_team} style={{ width: 22, height: 22, display: 'block' }} />
              </a>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: tierBg(props.confidence_tier), color: tierColor(props.confidence_tier), flexShrink: 0 }}>
            {tierLabel(props.confidence_tier)}
          </span>
        </div>

        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Data factors lean</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: winnerColor }}>
            {winnerLeans}
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/8</span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>{winner}</span>
          </div>
        </div>
        {/* Slider */}
        <div style={{ position: 'relative', height: 6, background: MIST, borderRadius: 3 }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, borderRadius: 3,
            background: winnerColor,
            ...(props.predicted_winner === 'home'
              ? { left: '50%', right: `${100 - sliderPct}%` }
              : { left: `${sliderPct}%`, right: '50%' })
          }} />
          <div style={{ position: 'absolute', top: '50%', left: `${sliderPct}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: '#FDE047', border: '2px solid rgba(0,0,0,.15)', boxShadow: `0 0 0 3px ${winnerColor}44` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: awayCOLOR, fontWeight: 600 }}>{awayAbbr}</span>
          <span>Neutral</span>
          <span style={{ color: homeCOLOR, fontWeight: 600 }}>{homeAbbr}</span>
        </div>
      </div>

      {/* Eight Factors · Shape — full-width standalone section */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#888' }}>Eight Factors</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Shape</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
          <RadarChart components={props.components} homeAbbr={homeAbbr} awayAbbr={awayAbbr} awayColor={awayCOLOR} homeColor={homeCOLOR} size={220} />
          <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: awayCOLOR, fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: awayCOLOR, display: 'inline-block' }} />{props.away_team}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: homeCOLOR, fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: homeCOLOR, display: 'inline-block' }} />{props.home_team}
            </span>
          </div>
        </div>
      </div>

      {/* Probable pitchers — no-ops if absent */}
      {(raw?.away_pitcher?.player_id || raw?.home_pitcher?.player_id) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid var(--border)' }}>
          <ProbablePitcherRow pitcher={raw?.away_pitcher} abbr={awayAbbr} color={awayCOLOR} align="left" playerPageHref={playerHref} />
          <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>vs</span>
          <ProbablePitcherRow pitcher={raw?.home_pitcher} abbr={homeAbbr} color={homeCOLOR} align="right" playerPageHref={playerHref} />
        </div>
      )}

      {/* Edge Trend — no-ops without props.trend */}
      {props.trend && props.trend.length >= 2 && (
        <div style={{ padding: '12px 16px 4px', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 6 }}>
            Edge trend · last {props.trend.length} games
          </div>
          <EdgeTrendChart points={props.trend} color={winnerColor} />
        </div>
      )}

      {/* Last 10 Form — no-ops without props.form */}
      {props.form && (
        <div style={{ padding: '2px 16px', borderBottom: '0.5px solid var(--border)' }}>
          <FormStrip abbr={awayAbbr} color={awayCOLOR} results={props.form.away.results} record={props.form.away.record} />
          <FormStrip abbr={homeAbbr} color={homeCOLOR} results={props.form.home.results} record={props.form.home.record} />
        </div>
      )}

      {/* Section headers — responsive via .edge-head-grid */}
      <div className="edge-head-grid" style={{ background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border)' }}>
        <div className="edge-head-left" style={{ padding: '9px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#888' }}>
          Factors
        </div>
        <div className="edge-head-right" style={{ padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#888' }}>
          The edge
        </div>
      </div>

      {/* Main body — responsive via .edge-body-grid */}
      <div className="edge-body-grid">

        {/* Left — factors */}
        <div className="edge-factors-col" style={{ padding: '0 16px', minWidth: 0 }}>
          {/* Column headers */}
          <div className="edge-factor-header-row" style={{ padding: '7px 0 6px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Factor</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 18, height: 3, background: awayCOLOR, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: awayCOLOR, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{awayAbbr}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 18, height: 3, background: homeCOLOR, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: homeCOLOR, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{homeAbbr}</span>
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{awayAbbr} | {homeAbbr}</div>
            <div />
          </div>

          {FACTOR_ORDER.map((key) => (
            <FactorBar key={key} factorKey={key} score={props.components[key]}
              homeAbbr={homeAbbr} awayAbbr={awayAbbr} isPro={isPro} raw={raw}
              awayColor={awayCOLOR} homeColor={homeCOLOR} />
          ))}

          <div style={{ height: 4 }} />

          {!isPro && (
            <div style={{ margin: '4px 0 14px', background: '#1A1A1A', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: '#FDE047', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 5 }}>⊕ Pro · £4/mo founding rate</div>
              <div style={{ fontSize: 12, color: 'rgba(250,248,243,.8)', lineHeight: 1.5, marginBottom: 8 }}>
                Full drill-down on every factor — every stat behind the bars.
              </div>
              <a href="/pricing" style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '6px 14px', background: '#FDE047', color: '#1A1A1A', borderRadius: 6, textDecoration: 'none' }}>
                See Pro pricing →
              </a>
            </div>
          )}
        </div>

        {/* Right — edge panel */}
        <EdgePanel
          components={props.components}
          predicted_winner={props.predicted_winner}
          confidence_tier={props.confidence_tier}
          homeAbbr={homeAbbr} awayAbbr={awayAbbr}
          winnerLeans={winnerLeans}
          pro_takeaways={props.pro_takeaways}
          isPro={isPro}
          lineups_confirmed={props.lineups_confirmed}
          updated_at={props.updated_at}
          awayColor={awayCOLOR}
          homeColor={homeCOLOR}
        />
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--border)', background: SAND, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>⊕ The Edge · Information only · Not betting advice</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Percentile ranks vs MLB this season</span>
      </div>
    </div>
  )
}