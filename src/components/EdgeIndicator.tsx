'use client'

import { useState } from 'react'

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
}

// ─── Static constants ────────────────────────────────────────────────────────

const SAND = '#F5F0E8'
const MIST = '#E8E2D8'

// ─── Factor metadata ──────────────────────────────────────────────────────────

const FACTOR_META: Record<keyof EdgeComponents, { label: string; proTeaser: string }> = {
  starting_pitcher: { label: 'Starting pitcher', proTeaser: 'xERA · chase rate · TTO splits · K/BB · quality starts' },
  bullpen:          { label: 'Bullpen',           proTeaser: 'Availability matrix · ERA · fatigue tracker · strand %' },
  offense:          { label: 'Offense',           proTeaser: 'xwOBA · hard hit% · ISO · K% · BB% · sprint speed' },
  defense:          { label: 'Defense',           proTeaser: 'OAA by zone · errors/G · sprint speed · catcher framing' },
  matchup:          { label: 'Pitch matchup',     proTeaser: 'Arsenal whiff% vs lineup · platoon OPS splits' },
  park:             { label: 'Park factor',       proTeaser: 'HR factor by handedness · altitude · tonight\'s wind' },
  weather:          { label: 'Weather',           proTeaser: 'Wind carry · temperature effect · dome/open analysis' },
  rest:             { label: 'Rest & travel',     proTeaser: 'Days rest · road trip length · schedule density' },
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
    defense: 'defensive edge',
    matchup: 'pitch matchup advantage',
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

// ─── StatRow ──────────────────────────────────────────────────────────────────

function StatRow({ label, away, home, note, awayBetter, homeBetter, awayColor, homeColor }: {
  label: string; away: string; home: string
  note?: string; awayBetter?: boolean; homeBetter?: boolean
  awayColor: string; homeColor: string
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
        {away}
      </span>
      <span style={{ textAlign: 'center', minWidth: 100 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>{label}</span>
        {note && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{note}</span>}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontWeight: homeBetter ? 600 : 400,
        color: homeBetter ? homeColor : 'var(--text-primary)',
      }}>
        {home}
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

  const lo = (a: any, b: any) => a != null && b != null && parseFloat(a) < parseFloat(b)
  const hi = (a: any, b: any) => a != null && b != null && parseFloat(a) > parseFloat(b)
  const SR = (props: Omit<Parameters<typeof StatRow>[0], 'awayColor' | 'homeColor'>) =>
    <StatRow {...props} awayColor={awayColor} homeColor={homeColor} />

  if (factorKey === 'starting_pitcher') return (
    <div>
      <DrillSection title="Results" />
      <SR label="ERA (season)" note="lower = better" away={f2(ap?.era)} home={f2(hp?.era)} awayBetter={lo(ap?.era, hp?.era)} homeBetter={lo(hp?.era, ap?.era)} />
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
        <SR label="Bullpen ERA" note="lower = better" away={f2(at?.bullpen_era)} home={f2(ht?.bullpen_era)} awayBetter={lo(at?.bullpen_era, ht?.bullpen_era)} homeBetter={lo(ht?.bullpen_era, at?.bullpen_era)} />
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
      <SR label="OPS (L30)" away={f2(at?.ops_l30)} home={f2(ht?.ops_l30)} awayBetter={hi(at?.ops_l30, ht?.ops_l30)} homeBetter={hi(ht?.ops_l30, at?.ops_l30)} />
      <SR label="ISO (power)" note=".150 = avg" away={at?.iso != null ? f2(at.iso) : '–'} home={ht?.iso != null ? f2(ht.iso) : '–'} awayBetter={hi(at?.iso, ht?.iso)} homeBetter={hi(ht?.iso, at?.iso)} />
      <SR label="K%" note="lower = better contact" away={pct(at?.k_pct)} home={pct(ht?.k_pct)} awayBetter={lo(at?.k_pct, ht?.k_pct)} homeBetter={lo(ht?.k_pct, at?.k_pct)} />
      <SR label="BB%" note="8.5% = avg" away={pct(at?.bb_pct)} home={pct(ht?.bb_pct)} awayBetter={hi(at?.bb_pct, ht?.bb_pct)} homeBetter={hi(ht?.bb_pct, at?.bb_pct)} />
      <DrillSection title="Contact quality" />
      <SR label="xwOBA" note=".315 = avg (luck-adjusted)" away={at?.xwoba != null ? f2(at.xwoba) : '–'} home={ht?.xwoba != null ? f2(ht.xwoba) : '–'} awayBetter={hi(at?.xwoba, ht?.xwoba)} homeBetter={hi(ht?.xwoba, at?.xwoba)} />
      <SR label="Hard hit%" note="EV≥95mph; 36% = avg" away={pct(at?.hard_hit_pct)} home={pct(ht?.hard_hit_pct)} awayBetter={hi(at?.hard_hit_pct, ht?.hard_hit_pct)} homeBetter={hi(ht?.hard_hit_pct, at?.hard_hit_pct)} />
      <SR label="Chase rate" note="lower = more patient" away={pct(at?.chase_rate)} home={pct(ht?.chase_rate)} awayBetter={lo(at?.chase_rate, ht?.chase_rate)} homeBetter={lo(ht?.chase_rate, at?.chase_rate)} />
      <SR label="SB%" away={pct(at?.stolen_base_pct)} home={pct(ht?.stolen_base_pct)} awayBetter={hi(at?.stolen_base_pct, ht?.stolen_base_pct)} homeBetter={hi(ht?.stolen_base_pct, at?.stolen_base_pct)} />
    </div>
  )

  if (factorKey === 'defense') return (
    <div>
      <DrillSection title="Outs above average" />
      <SR label="OAA (total)" note="0 = avg; + = elite" away={sign(at?.oaa)} home={sign(ht?.oaa)} awayBetter={hi(at?.oaa, ht?.oaa)} homeBetter={hi(ht?.oaa, at?.oaa)} />
      <SR label="Errors/game (L30)" note="lower = cleaner" away={f2(at?.errors_per_game_l30)} home={f2(ht?.errors_per_game_l30)} awayBetter={lo(at?.errors_per_game_l30, ht?.errors_per_game_l30)} homeBetter={lo(ht?.errors_per_game_l30, at?.errors_per_game_l30)} />
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
        <SR label="GB%" note="groundball rate" away={ap?.gb_rate != null ? `${Number(ap.gb_rate).toFixed(1)}%` : '–'} home={hp?.gb_rate != null ? `${Number(hp.gb_rate).toFixed(1)}%` : '–'} />
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

function RadarChart({ components, homeAbbr, awayAbbr, awayColor, homeColor }: {
  components: EdgeComponents; homeAbbr: string; awayAbbr: string
  awayColor: string; homeColor: string
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
    <svg width="160" height="160" viewBox={`0 0 ${VB} ${VB}`}
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
      {/* Legend */}
      <line x1="12" y1="180" x2="28" y2="180" stroke={awayColor} strokeWidth="2.5" strokeLinecap="round"/>
      <text x="32" y="180" dominantBaseline="middle" fontSize="8" fontFamily="var(--font-mono)" fill={awayColor}>{awayAbbr}</text>
      <line x1="12" y1="192" x2="28" y2="192" stroke={homeColor} strokeWidth="2.5" strokeLinecap="round"/>
      <text x="32" y="192" dominantBaseline="middle" fontSize="8" fontFamily="var(--font-mono)" fill={homeColor}>{homeAbbr}</text>
    </svg>
  )
}

// ─── FactorBar ────────────────────────────────────────────────────────────────

function FactorBar({ factorKey, score, homeAbbr, awayAbbr, isPro, raw, awayColor, homeColor }: {
  factorKey: keyof EdgeComponents; score: number
  homeAbbr: string; awayAbbr: string; isPro: boolean; raw: any
  awayColor: string; homeColor: string
}) {
  const [expanded, setExpanded] = useState(false)
  const meta     = FACTOR_META[factorKey]
  const homePct  = toPct(score, true)
  const awayPct  = toPct(score, false)
  const homeWins = score > 5
  const awayWins = score < -5
  const clamp    = (v: number) => Math.max(3, Math.min(97, v))
  const homePos  = clamp(homePct)
  const awayPos  = clamp(awayPct)

  // Darken a hex colour slightly for the dot border
  const darken = (hex: string) => hex  // keep simple — border uses same color at lower opacity

  return (
    <div style={{ borderBottom: '0.5px solid var(--border)' }}>
      <div onClick={() => setExpanded(!expanded)} style={{
        display: 'grid', gridTemplateColumns: '1fr 130px 68px 18px',
        alignItems: 'center', gap: 8,
        padding: '11px 0', cursor: 'pointer', userSelect: 'none' as const,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {meta.label}
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

      {/* Expanded drill-down */}
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

  // Team colours — use team primaries, fall back to brand defaults
  const awayCOLOR   = props.away_primary_color ?? '#b9d01f'
  const homeCOLOR   = props.home_primary_color ?? '#d212c2'

  const winner      = props.predicted_winner === 'home' ? homeAbbr : awayAbbr
  const sliderPct   = Math.max(3, Math.min(97, 50 + props.edge_score / 2))
  const homeLeans   = FACTOR_ORDER.filter(k => props.components[k] > 5).length
  const awayLeans   = FACTOR_ORDER.filter(k => props.components[k] < -5).length
  const winnerLeans = props.predicted_winner === 'home' ? homeLeans : awayLeans
  const winnerColor = props.predicted_winner === 'home' ? homeCOLOR : awayCOLOR
  const raw         = props.components_raw

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '0.5px solid var(--border)', background: 'var(--surface-2)' }}>

      {/* Hero */}
      <div style={{ background: SAND, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.3px' }}>
            <span style={{ color: props.predicted_winner === 'away' ? awayCOLOR : 'var(--text-primary)' }}>{awayAbbr}</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 14, margin: '0 6px' }}>at</span>
            <span style={{ color: props.predicted_winner === 'home' ? homeCOLOR : 'var(--text-primary)' }}>{homeAbbr}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: tierBg(props.confidence_tier), color: tierColor(props.confidence_tier) }}>
            {tierLabel(props.confidence_tier)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <RadarChart components={props.components} homeAbbr={homeAbbr} awayAbbr={awayAbbr} awayColor={awayCOLOR} homeColor={homeCOLOR} />
          <div style={{ flex: 1 }}>
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
        </div>
      </div>

      {/* Section headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ padding: '9px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#888', borderRight: '0.5px solid var(--border)', borderBottom: '2px solid #E0D8CE' }}>
          Factors
        </div>
        <div style={{ padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: '#888', borderBottom: '2px solid transparent' }}>
          The edge
        </div>
      </div>

      {/* Main body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px' }}>

        {/* Left — factors */}
        <div style={{ padding: '0 16px', borderRight: '0.5px solid var(--border)' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 68px 18px', gap: 8, padding: '7px 0 6px', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
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
      <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--border)', background: SAND, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>⊕ The Edge · Information only · Not betting advice</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Percentile ranks vs MLB this season</span>
      </div>
    </div>
  )
}