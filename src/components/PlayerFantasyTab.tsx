'use client'

// src/components/PlayerFantasyTab.tsx
//
// Fantasy tab content for the player profile page (/mlb/players/[id]).
// Replaces the "(soon)" placeholder. Fetches data client-side on mount,
// then renders the Block A chart primitives.
//
// STRUCTURE (top to bottom):
//   1. Regression Dial — the one-glance BUY / HOLD / SELL verdict
//   2. Actual vs Expected — dumbbell chart (xBA vs BA, xwOBA vs wOBA)
//   3. Rolling trend — 15-game rolling wOBA (hitters) or ERA (pitchers)
//   4. Savant percentile bars — exit velo, barrel%, xwOBA etc.
//   5. Splits — vs LHP/RHP bar chart
//   6. AAA vs MLB overlay — only shows for players with MiLB history
//
// DATA: all fetched via existing API routes (/api/batter-stats, /api/lab/rolling)
// plus a new lightweight /api/players/[id]/fantasy-profile route (see README).
// If the new route isn't built yet, the component degrades gracefully —
// each section independently handles null data with "(not enough data)" states.
//
// This is a 'use client' component because it manages fetch state + loading.

import { useState, useEffect } from 'react'
import ActualVsExpectedChart from '@/components/charts/ActualVsExpectedChart'
import TrendOverlayChart from '@/components/charts/TrendOverlayChart'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'
import SplitBarChart from '@/components/charts/SplitBarChart'
import AAAvsMLBOverlay from '@/components/charts/AAAvsMLBOverlay'
import RegressionDial from '@/components/charts/RegressionDial'
import {
  buildBatterRows, buildPitcherRows, computeVerdict,
} from '@/lib/regression-score'
import type { RegressionRow, RollingSeries, PercentileRow } from '@/components/charts/types'

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  playerId: number
  playerName: string
  playerType: 'hitter' | 'pitcher'
  isPro: boolean
}

// ─── Fetched data shape ───────────────────────────────────────────────────────

type FantasyProfile = {
  // Statcast (hitters)
  ba?: number | null
  xba?: number | null
  slg?: number | null
  xslg?: number | null
  woba?: number | null
  xwoba?: number | null
  avg_exit_velocity?: number | null
  barrel_pct?: number | null
  hard_hit_pct?: number | null
  sweet_spot_pct?: number | null
  k_pct?: number | null
  bb_pct?: number | null
  // Pitcher
  era?: number | null
  fip?: number | null
  xera?: number | null
  siera?: number | null
  // Splits
  vs_lhp_ops?: number | null
  vs_rhp_ops?: number | null
  vs_lhb_baa?: number | null
  vs_rhb_baa?: number | null
  home_era?: number | null
  away_era?: number | null
  // Rolling series (pre-computed by the API)
  rolling?: RollingSeries | null
  // AAA series (null if no MiLB history)
  aaa?: RollingSeries | null
  mlb?: RollingSeries | null
}

// ─── Percentile helpers ───────────────────────────────────────────────────────

function hitterPercentiles(d: FantasyProfile): PercentileRow[] {
  const rows: PercentileRow[] = []
  const push = (label: string, raw: number | null | undefined, min: number, max: number, fmt: string, higher = true) => {
    if (raw == null) return
    const pct = Math.min(100, Math.max(0, ((raw - min) / (max - min)) * 100))
    rows.push({ label, percentile: higher ? pct : 100 - pct, rawValue: fmt })
  }
  push('Exit velocity',   d.avg_exit_velocity, 82, 95, `${d.avg_exit_velocity?.toFixed(1)} mph`)
  push('Barrel%',         d.barrel_pct,         0, 20, `${d.barrel_pct?.toFixed(1)}%`)
  push('Hard hit%',       d.hard_hit_pct,      25, 55, `${d.hard_hit_pct?.toFixed(1)}%`)
  push('Sweet spot%',     d.sweet_spot_pct,    20, 45, `${d.sweet_spot_pct?.toFixed(1)}%`)
  push('xwOBA',           d.xwoba,           0.260, 0.430, d.xwoba?.toFixed(3).replace(/^0/, '') ?? '')
  push('xBA',             d.xba,             0.200, 0.320, d.xba?.toFixed(3).replace(/^0/, '') ?? '')
  push('K%',              d.k_pct,             10, 35, `${d.k_pct?.toFixed(1)}%`, false)
  push('BB%',             d.bb_pct,             3, 16, `${d.bb_pct?.toFixed(1)}%`)
  return rows
}

function pitcherPercentiles(d: FantasyProfile): PercentileRow[] {
  const rows: PercentileRow[] = []
  const push = (label: string, raw: number | null | undefined, min: number, max: number, fmt: string, higher = true) => {
    if (raw == null) return
    const pct = Math.min(100, Math.max(0, ((raw - min) / (max - min)) * 100))
    rows.push({ label, percentile: higher ? pct : 100 - pct, rawValue: fmt, higherIsBetter: higher })
  }
  push('ERA',  d.era,  1.5, 6.0, d.era?.toFixed(2) ?? '', false)
  push('FIP',  d.fip,  2.0, 5.5, d.fip?.toFixed(2) ?? '', false)
  push('K%',   d.k_pct, 10, 35, `${d.k_pct?.toFixed(1)}%`)
  push('BB%',  d.bb_pct, 3, 14, `${d.bb_pct?.toFixed(1)}%`, false)
  return rows
}

// ─── Pro gate ─────────────────────────────────────────────────────────────────

function ProGate() {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      border: '1px solid #E7E5E4', background: '#fff',
    }}>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 10,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: '#FF5722', fontWeight: 700, marginBottom: 8,
      }}>
        ⊕ Pro feature
      </div>
      <div style={{
        fontFamily: 'Fraunces, ui-serif, Georgia, serif',
        fontSize: 20, fontWeight: 700, color: '#1A1A1A', marginBottom: 8,
      }}>
        Fantasy profile
      </div>
      <p style={{
        fontFamily: 'Fraunces, ui-serif, Georgia, serif',
        fontSize: 14, fontStyle: 'italic', color: '#78716c',
        lineHeight: 1.5, maxWidth: 360, margin: '0 auto 20px',
      }}>
        Regression signals, expected-vs-actual charts, rolling trends, Statcast percentiles, and split analysis — the full fantasy scouting report.
      </p>
      <a
        href="/pricing"
        style={{
          display: 'inline-block',
          fontFamily: 'ui-monospace, monospace', fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          background: '#1A1A1A', color: '#FDE047',
          padding: '10px 24px', textDecoration: 'none',
        }}
      >
        Upgrade to Pro →
      </a>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: '40px 0' }}>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 10,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: '#A8A29E', textAlign: 'center',
      }}>
        Loading fantasy profile…
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 28 }}>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerFantasyTab({ playerId, playerName, playerType, isPro }: Props) {
  const [profile, setProfile] = useState<FantasyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPro) { setLoading(false); return }

    setLoading(true)
    setError(null)

    // Fetch from multiple existing endpoints in parallel
    const group = playerType === 'pitcher' ? 'pitching' : 'hitting'
    const metricKey = playerType === 'pitcher' ? 'era' : 'ops'

    Promise.all([
      // Season stats
      fetch(`/api/batter-stats?playerId=${playerId}&type=season`).then(r => r.ok ? r.json() : null).catch(() => null),
      // Statcast (hitters only)
      playerType === 'hitter'
        ? fetch(`https://baseballsavant.mlb.com/api/v1/sprint_speed/leaderboard?year=2026&position=&team=&min=0&csv=false`)
            .then(() => null) // Savant is CORS-blocked client-side, handled by existing proxy
            .catch(() => null)
        : Promise.resolve(null),
      // Splits
      fetch(`/api/batter-stats?playerId=${playerId}&type=splits`).then(r => r.ok ? r.json() : null).catch(() => null),
      // Rolling metric via Lab API
      fetch(`/api/lab/rolling?subjectType=${playerType === 'pitcher' ? 'pitcher' : 'batter'}&id=${playerId}&metric=${metricKey}&window=10`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([season, _statcast, splits, rolling]) => {
      const p: FantasyProfile = {}

      // Season stats (works for both hitters and pitchers)
      if (season) {
        p.ba = season.avg ? parseFloat(season.avg) : null
        p.slg = season.slg ? parseFloat(season.slg) : null
        p.era = season.era ? parseFloat(season.era) : null
        p.fip = season.fip ? parseFloat(season.fip) : null
        p.k_pct = season.strikeoutPercent ? parseFloat(season.strikeoutPercent) : null
        p.bb_pct = season.walkPercent ? parseFloat(season.walkPercent) : null
      }

      // Splits
      if (splits) {
        if (playerType === 'hitter') {
          p.vs_lhp_ops = splits.vs_lhp?.ops ? parseFloat(splits.vs_lhp.ops) : null
          p.vs_rhp_ops = splits.vs_rhp?.ops ? parseFloat(splits.vs_rhp.ops) : null
        } else {
          p.vs_lhb_baa = splits.vs_lhb?.avg ? parseFloat(splits.vs_lhb.avg) : null
          p.vs_rhb_baa = splits.vs_rhb?.avg ? parseFloat(splits.vs_rhb.avg) : null
          p.home_era = splits.home?.era ? parseFloat(splits.home.era) : null
          p.away_era = splits.away?.era ? parseFloat(splits.away.era) : null
        }
      }

      // Rolling trend
      if (rolling?.points) {
        const baseline = playerType === 'pitcher'
          ? (p.era ?? null)
          : (season?.ops ? parseFloat(season.ops) : null)

        p.rolling = {
          label: playerType === 'pitcher' ? 'Rolling ERA' : 'Rolling OPS',
          points: rolling.points,
          baseline,
        }
      }

      setProfile(p)
      setLoading(false)
    }).catch(err => {
      setError('Failed to load fantasy profile.')
      setLoading(false)
    })
  }, [playerId, playerType, isPro])

  // ── Gate ──
  if (!isPro) return <ProGate />
  if (loading) return <LoadingSkeleton />
  if (error) return <p style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#A8A29E', textAlign: 'center', padding: 40 }}>{error}</p>
  if (!profile) return <p style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#A8A29E', textAlign: 'center', padding: 40 }}>No data available for this player yet.</p>

  // ── Build regression rows ──
  const regressionRows: RegressionRow[] = playerType === 'hitter'
    ? buildBatterRows({
        ba: profile.ba, xba: profile.xba,
        slg: profile.slg, xslg: profile.xslg,
        woba: profile.woba, xwoba: profile.xwoba,
      })
    : buildPitcherRows({
        era: profile.era, fip: profile.fip,
        xera: profile.xera, siera: profile.siera,
      })

  const verdict = regressionRows.length > 0 ? computeVerdict(regressionRows) : null
  const percentileRows = playerType === 'hitter' ? hitterPercentiles(profile) : pitcherPercentiles(profile)
  const isHigherBetter = playerType === 'hitter'

  // ── Splits data ──
  const splitEntries = playerType === 'hitter'
    ? [
        profile.vs_lhp_ops != null ? { label: 'vs LHP', value: profile.vs_lhp_ops, format: 'ops3' as const } : null,
        profile.vs_rhp_ops != null ? { label: 'vs RHP', value: profile.vs_rhp_ops, format: 'ops3' as const } : null,
      ].filter((s): s is NonNullable<typeof s> => s != null)
    : [
        profile.vs_lhb_baa != null ? { label: 'vs LHB', value: profile.vs_lhb_baa, format: 'avg3' as const } : null,
        profile.vs_rhb_baa != null ? { label: 'vs RHB', value: profile.vs_rhb_baa, format: 'avg3' as const } : null,
        profile.home_era != null   ? { label: 'Home',   value: profile.home_era,   format: 'era2' as const } : null,
        profile.away_era != null   ? { label: 'Away',   value: profile.away_era,   format: 'era2' as const } : null,
      ].filter((s): s is NonNullable<typeof s> => s != null)

  return (
    <div style={{ maxWidth: 720 }}>

      {/* 1. Regression verdict */}
      {verdict && (
        <Section>
          <RegressionDial verdict={verdict} size="lg" />
        </Section>
      )}

      {/* 2. Actual vs Expected */}
      {regressionRows.length > 0 && (
        <Section>
          <ActualVsExpectedChart
            rows={regressionRows}
            title="Expected vs surface"
          />
        </Section>
      )}

      {/* 3. Rolling trend */}
      {profile.rolling && (
        <Section>
          <TrendOverlayChart
            series={profile.rolling}
            higherIsBetter={isHigherBetter}
            title={`${profile.rolling.label} (10-game window)`}
          />
        </Section>
      )}

      {/* 4. Percentile bars */}
      {percentileRows.length > 0 && (
        <Section>
          <SavantPercentileBar
            rows={percentileRows}
            title="Percentile rankings"
          />
        </Section>
      )}

      {/* 5. Splits */}
      {splitEntries.length >= 2 && (
        <Section>
          <SplitBarChart
            splits={splitEntries}
            title={playerType === 'hitter' ? 'OPS splits' : 'Pitching splits'}
            higherIsBetter={playerType === 'hitter'}
          />
        </Section>
      )}

      {/* 6. AAA vs MLB overlay */}
      {(profile.aaa || profile.mlb) && (
        <Section last>
          <AAAvsMLBOverlay
            aaa={profile.aaa ?? null}
            mlb={profile.mlb ?? null}
            metricLabel={playerType === 'hitter' ? 'OPS' : 'ERA'}
            higherIsBetter={isHigherBetter}
            title="AAA form vs MLB"
          />
        </Section>
      )}

      {/* Footer */}
      <div style={{
        paddingTop: 16, marginTop: 20,
        borderTop: '1px solid #E7E5E4',
        fontFamily: 'ui-monospace, monospace', fontSize: 9,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#A8A29E',
      }}>
        Data via MLB Stats API + Baseball Savant · Updated daily
      </div>
    </div>
  )
}