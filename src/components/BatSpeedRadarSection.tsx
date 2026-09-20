// src/components/BatSpeedRadarSection.tsx
//
// "Bat speed vs. production" expanded view — same framework as the ABS
// Challenge radar (AbsRadarSection.tsx): a 5-axis percentile radar per
// player plus a "neural style" headshot scatter, both built off the real
// per-pitch Statcast CSV already fetched for every player in the pool
// (see batter-bat-speed.ts) — no new fetches, just more views on data
// that's already there.
//
// Every axis is a PERCENTILE against the cohort actually passed in (the
// combined miss-distance + HR-leader pool from page.tsx), same reasoning
// as the ABS radar: a 5-axis shape is only comparable across players when
// each axis is ranked, not raw. "Miss precision" is the one inverted axis
// (lower average miss distance = better = higher percentile) — built with
// an explicit higherIsBetter flag rather than a silent sign flip, so it's
// legible in the code, not just the output.

'use client'

import { useId, useMemo, useRef, useState } from 'react'
import type { BatSpeedPlayerOption } from '@/components/MlbDeepDives'
import { InfoButton } from '@/components/InfoButton'
import { HelpLink } from '@/components/HelpLink'
import { headshotUrl as playerHeadshotUrl } from '@/lib/mlb-assets'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'

const ORANGE = '#FF5722'
const NEUTRAL = '#f0efec'
const AXIS_LINE = 'rgba(26,26,26,0.12)'
const MIN_SAMPLE = 5 // minimum batted balls to be "qualified" for the radar/leaderboard — same "don't rank noise" bar used elsewhere in this app

function mixHex(from: string, to: string, t: number): string {
  const f = [1, 3, 5].map(i => parseInt(from.slice(i, i + 2), 16))
  const s = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16))
  const mixed = f.map((v, i) => Math.round(v + (s[i] - v) * t))
  return `#${mixed.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Sequential single-hue scale (neutral -> orange) for "how productive is
// this dot" — one hue, light to dark, per the dataviz skill's
// sequential-magnitude rule. Same NEUTRAL->hue construction as
// sequentialRedColor in MlbDeepDives.tsx, just keyed to this section's
// orange accent instead of red.
function sequentialOrangeColor(t: number): string {
  return mixHex(NEUTRAL, ORANGE, Math.max(0, Math.min(1, t)))
}

type RadarAxis = { key: string; label: string; pct: number; raw: string }

function percentileRank(value: number, all: number[], higherIsBetter = true): number {
  if (all.length <= 1) return 100
  let below = 0, equal = 0
  for (const v of all) {
    if (higherIsBetter ? v < value : v > value) below++
    else if (v === value) equal++
  }
  return Math.round(((below + equal / 2) / all.length) * 100)
}

function buildAxes(p: BatSpeedPlayerOption, cohort: BatSpeedPlayerOption[]): RadarAxis[] {
  const batSpeed = p.profile.avgBatSpeed
  const xwoba = p.profile.avgXwoba
  const woba = p.profile.avgWoba
  const missDist = p.profile.missSeason.avgMissDistanceIn
  const sample = p.profile.battedBalls

  // rawValue strings are deliberately short (no unit suffix repeating what
  // the row's own label already says) — SavantPercentileBar's raw-value
  // column is a fixed 42px, sized for the site's existing convention
  // ("91.4 mph", ".443", "20.1%"), not a sentence; a longer string just
  // wraps and collides with the percentile chip next to it.
  return [
    { key: 'batSpeed', label: 'Bat Speed', pct: batSpeed !== null ? percentileRank(batSpeed, cohort.map(c => c.profile.avgBatSpeed ?? 0)) : 0, raw: batSpeed !== null ? `${batSpeed} mph` : '—' },
    { key: 'quality', label: 'Contact Quality', pct: xwoba !== null ? percentileRank(xwoba, cohort.map(c => c.profile.avgXwoba ?? 0)) : 0, raw: xwoba !== null ? xwoba.toFixed(3).replace(/^0/, '') : '—' },
    { key: 'production', label: 'Production', pct: woba !== null ? percentileRank(woba, cohort.map(c => c.profile.avgWoba ?? 0)) : 0, raw: woba !== null ? woba.toFixed(3).replace(/^0/, '') : '—' },
    { key: 'precision', label: 'Miss Precision', pct: missDist !== null ? percentileRank(missDist, cohort.map(c => c.profile.missSeason.avgMissDistanceIn ?? 99), false) : 0, raw: missDist !== null ? `${missDist}″` : '—' },
    { key: 'sample', label: 'Sample', pct: percentileRank(sample, cohort.map(c => c.profile.battedBalls)), raw: `${sample}` },
  ]
}

function compositeScore(axes: RadarAxis[]): number {
  return Math.round(axes.reduce((s, a) => s + a.pct, 0) / axes.length)
}

const AXIS_INFO: Record<string, string> = {
  batSpeed: 'Average bat speed (mph) on competitive swings, ranked against every other qualified player in this pool. Raw power — doesn’t say anything about whether that speed is turning into results.',
  quality: 'Average expected wOBA (xwOBA) on batted balls — what his exit velocity and launch angle say the outcome SHOULD have been, physics only, no luck or defense involved.',
  production: 'Average actual wOBA on batted balls — what really happened. Compared against Contact Quality, the gap between the two is the "loud outs" story: swinging hard and well but not getting rewarded (or the opposite).',
  precision: 'How close to the bat’s sweet spot he is on his swings and misses (lower average miss distance = higher percentile here). A precision read, not a power one — someone can miss slowly and precisely, or fast and wildly.',
  sample: 'How many batted balls this read is built on. A big shape built on 15 batted balls is a much noisier signal than one built on 150 — this axis is a reliability check on the other four, not a skill.',
}

function AxisInfoButton({ axisKey }: { axisKey: string }) {
  const body = AXIS_INFO[axisKey]
  if (!body) return null
  return <InfoButton title={axisKey.charAt(0).toUpperCase() + axisKey.slice(1)} align="left">{body}</InfoButton>
}

// ── "Does bat speed predict power?" ───────────────────────────────────────
//
// The honest way to test this: correlate bat speed against real outcomes
// (SLG, xSLG) — NOT against this section's own composite score, which
// already has bat speed baked into it as one of its five axes (that would
// be circular). And critically: only across the RANDOM half of the pool.
// The other half was pulled from the home-run leaderboard specifically
// BECAUSE those hitters hit for power — correlating bat speed against
// power using a pool that's half "people selected for hitting home runs"
// would inflate the read and answer a different question ("do power
// hitters who also happen to swing hard swing hard" isn't interesting).
// Restricting to the unbiased random sample is a real, if small, test of
// whether raw bat speed predicts power among batters who weren't picked
// for their power in the first place.

function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? null : num / den
}

function describeR(r: number): string {
  const abs = Math.abs(r)
  if (abs < 0.2) return 'negligible'
  if (abs < 0.4) return 'weak'
  if (abs < 0.6) return 'moderate'
  if (abs < 0.8) return 'strong'
  return 'very strong'
}

function parseStat(s: string | undefined): number | null {
  if (!s || s === '—') return null
  const v = parseFloat(s)
  return Number.isNaN(v) ? null : v
}

type CorrTest = { key: string; label: string; r: number | null; n: number }

function BatSpeedVsPowerPanel({ players }: { players: BatSpeedPlayerOption[] }) {
  const unbiased = useMemo(
    () => players.filter(p => p.source === 'random' && p.profile.avgBatSpeed !== null && p.seasonStats !== null),
    [players]
  )

  const batSpeeds = unbiased.map(p => p.profile.avgBatSpeed as number)
  const slgs = unbiased.map(p => parseStat(p.seasonStats?.slg) ?? 0)
  const xbh = unbiased.map(p => (p.seasonStats?.doubles ?? 0) + (p.seasonStats?.triples ?? 0) + (p.seasonStats?.home_runs ?? 0))
  const doubles = unbiased.map(p => p.seasonStats?.doubles ?? 0)
  const hrs = unbiased.map(p => p.seasonStats?.home_runs ?? 0)

  const withXslg = unbiased.filter(p => p.profile.avgXslg !== null)
  const batSpeedsXslg = withXslg.map(p => p.profile.avgBatSpeed as number)
  const xslgs = withXslg.map(p => p.profile.avgXslg as number)
  const slgsForXslg = withXslg.map(p => parseStat(p.seasonStats?.slg) ?? 0)

  const withEv = unbiased.filter(p => p.profile.avgExitVelo !== null)
  const batSpeedsEv = withEv.map(p => p.profile.avgBatSpeed as number)
  const evs = withEv.map(p => p.profile.avgExitVelo as number)

  const rSlg = pearsonR(batSpeeds, slgs)
  const rXslg = pearsonR(batSpeedsXslg, xslgs)
  // Reference point: xSLG and SLG are already two DIRECTLY related quantities
  // (one predicts the other by design) — computing their own r on this same
  // cohort gives an honest "here's what a real relationship looks like" yardstick
  // to hold the bat-speed r-values up against, rather than judging them in a vacuum.
  const rXslgSlg = pearsonR(xslgs, slgsForXslg)

  const moreTests: CorrTest[] = [
    { key: 'xbh', label: 'Bat speed vs. extra-base hits (2B+3B+HR)', r: pearsonR(batSpeeds, xbh), n: unbiased.length },
    { key: 'doubles', label: 'Bat speed vs. doubles', r: pearsonR(batSpeeds, doubles), n: unbiased.length },
    { key: 'hr', label: 'Bat speed vs. home runs', r: pearsonR(batSpeeds, hrs), n: unbiased.length },
    { key: 'ev', label: 'Bat speed vs. exit velocity', r: pearsonR(batSpeedsEv, evs), n: withEv.length },
  ]

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-[15px] font-bold text-[#1A1A1A]">Does bat speed actually predict power?</div>
        <HelpLink stat="xslg" />
        <InfoButton title="Methodology" align="left">
          Correlated only across the <span className="font-bold">randomly-sampled</span> half of this pool — the other
          half was pulled from the home-run leaderboard specifically because those hitters hit for power, so including
          them would inflate the read (correlating bat speed against power using people selected for their power
          answers a different, circular question). n = {unbiased.length} is small; read the r-values as directional,
          not proof. The &quot;xSLG vs. SLG&quot; reference is the one test here that does NOT involve bat speed at
          all — it&apos;s a control, showing how strong r looks for two quantities that really are directly related.
        </InfoButton>
      </div>
      <div className="text-[11px] text-[#8A8577] mb-3 max-w-[680px]">
        Bat speed alone doesn&apos;t hit the ball — launch angle, barrel accuracy, and squared-up contact matter just as
        much. This is a direct test of one specific claim: <span className="font-bold text-[#1A1A1A]">if swinging
        harder reliably turns into more power, the hardest swingers in this group should also be the best sluggers</span>.
        If that were true, the dots below would trend cleanly up-and-to-the-right and the correlation (r) would sit
        close to <span className="font-bold text-[#1A1A1A]">+1</span>. An r near <span className="font-bold text-[#1A1A1A]">0</span> would
        mean bat speed tells you almost nothing about who ends up with power numbers.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-white border border-[#E8E4DC] p-3">
          <div className="text-[9px] uppercase tracking-wide text-[#8A8577] mb-1">Bat speed vs. actual SLG</div>
          {rSlg !== null ? (
            <>
              <div className="text-[22px] font-black text-[#1A1A1A] leading-none">r = {rSlg.toFixed(2)}</div>
              <div className="text-[10px] text-[#8A8577] mt-1">
                {describeR(rSlg)} {rSlg >= 0 ? 'positive' : 'negative'} correlation across {unbiased.length} randomly-sampled batters
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[#8A8577]">Not enough unbiased players yet to compute this.</div>
          )}
        </div>
        <div className="rounded-lg bg-white border border-[#E8E4DC] p-3">
          <div className="text-[9px] uppercase tracking-wide text-[#8A8577] mb-1">Bat speed vs. expected SLG (xSLG)</div>
          {rXslg !== null ? (
            <>
              <div className="text-[22px] font-black text-[#1A1A1A] leading-none">r = {rXslg.toFixed(2)}</div>
              <div className="text-[10px] text-[#8A8577] mt-1">
                {describeR(rXslg)} {rXslg >= 0 ? 'positive' : 'negative'} correlation — physics only, no defense or luck
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[#8A8577]">Not enough unbiased players yet to compute this.</div>
          )}
        </div>
      </div>

      {/* Reference / control — the one row here that isn't about bat speed at
          all, included so the r-values above have something real to be
          measured against instead of floating in the abstract. */}
      {rXslgSlg !== null && (
        <div className="rounded-lg bg-white border-2 border-dashed border-[#DEDACE] p-3 mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[#8A8577] mb-0.5">For scale (not about bat speed) — xSLG vs. actual SLG</div>
            <div className="text-[10px] text-[#8A8577]">Two quantities that ARE directly related by design — how strong does that look?</div>
          </div>
          <div className="text-[20px] font-black text-[#1A1A1A] shrink-0">r = {rXslgSlg.toFixed(2)}</div>
        </div>
      )}

      {rSlg !== null && (
        <div className="text-[10.5px] text-[#1A1A1A] mb-4 bg-white border border-[#E8E4DC] rounded-lg p-3">
          <span className="font-bold">What this shows: </span>
          {Math.abs(rSlg) < 0.4
            ? `r = ${rSlg.toFixed(2)} is nowhere near the +1 a "bat speed = power" claim would need — it's ${describeR(rSlg)}${rXslgSlg !== null ? `, versus r = ${rXslgSlg.toFixed(2)} for a pair of stats that really are directly linked (xSLG and SLG)` : ''}. Swing speed alone explains only a small slice of who ends up slugging. Two hitters can share the same bat speed and post very different SLGs, because the rest of the gap comes from launch angle, barrel accuracy, and squared-up contact — none of which "how fast the bat moves" measures. Bat speed is real and worth tracking, but on its own it's a weak stand-in for "is this a true power hitter."`
            : `r = ${rSlg.toFixed(2)} is a real, ${describeR(rSlg)} relationship — closer to the "harder swing, more power" story than not${rXslgSlg !== null ? `, though still short of the r = ${rXslgSlg.toFixed(2)} a directly-linked pair like xSLG and SLG shows` : ''}. Plenty of individual hitters break the pattern in both directions: some swing hard and don't slug, some swing modestly and do. Bat speed is a real signal here, just not a guarantee for any one player.`}
        </div>
      )}

      {/* Same test, more outcomes — extra-base hits, doubles, home runs, and
          raw exit velocity, so "how much impact bat speed has" isn't judged
          off SLG alone. */}
      <div className="rounded-lg bg-white border border-[#E8E4DC] overflow-hidden mb-4">
        <table className="w-full text-[10.5px] border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC]">
              <th className="py-1.5 pl-3 pr-2 font-bold">Bat speed vs.</th>
              <th className="py-1.5 pr-2 font-bold text-right">r</th>
              <th className="py-1.5 pr-3 font-bold text-right">Strength</th>
            </tr>
          </thead>
          <tbody>
            {moreTests.map(t => (
              <tr key={t.key} className="border-b border-[#F0EFEC] last:border-0">
                <td className="py-1.5 pl-3 pr-2 text-[#1A1A1A]">{t.label.replace('Bat speed vs. ', '')}</td>
                <td className="py-1.5 pr-2 text-right font-bold tabular-nums text-[#1A1A1A]">{t.r !== null ? t.r.toFixed(2) : '—'}</td>
                <td className="py-1.5 pr-3 text-right text-[#8A8577]">{t.r !== null ? describeR(t.r) : `n=${t.n} too small`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC]">
              <th className="py-1.5 pr-2 font-bold">Player</th>
              <th className="py-1.5 pr-2 font-bold">Pool</th>
              <th className="py-1.5 pr-2 font-bold text-right">Bat speed</th>
              <th className="py-1.5 pr-2 font-bold text-right">EV</th>
              <th className="py-1.5 pr-2 font-bold text-right">HR</th>
              <th className="py-1.5 pr-2 font-bold text-right">2B</th>
              <th className="py-1.5 pr-2 font-bold text-right">3B</th>
              <th className="py-1.5 pr-2 font-bold text-right">SLG</th>
              <th className="py-1.5 font-bold text-right">xSLG</th>
            </tr>
          </thead>
          <tbody>
            {[...players].sort((a, b) => (b.profile.avgBatSpeed ?? 0) - (a.profile.avgBatSpeed ?? 0)).map(p => (
              <tr key={p.id} className="border-b border-[#F0EFEC]">
                <td className="py-1.5 pr-2 text-[#1A1A1A] font-medium whitespace-nowrap">{p.name} <span className="text-[#8A8577] font-normal">{p.teamAbbr}</span></td>
                <td className="py-1.5 pr-2 text-[#8A8577]">{p.source === 'random' ? 'Random' : 'HR leader'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.profile.avgBatSpeed ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.profile.avgExitVelo ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.seasonStats?.home_runs ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.seasonStats?.doubles ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.seasonStats?.triples ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{p.seasonStats?.slg ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-[#1A1A1A]">{p.profile.avgXslg?.toFixed(3) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[9px] text-[#8A8577] mt-2">
        HR/2B/3B/SLG are real season totals (MLB Stats API); EV (exit velocity) and xSLG are averaged per batted ball
        from Statcast (exit velocity and launch angle alone for xSLG — physics only, no luck or defense).
        &quot;Pool&quot; shows which selection each player came from — only &quot;Random&quot; rows feed the r-values above.
      </div>
    </div>
  )
}

// ── Radar chart (generic 5-axis polygon, plain SVG — same construction as AbsRadarSection's) ──

function RadarChart({ axes, color, size = 220 }: { axes: RadarAxis[]; color: string; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size * 0.32
  const n = axes.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const polar = (rFrac: number, i: number): [number, number] => [cx + rFrac * R * Math.cos(angle(i)), cy + rFrac * R * Math.sin(angle(i))]
  const poly = (vals: number[]) => vals.map((pct, i) => polar(pct / 100, i).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="overflow-visible">
      {[25, 50, 75, 100].map(level => (
        <polygon key={level} points={poly(axes.map(() => level))} fill="none" stroke={AXIS_LINE} strokeWidth="1" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = polar(1, i)
        return <line key={a.key} x1={cx} y1={cy} x2={x} y2={y} stroke={AXIS_LINE} strokeWidth="1" />
      })}
      <polygon points={poly(axes.map(a => a.pct))} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = polar(a.pct / 100, i)
        return <circle key={a.key} cx={x} cy={y} r={3} fill={color} />
      })}
      {axes.map((a, i) => {
        const [lx, ly] = polar(1.34, i)
        const cos = Math.cos(angle(i)), sin = Math.sin(angle(i))
        return (
          <text
            key={a.key} x={lx} y={ly} fontSize="9" fontWeight="700" fill="#57534E"
            textAnchor={Math.abs(cos) < 0.25 ? 'middle' : cos > 0 ? 'start' : 'end'}
            dominantBaseline={Math.abs(sin) < 0.25 ? 'middle' : sin > 0 ? 'hanging' : 'alphabetic'}
          >
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}

function PlayerRadarCard({ player, cohort }: { player: BatSpeedPlayerOption; cohort: BatSpeedPlayerOption[] }) {
  const axes = useMemo(() => buildAxes(player, cohort), [player, cohort])
  const score = compositeScore(axes)

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 flex flex-col items-center">
      <div className="flex items-center gap-2.5 mb-2 self-stretch">
        <img src={playerHeadshotUrl(player.id, 80)} alt="" className="w-11 h-11 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ORANGE }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-[#1A1A1A] truncate">{player.name}</div>
          <div className="text-[10px] text-[#8A8577]">{player.teamAbbr}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1">
            <div className="text-[20px] font-black leading-none" style={{ color: ORANGE }}>{score}</div>
            <InfoButton title="All-round score" align="right">
              The average of all five percentiles below — bat speed, contact quality, production, miss precision, and
              sample size — each ranked against every other player in this pool. 100 would mean 100th percentile on
              every axis; 50 is dead average across the board.
            </InfoButton>
          </div>
          <div className="text-[7.5px] uppercase tracking-wide text-[#8A8577] mt-0.5">All-round score</div>
        </div>
      </div>
      <RadarChart axes={axes} color={ORANGE} size={216} />

      {/* Savant-style percentile bars — same shared component the player pages
          use, so a percentile means the same thing (and looks the same) here
          as everywhere else on the site, not a bespoke "(68th pct)" of its own. */}
      <div className="w-full mt-3">
        <SavantPercentileBar
          rows={axes.map(a => ({ label: a.label, percentile: a.pct, rawValue: a.raw, higherIsBetter: true }))}
          compact
          rounded
        />
      </div>
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-center mt-2">
        {axes.map(a => (
          <span key={a.key} className="text-[8.5px] text-[#8A8577] flex items-center gap-1">{a.label}<AxisInfoButton axisKey={a.key} /></span>
        ))}
      </div>
    </div>
  )
}

// ── Player picker (compare any qualified player) ─────────────────────────

function PlayerPicker({ players, value, onChange }: { players: BatSpeedPlayerOption[]; value: number | null; onChange: (id: number | null) => void }) {
  const byName = [...players].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="text-[11px] border border-[#DEDACE] rounded-md px-2 py-1.5 text-[#1A1A1A] bg-white max-w-[220px]"
    >
      <option value="">Compare a player…</option>
      {byName.map(p => (
        <option key={p.id} value={p.id}>{p.name} ({p.teamAbbr})</option>
      ))}
    </select>
  )
}

// ── "Neural style" scatter — headshot dots, same construction as the ABS
// challenge efficiency scatter (PlayerScatter in MlbDeepDives.tsx) ───────

type ScatterHover = { player: BatSpeedPlayerOption; left: number; top: number }
export type ScatterYMetric = 'loudOuts' | 'slg'

function scatterY(p: BatSpeedPlayerOption, metric: ScatterYMetric): number | null {
  if (metric === 'loudOuts') return p.profile.xwobaMinusWoba
  const slg = p.seasonStats?.slg
  if (!slg || slg === '—') return null
  const v = parseFloat(slg)
  return Number.isNaN(v) ? null : v
}

export function BatSpeedScatter({ players, width, height, detailed, yMetric = 'loudOuts' }: { players: BatSpeedPlayerOption[]; width: number; height: number; detailed?: boolean; yMetric?: ScatterYMetric }) {
  // This chart mounts more than once at a time (the compact card stays
  // mounted behind its own "Expand" modal, both rendering the same
  // players with the same default yMetric) — SVG element ids are global
  // to the whole document, so two instances sharing a clipPath id fight
  // over it and one instance's <image> ends up clipped by the OTHER
  // instance's (wrongly-sized) clip circle, silently hiding every
  // headshot. useId() gives each mounted instance its own id namespace so
  // that can't happen, confirmed as the actual cause (headshots vanished
  // specifically in whichever mode the compact card happened to share).
  const uid = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<ScatterHover | null>(null)
  const PAD_L = 36, PAD_R = 16, PAD_T = detailed ? 22 : 16, PAD_B = detailed ? 42 : 34

  const pts = players.filter(p => p.profile.avgBatSpeed !== null && scatterY(p, yMetric) !== null)

  if (pts.length === 0) {
    return <div className="text-[11px] text-[#8A8577] py-8 text-center">No bat-tracking data yet.</div>
  }

  const xs = pts.map(p => p.profile.avgBatSpeed as number)
  const ys = pts.map(p => scatterY(p, yMetric) as number)
  const xMin = Math.min(...xs) - 1, xMax = Math.max(...xs) + 1

  // "Loud outs" is naturally centered on 0 (xwOBA - wOBA can go either way,
  // and 0 IS the meaningful reference point). SLG has no such center — a
  // plain min/max scale like the x-axis reads better than forcing a
  // "0 SLG" baseline nobody in the pool is anywhere near.
  const sx = (v: number) => PAD_L + ((v - xMin) / (xMax - xMin)) * (width - PAD_L - PAD_R)
  let sy: (v: number) => number
  let benchmarkY: number | null = null
  let yTicks: number[]
  if (yMetric === 'loudOuts') {
    const yAbsMax = Math.max(0.02, ...ys.map(Math.abs)) * 1.2
    sy = v => PAD_T + (height - PAD_T - PAD_B) / 2 - (v / yAbsMax) * ((height - PAD_T - PAD_B) / 2 - 4)
    benchmarkY = 0
    yTicks = [-yAbsMax * 0.8, 0, yAbsMax * 0.8]
  } else {
    const yMin = Math.min(...ys) - 0.03, yMax = Math.max(...ys) + 0.03
    sy = v => height - PAD_B - ((v - yMin) / (yMax - yMin)) * (height - PAD_T - PAD_B)
    benchmarkY = ys.reduce((a, b) => a + b, 0) / ys.length // pool-average SLG as the reference line instead of a meaningless zero
    yTicks = [yMin, (yMin + yMax) / 2, yMax]
  }
  const xTicks = [xMin, (xMin + xMax) / 2, xMax]

  const sorted = [...pts].sort((a, b) => (scatterY(b, yMetric) ?? 0) - (scatterY(a, yMetric) ?? 0))
  const emphasized = new Set([...sorted.slice(0, 3), ...sorted.slice(-3)].map(p => p.id))

  // Color each dot by production (SLG, falling back to xwOBA for the rare
  // player with no qualifying season SLG) instead of a flat orange fill —
  // darker = more production, so the scatter reads two variables (bat speed
  // on x, the chosen y-metric, AND production as color) instead of one.
  // Ranked only against the dots actually on screen, not the full site
  // cohort, since that's the comparison a reader is actually making here.
  const productionOf = (p: BatSpeedPlayerOption): number | null => {
    const slg = parseStat(p.seasonStats?.slg)
    if (slg !== null) return slg
    return p.profile.avgXwoba
  }
  const productionValues = pts.map(productionOf).filter((v): v is number => v !== null)
  const dotColor = (p: BatSpeedPlayerOption): string => {
    const v = productionOf(p)
    if (v === null || productionValues.length < 2) return ORANGE
    return sequentialOrangeColor(percentileRank(v, productionValues) / 100)
  }

  const trackMouse = (player: BatSpeedPlayerOption) => (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ player, left: e.clientX - rect.left, top: e.clientY - rect.top })
  }

  const containerRect = containerRef.current?.getBoundingClientRect()
  const CARD_W = 200
  const cardLeft = hover ? Math.min(hover.left + 12, (containerRect?.width ?? width) - CARD_W - 4) : 0
  const cardTop = hover ? Math.max(hover.top - 60, 4) : 0

  return (
    <div ref={containerRef} className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* y-axis ticks — real values, not just a direction arrow */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L - 3} y1={sy(v)} x2={PAD_L} y2={sy(v)} stroke="rgba(26,26,26,0.3)" strokeWidth="1" />
            <text x={PAD_L - 6} y={sy(v) + 3} fontSize="7.5" textAnchor="end" fill="rgba(26,26,26,0.45)">
              {yMetric === 'loudOuts' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : v.toFixed(3)}
            </text>
          </g>
        ))}
        {/* x-axis ticks */}
        {xTicks.map((v, i) => (
          <g key={i}>
            <line x1={sx(v)} y1={height - PAD_B} x2={sx(v)} y2={height - PAD_B + 3} stroke="rgba(26,26,26,0.3)" strokeWidth="1" />
            <text x={sx(v)} y={height - PAD_B + 13} fontSize="7.5" textAnchor="middle" fill="rgba(26,26,26,0.45)">{v.toFixed(0)}</text>
          </g>
        ))}

        {benchmarkY !== null && (
          <>
            <line x1={PAD_L} y1={sy(benchmarkY)} x2={width - PAD_R} y2={sy(benchmarkY)} stroke="rgba(26,26,26,0.15)" strokeDasharray={yMetric === 'slg' ? '3,2' : undefined} />
            {yMetric === 'loudOuts' ? (
              <>
                <text x={width - PAD_R} y={sy(0) - 6} fontSize="8" textAnchor="end" fill="rgba(26,26,26,0.4)">loud outs ↑</text>
                <text x={width - PAD_R} y={sy(0) + 14} fontSize="8" textAnchor="end" fill="rgba(26,26,26,0.4)">outrunning contact ↓</text>
              </>
            ) : (
              <text x={width - PAD_R} y={sy(benchmarkY) - 5} fontSize="7.5" textAnchor="end" fill="rgba(26,26,26,0.45)">pool avg SLG {benchmarkY.toFixed(3)}</text>
            )}
          </>
        )}
        <text x={(PAD_L + width - PAD_R) / 2} y={height - 4} fontSize="8" textAnchor="middle" fill="rgba(26,26,26,0.4)">bat speed (mph) →</text>

        {pts.map(p => {
          const x = sx(p.profile.avgBatSpeed as number)
          const y = sy(scatterY(p, yMetric) as number)
          const isEmphasized = emphasized.has(p.id)
          const isHovered = hover?.player.id === p.id
          const r = detailed ? (isEmphasized ? 11 : 8) : (isEmphasized ? 8 : 5.5)
          const clipId = `batspeed-clip-${uid}-${p.id}`
          const color = dotColor(p)
          return (
            <g key={p.id} onMouseEnter={trackMouse(p)} onMouseMove={trackMouse(p)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <clipPath id={clipId}><circle cx={x} cy={y} r={r} /></clipPath>
              <circle cx={x} cy={y} r={r + 1} fill={color} opacity={isEmphasized ? 1 : 0.85} />
              <image href={playerHeadshotUrl(p.id, 80)} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
              <circle cx={x} cy={y} r={r} fill="none" stroke="#fff" strokeWidth={isEmphasized ? 1.5 : 1} />
              {isHovered && <circle cx={x} cy={y} r={r + 2.5} fill="none" stroke={ORANGE} strokeWidth="1.5" />}
              {detailed && (
                <text x={x} y={y + r + 9} textAnchor="middle" fontSize="8" fontWeight="700" fill="#8A8577">
                  {yMetric === 'loudOuts' ? (p.profile.avgBatSpeed as number).toFixed(0) : (scatterY(p, yMetric) as number).toFixed(3)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && (
        <div className="absolute z-10 pointer-events-none bg-white rounded-lg border border-[#E8E4DC] shadow-lg overflow-hidden" style={{ left: cardLeft, top: cardTop, width: CARD_W }}>
          <div className="flex items-center gap-2 p-2 bg-[#FAF8F3]">
            <img src={playerHeadshotUrl(hover.player.id, 80)} alt="" className="w-9 h-9 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ORANGE }} />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#1A1A1A] truncate">{hover.player.name}</div>
              <div className="text-[9px] text-[#8A8577]">{hover.player.teamAbbr}{hover.player.source === 'hrLeader' ? ' · HR leader' : ''}</div>
            </div>
          </div>
          <div className="px-2 py-1.5 border-t border-[#E8E4DC] text-[10px] text-[#1A1A1A]">
            <div><span className="font-bold">{hover.player.profile.avgBatSpeed}</span> mph avg bat speed</div>
            {yMetric === 'loudOuts' ? (
              <div className="mt-0.5">
                xwOBA − wOBA: <span className="font-bold" style={{ color: (hover.player.profile.xwobaMinusWoba ?? 0) >= 0 ? '#d03b3b' : '#0ca30c' }}>
                  {(hover.player.profile.xwobaMinusWoba ?? 0) >= 0 ? '+' : ''}{(hover.player.profile.xwobaMinusWoba ?? 0).toFixed(3)}
                </span>
              </div>
            ) : (
              <div className="mt-0.5">SLG: <span className="font-bold">{hover.player.seasonStats?.slg ?? '—'}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Full sortable leaderboard ─────────────────────────────────────────────

type SortKey = 'score' | 'batSpeed' | 'xwoba' | 'woba' | 'missDist' | 'sample'
const SORT_LABEL: Record<SortKey, string> = {
  score: 'Score', batSpeed: 'Bat speed', xwoba: 'xwOBA', woba: 'wOBA', missDist: 'Avg miss', sample: 'Batted balls',
}

function FullLeaderboard({ players }: { players: BatSpeedPlayerOption[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => {
    const withScore = players.map(p => ({ p, score: compositeScore(buildAxes(p, players)) }))
    const sorted = [...withScore].sort((a, b) => {
      switch (sortKey) {
        case 'score': return b.score - a.score
        case 'batSpeed': return (b.p.profile.avgBatSpeed ?? 0) - (a.p.profile.avgBatSpeed ?? 0)
        case 'xwoba': return (b.p.profile.avgXwoba ?? 0) - (a.p.profile.avgXwoba ?? 0)
        case 'woba': return (b.p.profile.avgWoba ?? 0) - (a.p.profile.avgWoba ?? 0)
        case 'missDist': return (a.p.profile.missSeason.avgMissDistanceIn ?? 99) - (b.p.profile.missSeason.avgMissDistanceIn ?? 99)
        case 'sample': return b.p.profile.battedBalls - a.p.profile.battedBalls
      }
    })
    return sorted
  }, [players, sortKey])

  const shown = showAll ? rows : rows.slice(0, 25)

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-white p-4">
      <div className="mb-3">
        <div className="flex items-center gap-1.5">
          <div className="text-[13.5px] font-bold text-[#1A1A1A]">Comprehensive leaderboard</div>
          <HelpLink stat="percentile-rank" />
        </div>
        <div className="text-[10px] text-[#8A8577]">Every qualified batter (min {MIN_SAMPLE} batted balls), ranked by all-round score</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC]">
              <th className="py-1.5 pr-2 font-bold">#</th>
              <th className="py-1.5 pr-2 font-bold">Player</th>
              {(['score', 'batSpeed', 'xwoba', 'woba', 'missDist', 'sample'] as SortKey[]).map(k => (
                <th key={k} className="py-1.5 pr-2 font-bold text-right cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => setSortKey(k)}>
                  {SORT_LABEL[k]}{sortKey === k ? ' ▾' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.p.id} className="border-b border-[#F0EFEC] hover:bg-[#FAF8F3]">
                <td className="py-1.5 pr-2 text-[#8A8577] tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5 min-w-[140px]">
                    <img src={playerHeadshotUrl(r.p.id, 40)} alt="" className="w-5 h-5 rounded-full object-cover border shrink-0" style={{ borderColor: ORANGE }} />
                    <span className="truncate text-[#1A1A1A] font-medium">{r.p.name}</span>
                    <span className="text-[#8A8577] shrink-0">{r.p.teamAbbr}</span>
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-right font-bold tabular-nums" style={{ color: ORANGE }}>{r.score}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.profile.avgBatSpeed ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.profile.avgXwoba?.toFixed(3) ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.profile.avgWoba?.toFixed(3) ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.profile.missSeason.avgMissDistanceIn !== null ? `${r.p.profile.missSeason.avgMissDistanceIn}″` : '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[#1A1A1A]">{r.p.profile.battedBalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showAll && rows.length > 25 && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-[10px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
          Show all {rows.length} players ↓
        </button>
      )}
    </div>
  )
}

// ── Top-level section ──────────────────────────────────────────────────────

const NEURAL_Y_METRICS: [ScatterYMetric, string][] = [['loudOuts', 'Contact quality (xwOBA − wOBA)'], ['slg', 'Actual power (SLG)']]

export default function BatSpeedRadarSection({ players }: { players: BatSpeedPlayerOption[] }) {
  const [compareId, setCompareId] = useState<number | null>(null)
  const [neuralY, setNeuralY] = useState<ScatterYMetric>('loudOuts')

  const qualified = useMemo(() => players.filter(p => p.profile.battedBalls >= MIN_SAMPLE), [players])

  const topPlayer = useMemo(() => {
    if (qualified.length === 0) return null
    return [...qualified].sort((a, b) => compositeScore(buildAxes(b, qualified)) - compositeScore(buildAxes(a, qualified)))[0]
  }, [qualified])

  const comparePlayer = compareId ? qualified.find(p => p.id === compareId) ?? null : null

  if (qualified.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-white p-6 text-center text-[12px] text-[#8A8577]">
        Not enough batted-ball data yet — the radar needs at least {MIN_SAMPLE} batted balls per player to rank fairly.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <div className="text-[17px] font-bold text-[#1A1A1A]">Bat speed vs. production, all-round</div>
          <HelpLink stat="percentile-rank" />
        </div>
        <div className="text-[12px] text-[#8A8577] mt-1 max-w-[720px]">
          A five-axis score blending raw bat speed, contact quality (xwOBA), actual production (wOBA), how close to
          the sweet spot a player&apos;s misses are, and sample size — each axis ranked as a percentile against every
          other player in this pool (min {MIN_SAMPLE} batted balls).
        </div>
      </div>

      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Neural view</div>
            <HelpLink stat="bat-speed" />
          </div>
          <div className="flex items-center gap-1.5">
            {NEURAL_Y_METRICS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setNeuralY(key)}
                className={`text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${neuralY === key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1 mb-3">
          <div className="text-[10px] text-[#8A8577]">
            {neuralY === 'loudOuts'
              ? 'Bat speed vs. contact-quality/luck — every qualified player, hover for detail'
              : 'Bat speed vs. real slugging (SLG) — every qualified player, hover for detail'}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-[#8A8577]">dot color = production (SLG)</span>
            <span className="flex items-center gap-0.5">
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <span key={t} className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: sequentialOrangeColor(t) }} />
              ))}
            </span>
            <span className="text-[8.5px] text-[#8A8577]">low → high</span>
          </div>
        </div>
        <BatSpeedScatter players={qualified} width={760} height={380} detailed yMetric={neuralY} />
      </div>

      <BatSpeedVsPowerPanel players={qualified} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topPlayer && <PlayerRadarCard player={topPlayer} cohort={qualified} />}

        <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <div className="text-[13px] font-bold text-[#1A1A1A]">Compare any player</div>
              <div className="text-[10px] text-[#8A8577]">Pick a qualified batter to see their full radar</div>
            </div>
            <PlayerPicker players={qualified} value={compareId} onChange={setCompareId} />
          </div>
          {comparePlayer ? (
            <PlayerRadarCard player={comparePlayer} cohort={qualified} />
          ) : (
            <div className="text-[11px] text-[#8A8577] py-10 text-center">Select a player above to see their radar.</div>
          )}
        </div>
      </div>

      <FullLeaderboard players={qualified} />
    </div>
  )
}
