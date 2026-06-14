'use client'

import { useState, useEffect, useRef } from 'react'
import { playerHeadshotUrl, teamLogoUrl, shortName } from '@/lib/mlb'
import type { LineupBatter } from '@/lib/lineups'
import type {
  BatterSeasonStats,
  BatterStatcast,
  BatterSplits,
  BatterVsPitcher,
} from '@/lib/batter-stats'

// =====================================================
// TYPES
// =====================================================

interface BattingTabContentProps {
  awayTeamName: string
  homeTeamName: string
  awayTeamId: number
  homeTeamId: number
  awayAbbr: string
  homeAbbr: string
  awayBatters: LineupBatter[]
  homeBatters: LineupBatter[]
  awayPitcherId?: number | null
  homePitcherId?: number | null
  isPro: boolean
  lineupsConfirmed?: boolean
}

interface BatterDetail {
  batter: LineupBatter
  teamName: string
  teamId: number
  opposingPitcherId: number | null
}

// =====================================================
// HELPERS
// =====================================================

function opsColor(ops: number): string {
  if (ops >= 0.900) return 'text-green-500'
  if (ops >= 0.800) return 'text-green-600'
  if (ops >= 0.700) return 'text-stone-700'
  if (ops >= 0.600) return 'text-orange-500'
  return 'text-red-500'
}

function statcastGrade(pct: number): string {
  if (pct >= 80) return 'text-green-500'
  if (pct >= 60) return 'text-green-600'
  if (pct <= 20) return 'text-red-500'
  if (pct <= 40) return 'text-orange-500'
  return 'text-stone-700'
}

function StatBox({
  label, value, color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  const bgColor =
    color === 'text-green-500' ? 'bg-green-50 border border-green-100' :
    color === 'text-green-600' ? 'bg-green-50 border border-green-100' :
    color === 'text-orange-500' ? 'bg-orange-50 border border-orange-100' :
    color === 'text-red-500'   ? 'bg-red-50 border border-red-100' :
    'bg-stone-50 border border-stone-100'

  return (
    <div className={`${bgColor} rounded-lg p-3 text-center`}>
      <div className={`text-base font-mono font-bold leading-none ${color ?? 'text-stone-900'}`}>
        {value}
      </div>
      <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1.5">
        {label}
      </div>
    </div>
  )
}

function SectionLabel({ title, pro }: { title: string; pro?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">
        § {title}
      </p>
      {pro && (
        <span className="text-[8px] font-mono font-bold text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
          ⊕ PRO
        </span>
      )}
    </div>
  )
}

// =====================================================
// CHARTS — direct Chart.js via useRef/useEffect
// =====================================================

function LineChart({ opsValues }: { opsValues: (number | null)[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const validValues = opsValues.filter(v => v !== null) as number[]
    if (validValues.length === 0) return

    let chartInstance: any = null

    import('chart.js/auto').then(({ default: Chart }) => {
      const ctx = canvasRef.current
      if (!ctx) return
      const existing = Chart.getChart(ctx)
      if (existing) existing.destroy()

      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['L30', 'L14', 'L7'],
          datasets: [{
            data: opsValues as any,
            borderColor: '#EA580C',
            backgroundColor: 'rgba(234,88,12,0.08)',
            borderWidth: 2,
            pointBackgroundColor: '#EA580C',
            pointRadius: 4,
            fill: true,
            tension: 0.3,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: Math.max(0, Math.min(...validValues) - 0.1),
              ticks: {
                font: { size: 10, family: 'monospace' },
                color: '#888',
                callback: (v: any) => Number(v).toFixed(3),
              },
              grid: { color: 'rgba(120,120,120,0.1)' },
            },
            x: {
              ticks: { font: { size: 10, family: 'monospace' }, color: '#888' },
              grid: { display: false },
            },
          },
        },
      })
    }).catch(err => console.error('LineChart import failed:', err))

    return () => { if (chartInstance) chartInstance.destroy() }
  }, [opsValues])

  return (
    <div style={{ position: 'relative', height: '140px', marginBottom: '16px' }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

function RadarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    console.log('RadarChart useEffect fired', { valuesLength: values.length, hasCanvas: !!canvasRef.current })
    if (!canvasRef.current || values.length === 0) return

    let chartInstance: any = null

    import('chart.js/auto').then(({ default: Chart }) => {
      const ctx = canvasRef.current
      if (!ctx) return
      const existing = Chart.getChart(ctx)
      if (existing) existing.destroy()

      console.log('Creating radar with values:', values)

      chartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: 'rgba(234, 88, 12, 0.12)',
            borderColor: '#EA580C',
            borderWidth: 1.5,
            pointBackgroundColor: '#EA580C',
            pointRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { display: false, stepSize: 25 },
              grid: { color: 'rgba(120,120,120,0.15)' },
              pointLabels: {
                font: { size: 10, family: 'monospace' },
                color: '#888',
                padding: 8,
              },
              angleLines: { color: 'rgba(120,120,120,0.15)' },
            },
          },
        },
      })
    }).catch(err => console.error('RadarChart import failed:', err))

    return () => { if (chartInstance) chartInstance.destroy() }
  }, [values, labels])

  return (
    <div style={{ position: 'relative', height: '240px', padding: '0 0 16px' }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

// =====================================================
// STATCAST CSV PARSER — runs client-side
// =====================================================

async function fetchStatcastClientSide(playerId: number): Promise<BatterStatcast | null> {
  const season = new Date().getFullYear()

  async function fetchSavantCSV(url: string): Promise<Record<string, string> | null> {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/csv,*/*' } })
      if (!res.ok) return null
      const text = await res.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const idIdx = headers.findIndex(h =>
        h === 'player_id' || h === 'playerid' || h === 'mlbam_id' || h === 'batter'
      )
      if (idIdx === -1) return null
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
        if (cells[idIdx] === String(playerId)) {
          return Object.fromEntries(headers.map((h, idx) => [h, cells[idx]]))
        }
      }
      return null
    } catch {
      return null
    }
  }

  const [expectedStats, evStats] = await Promise.all([
    fetchSavantCSV(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&position=&team=&min=10&csv=true`
    ),
    fetchSavantCSV(
      `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&position=&team=&min=10&csv=true`
    ),
  ])

  console.log('[Statcast] expectedStats keys:', expectedStats ? Object.keys(expectedStats) : 'null')
  console.log('[Statcast] evStats keys:', evStats ? Object.keys(evStats) : 'null')

  if (!expectedStats) return null

  const num = (obj: Record<string, string> | null, key: string): number | null => {
    if (!obj) return null
    const val = parseFloat(obj[key] ?? '')
    return isNaN(val) ? null : val
  }

  return {
  xba:               num(expectedStats, 'est_ba'),
  xslg:              num(expectedStats, 'est_slg'),
  xwoba:             num(expectedStats, 'est_woba'),
  barrel_pct:        num(evStats, 'brl_percent'),
  hard_hit_pct:      num(evStats, 'ev95percent'),        // % of balls hit 95mph+
  sweet_spot_pct:    num(evStats, 'anglesweetspotpercent'),
  avg_exit_velocity: num(evStats, 'avg_hit_speed'),
  max_exit_velocity: num(evStats, 'max_hit_speed'),
  sprint_speed:      null,
  k_pct:             null,
  bb_pct:            null,
}
}
// =====================================================
// BATTER DETAIL VIEW
// =====================================================

function BatterDetailView({
  detail, isPro, onBack,
  
}: {
  detail: BatterDetail
  isPro: boolean
  onBack: () => void
}) {
  const [seasonStats, setSeasonStats] = useState<BatterSeasonStats | null>(null)
  const [statcast, setStatcast]       = useState<BatterStatcast | null>(null)
  const [splits, setSplits]           = useState<BatterSplits | null>(null)
  const [vsPitcher, setVsPitcher]     = useState<BatterVsPitcher | null | 'none'>('none')
  const [loading, setLoading]         = useState(true)
  const [loaded, setLoaded]           = useState(false)

  useEffect(() => {
    setLoading(true)
    setLoaded(false)
    setSeasonStats(null)
    setSplits(null)
    setStatcast(null)
    setVsPitcher('none')

    Promise.all([
      fetch(`/api/batter-stats?playerId=${detail.batter.player_id}&type=season`).then(r => r.json()),
      fetch(`/api/batter-stats?playerId=${detail.batter.player_id}&type=splits`).then(r => r.json()),
      detail.opposingPitcherId
        ? fetch(`/api/batter-stats?playerId=${detail.batter.player_id}&type=vs&pitcherId=${detail.opposingPitcherId}`).then(r => r.json())
        : Promise.resolve(null),
      isPro ? fetchStatcastClientSide(detail.batter.player_id) : Promise.resolve(null),
    ]).then(([season, splitsData, vsData, statcastData]) => {
      setSeasonStats(season ?? null)
      setSplits(splitsData ?? null)
      setVsPitcher(vsData ?? null)
      setStatcast(statcastData ?? null)
      setLoading(false)
      setLoaded(true)
    }).catch(() => {
      setLoading(false)
      setLoaded(true)
    })
  }, [detail.batter.player_id, detail.opposingPitcherId, isPro])

  const { batter, teamName, teamId } = detail

  // OPS trend chart
  const opsValues = [
    splits?.last_30 ? parseFloat(splits.last_30.ops) : null,
    splits?.last_14 ? parseFloat(splits.last_14.ops) : null,
    splits?.last_7  ? parseFloat(splits.last_7.ops)  : null,
  ]
  const hasOpsTrend = opsValues.some(v => v !== null)

  // Radar — values are already percentiles from Savant
const radarLabels = ['Exit velo', 'Barrel%', 'Sweet spot%', 'xBA', 'xSLG', 'xwOBA']
const radarValues = statcast ? [
  // Exit velo: 82-95mph range
  statcast.avg_exit_velocity != null
    ? Math.min(Math.max(Math.round((statcast.avg_exit_velocity - 82) / (95 - 82) * 100), 0), 100)
    : 0,
  // Barrel%: 0-20% range
  statcast.barrel_pct != null
    ? Math.min(Math.round(statcast.barrel_pct * 5), 100)
    : 0,
  // Sweet spot%: 20-45% range
  statcast.sweet_spot_pct != null
    ? Math.min(Math.max(Math.round((statcast.sweet_spot_pct - 20) / (45 - 20) * 100), 0), 100)
    : 0,
  // xBA: .180-.340 range
  statcast.xba != null
    ? Math.min(Math.max(Math.round((statcast.xba - 0.180) / (0.340 - 0.180) * 100), 0), 100)
    : 0,
  // xSLG: .280-.650 range
  statcast.xslg != null
    ? Math.min(Math.max(Math.round((statcast.xslg - 0.280) / (0.650 - 0.280) * 100), 0), 100)
    : 0,
  // xwOBA: .260-.430 range
  statcast.xwoba != null
    ? Math.min(Math.max(Math.round((statcast.xwoba - 0.260) / (0.430 - 0.260) * 100), 0), 100)
    : 0,
] : []
  const ops = batter.season_ops

  return (
    <div className="overflow-y-auto space-y-4 pb-6">

      <button
        onClick={onBack}
        className="md:hidden flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-stone-400 hover:text-orange-600 transition mb-2"
      >
        ← Back to lineup
      </button>

      {/* Player header */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
        <img
          src={playerHeadshotUrl(batter.player_id)}
          alt={batter.player_name}
          className="w-14 h-14 rounded-full object-cover border-2 border-orange-400 shrink-0"
          onError={(e) => {
            e.currentTarget.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,h_120/v1/people/${batter.player_id}/headshot/milb/current`
            e.currentTarget.onerror = null
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-xl font-semibold text-stone-900">
              {batter.player_name}
            </span>
            {isPro && (
              <span className="text-[8px] font-mono font-bold text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                ⊕ PRO
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono text-stone-400">
              #{batter.batting_order} · {batter.position}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <img src={teamLogoUrl(teamId)} alt={teamName} className="w-4 h-4 object-contain" />
            <span className="text-xs font-mono text-stone-500">{shortName(teamName)}</span>
          </div>
          {ops != null && (
            <div className="flex gap-4 mt-2">
              <div>
                <span className={`text-xl font-mono font-bold ${opsColor(ops)}`}>
                  {ops.toFixed(3)}
                </span>
                <span className="text-[9px] font-mono text-stone-400 ml-1 uppercase">OPS</span>
              </div>
              {batter.season_avg != null && (
                <div>
                  <span className="text-xl font-mono font-bold text-stone-900">
                    {batter.season_avg.toFixed(3)}
                  </span>
                  <span className="text-[9px] font-mono text-stone-400 ml-1 uppercase">AVG</span>
                </div>
              )}
              {batter.season_obp != null && (
                <div>
                  <span className="text-xl font-mono font-bold text-stone-900">
                    {batter.season_obp.toFixed(3)}
                  </span>
                  <span className="text-[9px] font-mono text-stone-400 ml-1 uppercase">OBP</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-10 text-sm font-serif text-stone-400 italic">
          Loading stats...
        </div>
      )}

      {loaded && (
        <>
          {/* Season stats */}
          {seasonStats && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <SectionLabel title="2026 Season" />
              <div className="grid grid-cols-4 gap-2 mb-2">
                <StatBox label="AVG" value={seasonStats.avg} />
                <StatBox label="OBP" value={seasonStats.obp} />
                <StatBox label="SLG" value={seasonStats.slg} />
                <StatBox label="OPS" value={seasonStats.ops}
                  color={opsColor(parseFloat(seasonStats.ops))} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="HR"    value={seasonStats.home_runs} />
                <StatBox label="RBI"   value={seasonStats.rbi} />
                <StatBox label="BABIP" value={seasonStats.babip} />
                <StatBox label="ISO"   value={seasonStats.iso} />
              </div>
            </div>
          )}

          {/* Statcast — Pro only */}
          {isPro && statcast && (
            


  <div className="bg-white border border-stone-200 rounded-xl p-4">
    <SectionLabel title="Statcast" pro />

  <div className="grid grid-cols-3 gap-2 mb-2">
  {statcast.avg_exit_velocity != null && (
    <StatBox label="Exit velo"
      value={`${statcast.avg_exit_velocity.toFixed(1)} mph`}
      color={
        statcast.avg_exit_velocity >= 92 ? 'text-green-500' :
        statcast.avg_exit_velocity >= 89 ? 'text-green-600' :
        statcast.avg_exit_velocity <= 85 ? 'text-red-500' :
        'text-orange-500'
      } />
  )}
  {statcast.barrel_pct != null && (
    <StatBox label="Barrel%"
      value={`${statcast.barrel_pct.toFixed(1)}%`}
      color={
        statcast.barrel_pct >= 12 ? 'text-green-500' :
        statcast.barrel_pct >= 8  ? 'text-green-600' :
        statcast.barrel_pct >= 5  ? 'text-orange-500' :
        'text-red-500'
      } />
  )}
  {statcast.sweet_spot_pct != null && (
    <StatBox label="Sweet spot%"
      value={`${statcast.sweet_spot_pct.toFixed(1)}%`}
      color={
        statcast.sweet_spot_pct >= 36 ? 'text-green-500' :
        statcast.sweet_spot_pct >= 31 ? 'text-green-600' :
        statcast.sweet_spot_pct >= 26 ? 'text-orange-500' :
        'text-red-500'
      } />
  )}
</div>
<div className="grid grid-cols-3 gap-2 mb-4">
  {statcast.xba != null && (
    <StatBox label="xBA"
      value={statcast.xba.toFixed(3)}
      color={
        statcast.xba >= 0.290 ? 'text-green-500' :
        statcast.xba >= 0.260 ? 'text-green-600' :
        statcast.xba >= 0.240 ? 'text-orange-500' :
        'text-red-500'
      } />
  )}
  {statcast.xslg != null && (
    <StatBox label="xSLG"
      value={statcast.xslg.toFixed(3)}
      color={
        statcast.xslg >= 0.500 ? 'text-green-500' :
        statcast.xslg >= 0.420 ? 'text-green-600' :
        statcast.xslg >= 0.360 ? 'text-orange-500' :
        'text-red-500'
      } />
  )}
  {statcast.xwoba != null && (
    <StatBox label="xwOBA"
      value={statcast.xwoba.toFixed(3)}
      color={
        statcast.xwoba >= 0.370 ? 'text-green-500' :
        statcast.xwoba >= 0.330 ? 'text-green-600' :
        statcast.xwoba >= 0.300 ? 'text-orange-500' :
        'text-red-500'
      } />
  )}
</div>

   {radarValues.length > 0 && radarValues.some(v => v > 0) && (
  <div className="mt-4 mb-2">
    <div className="bg-stone-50 rounded-lg p-3 mb-3 flex gap-3 items-start">
      <span className="text-lg shrink-0">📊</span>
      <div>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-600 mb-1">
          How to read this chart
        </p>
        <p className="text-xs font-serif text-stone-500 leading-relaxed">
          Each axis shows a <span className="font-semibold text-stone-700">percentile rank</span> from 0–100 compared to all qualified MLB hitters. A score of <span className="font-semibold text-stone-700">75</span> means this batter outperforms 75% of the league in that category. The further the shape extends toward the edge, the better the contact quality.
        </p>
      </div>
    </div>
    <RadarChart values={radarValues} labels={radarLabels} />
  </div>
)}

    <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-3">
        What these numbers mean
      </p>

      {statcast.avg_exit_velocity != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            EXIT VELO
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            How hard the ball comes off the bat on average. Above <span className="font-semibold">90mph</span> is above average — harder contact means fewer outs on routine plays. Elite hitters consistently sit above <span className="font-semibold">92mph</span>.
            {statcast.avg_exit_velocity >= 92
              ? ' This batter is making genuinely hard contact.'
              : statcast.avg_exit_velocity >= 89
              ? ' Solid contact, around league average.'
              : ' Below average exit velocity — pitchers can attack this hitter with softer stuff.'}
          </p>
        </div>
      )}

      {statcast.barrel_pct != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            BARREL%
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            The percentage of batted balls hit with the ideal combination of exit velocity and launch angle — the sweet spot that produces a batting average above .500 and slugging above 1.500. League average is around <span className="font-semibold">6-7%</span>. Above <span className="font-semibold">10%</span> is elite and directly correlates with home run power.
            {statcast.barrel_pct >= 12
              ? ' This is a legitimate power threat — pitchers cannot afford to make mistakes over the plate.'
              : statcast.barrel_pct >= 8
              ? ' Above average power — a hitter who punishes mistakes.'
              : statcast.barrel_pct <= 4
              ? ' Low barrel rate — this hitter rarely squares up elite contact.'
              : ' League average barrel rate.'}
          </p>
        </div>
      )}

      {statcast.sweet_spot_pct != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            SWEET SPOT%
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            Percentage of batted balls hit at the optimal launch angle of 8-32°. Balls in this range turn into hits at a significantly higher rate than grounders or pop-ups. League average is around <span className="font-semibold">31-33%</span>. Above <span className="font-semibold">36%</span> signals a hitter with excellent bat-to-ball skills who consistently drives the ball.
          </p>
        </div>
      )}

      {statcast.xba != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            xBA
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            Expected batting average based purely on exit velocity and launch angle — what this hitter <span className="font-semibold italic">should</span> be hitting, independent of defensive positioning or luck. When xBA is significantly higher than actual BA, the hitter is due for positive regression. When lower, they've been getting lucky.
            {seasonStats && (() => {
              const ba = parseFloat(seasonStats.avg)
              const diff = ba - statcast.xba!
              if (diff > 0.020) return <span className="text-red-600 font-semibold"> Currently outperforming xBA by {Math.round(diff * 1000)} points — expect a pullback.</span>
              if (diff < -0.020) return <span className="text-green-600 font-semibold"> Underperforming xBA by {Math.round(Math.abs(diff) * 1000)} points — due for positive regression.</span>
              return <span className="text-stone-500"> Performing in line with underlying contact quality.</span>
            })()}
          </p>
        </div>
      )}

      {statcast.xslg != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            xSLG
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            Expected slugging percentage based on contact quality. This tells you how much extra-base power a hitter is generating regardless of whether balls happened to land for hits. Above <span className="font-semibold">.450</span> is solid, above <span className="font-semibold">.550</span> is elite. A gap between xSLG and actual SLG signals an incoming power surge or cooldown.
          </p>
        </div>
      )}

      {statcast.xwoba != null && (
        <div className="flex gap-3 items-start">
          <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
            xwOBA
          </span>
          <p className="text-xs font-serif text-stone-600 leading-relaxed">
            The most complete expected stat — it weights every batted ball outcome by how much it contributes to scoring runs. Think of it as the single best number for overall offensive value, stripped of luck. League average is around <span className="font-semibold">.320</span>. Above <span className="font-semibold">.370</span> is a genuine offensive weapon. Above <span className="font-semibold">.400</span> is MVP-calibre.
            {statcast.xwoba >= 0.400
              ? ' This hitter is making MVP-calibre contact quality right now.'
              : statcast.xwoba >= 0.370
              ? ' Elite offensive profile — a hitter pitchers must respect.'
              : statcast.xwoba >= 0.320
              ? ' Solid, around league average offensive value.'
              : ' Below league average contact quality — pitchers have the advantage.'}
          </p>
        </div>
      )}
    </div>

    {seasonStats && statcast.xba != null && (() => {
      const ba  = parseFloat(seasonStats.avg)
      const xba = statcast.xba!
      const gap = ba - xba
      if (Math.abs(gap) < 0.015) return null
      const overlucky = gap > 0
      return (
        <div className={`mt-3 p-3 rounded-lg text-xs font-serif ${overlucky ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {overlucky
            ? `BA (${seasonStats.avg}) runs ${Math.round(gap * 1000)} points ahead of xBA (${xba.toFixed(3)}) — negative regression candidate.`
            : `xBA (${xba.toFixed(3)}) outpaces BA (${seasonStats.avg}) by ${Math.round(Math.abs(gap) * 1000)} points — positive regression candidate.`
          }
        </div>
      )
    })()}
  </div>
)}

{isPro && !statcast && loaded && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <SectionLabel title="Statcast" pro />
              <p className="text-sm font-serif text-stone-400 italic">
                Below qualifier threshold — insufficient PA for Statcast percentile rankings.
              </p>
            </div>
          )}

          {/* Recent form */}
          {splits && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <SectionLabel title="Recent form" />

              {hasOpsTrend && <LineChart opsValues={opsValues} />}

              <div className="space-y-0">
                {[
                  { label: 'Last 7',  data: splits.last_7  },
                  { label: 'Last 14', data: splits.last_14 },
                  { label: 'Last 30', data: splits.last_30 },
                ].map(({ label, data }) => data && (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-stone-50 last:border-0">
                    <span className="text-[10px] font-mono text-stone-400 w-16 shrink-0">{label}</span>
                    <div className="flex gap-3 flex-wrap justify-end">
                      <span className="text-xs font-mono">
                        <span className="font-bold text-stone-900">{data.avg}</span>
                        <span className="text-stone-400 ml-1">AVG</span>
                      </span>
                      <span className="text-xs font-mono">
                        <span className="font-bold text-stone-900">{data.obp}</span>
                        <span className="text-stone-400 ml-1">OBP</span>
                      </span>
                      <span className="text-xs font-mono">
                        <span className={`font-bold ${opsColor(parseFloat(data.ops))}`}>{data.ops}</span>
                        <span className="text-stone-400 ml-1">OPS</span>
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">{data.pa} PA</span>
                    </div>
                  </div>
                ))}
              </div>

              {(splits.vs_lhp || splits.vs_rhp) && (
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
                    vs handedness
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {splits.vs_rhp && (
                      <div className="bg-stone-50 rounded-lg p-3">
                        <p className="text-[9px] font-mono text-stone-400 uppercase mb-1">vs RHP</p>
                        <p className="text-sm font-mono font-bold text-stone-900">{splits.vs_rhp.ops} OPS</p>
                        <p className="text-[10px] font-mono text-stone-500">
                          {splits.vs_rhp.avg} / {splits.vs_rhp.obp} / {splits.vs_rhp.slg}
                        </p>
                        <p className="text-[9px] font-mono text-stone-400 mt-1">{splits.vs_rhp.pa} PA</p>
                      </div>
                    )}
                    {splits.vs_lhp && (
                      <div className="bg-stone-50 rounded-lg p-3">
                        <p className="text-[9px] font-mono text-stone-400 uppercase mb-1">vs LHP</p>
                        <p className="text-sm font-mono font-bold text-stone-900">{splits.vs_lhp.ops} OPS</p>
                        <p className="text-[10px] font-mono text-stone-500">
                          {splits.vs_lhp.avg} / {splits.vs_lhp.obp} / {splits.vs_lhp.slg}
                        </p>
                        <p className="text-[9px] font-mono text-stone-400 mt-1">{splits.vs_lhp.pa} PA</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* vs Tonight's Pitcher */}
          {detail.opposingPitcherId && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <SectionLabel title="vs Tonight's pitcher" />
              {vsPitcher === 'none' || vsPitcher === null ? (
                <p className="text-sm font-serif text-stone-400 italic">No career H2H data available.</p>
              ) : vsPitcher.ab < 3 ? (
                <p className="text-sm font-serif text-stone-400 italic">
                  {vsPitcher.ab} AB — too small a sample to draw conclusions.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <StatBox label="AVG" value={vsPitcher.avg} />
                    <StatBox label="OBP" value={vsPitcher.obp} />
                    <StatBox label="SLG" value={vsPitcher.slg} />
                    <StatBox label="OPS" value={vsPitcher.ops}
                      color={opsColor(parseFloat(vsPitcher.ops))} />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <StatBox label="AB" value={vsPitcher.ab} />
                    <StatBox label="H"  value={vsPitcher.hits} />
                    <StatBox label="HR" value={vsPitcher.home_runs} />
                    <StatBox label="K"  value={vsPitcher.strikeouts} />
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =====================================================
// LINEUP ROW
// =====================================================

function LineupRow({
  batter, isSelected, onClick,
}: {
  batter: LineupBatter
  isSelected: boolean
  onClick: () => void
}) {
  const ops = batter.season_ops

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 py-2.5 px-2 rounded-lg transition text-left border ${
        isSelected
          ? 'bg-orange-50 border-orange-300'
          : 'border-transparent hover:bg-stone-50 hover:border-stone-200'
      }`}
    >
      <span className={`text-[10px] font-mono w-4 shrink-0 ${isSelected ? 'text-orange-500 font-bold' : 'text-stone-400'}`}>
        {batter.batting_order}
      </span>
      <img
        src={playerHeadshotUrl(batter.player_id)}
        alt={batter.player_name}
        className={`w-8 h-8 rounded-full object-cover shrink-0 border ${isSelected ? 'border-orange-400' : 'border-stone-200'}`}
        onError={(e) => {
          e.currentTarget.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_60,h_60/v1/people/${batter.player_id}/headshot/milb/current`
          e.currentTarget.onerror = null
        }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-orange-600' : 'text-stone-900'}`}>
          {batter.player_name}
        </p>
        <p className="text-[10px] font-mono text-stone-400 mt-0.5">
          {batter.season_avg?.toFixed(3) ?? '—'}
          {' · '}
          {ops != null ? (
            <span className={opsColor(ops)}>{ops.toFixed(3)}</span>
          ) : '—'}
        </p>
      </div>
      <span className={`text-xs shrink-0 ${isSelected ? 'text-orange-400' : 'text-stone-300'}`}>›</span>
    </button>
  )
}

// =====================================================
// LINEUP PANEL
// =====================================================

function LineupPanel({
  teamName, teamId, batters, selectedId,
  lineupsConfirmed, onSelect,
}: {
  teamName: string
  teamId: number
  batters: LineupBatter[]
  selectedId: number | null
  lineupsConfirmed?: boolean
  onSelect: (batter: LineupBatter) => void
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-2 px-1">
        <img src={teamLogoUrl(teamId)} alt={teamName} className="w-5 h-5 object-contain" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold">
          {shortName(teamName)} lineup
        </span>
        <span className={`ml-auto text-[8px] font-mono uppercase tracking-widest font-bold ${lineupsConfirmed ? 'text-green-500' : 'text-stone-400'}`}>
          {lineupsConfirmed ? '✓ Confirmed' : 'Projected'}
        </span>
      </div>

      {batters.length === 0 ? (
        <p className="text-xs font-serif text-stone-400 italic text-center py-4">
          Lineup not yet posted
        </p>
      ) : (
        [...batters]
          .sort((a, b) => a.batting_order - b.batting_order)
          .map(b => (
            <LineupRow
              key={b.player_id}
              batter={b}
              isSelected={selectedId === b.player_id}
              onClick={() => onSelect(b)}
            />
          ))
      )}
    </div>
  )
}

// =====================================================
// MAIN EXPORT
// =====================================================

export default function BattingTabContent({
  awayTeamName, homeTeamName,
  awayTeamId, homeTeamId,
  awayAbbr, homeAbbr,
  awayBatters, homeBatters,
  awayPitcherId, homePitcherId,
  isPro, lineupsConfirmed,
}: BattingTabContentProps) {
  const [selected, setSelected] = useState<BatterDetail | null>(null)

  const handleSelect = (
    batter: LineupBatter,
    teamName: string,
    teamId: number,
    opposingPitcherId: number | null,
  ) => {
    setSelected({ batter, teamName, teamId, opposingPitcherId })
  }

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
      <div className="flex flex-col gap-4">
        <LineupPanel
          teamName={awayTeamName}
          teamId={awayTeamId}
          batters={awayBatters}
          selectedId={selected?.batter.player_id ?? null}
          lineupsConfirmed={lineupsConfirmed}
          onSelect={(b) => handleSelect(b, awayTeamName, awayTeamId, homePitcherId ?? null)}
        />
        <LineupPanel
          teamName={homeTeamName}
          teamId={homeTeamId}
          batters={homeBatters}
          selectedId={selected?.batter.player_id ?? null}
          lineupsConfirmed={lineupsConfirmed}
          onSelect={(b) => handleSelect(b, homeTeamName, homeTeamId, awayPitcherId ?? null)}
        />
      </div>

      <div>
        {selected ? (
          <BatterDetailView

          
            key={selected.batter.player_id}
            detail={selected}
            isPro={isPro}
            onBack={() => setSelected(null)}
          />
        ) : (
            
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-3xl mb-3">⚾</div>
            <p className="text-sm font-serif text-stone-500 italic">
              Select a batter to see their full stats
            </p>
            <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest mt-2">
              Season · Statcast · Form · H2H
            </p>
          </div>
        )}
      </div>
    </div>
  )
}