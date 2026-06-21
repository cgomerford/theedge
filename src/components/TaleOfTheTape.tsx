'use client'

/**
 * src/components/TaleOfTheTape.tsx
 *
 * The at-bat, staged as a confrontation. A pitcher's arsenal (left) against the
 * most dangerous bat in the opposing lineup (right), with the strike zone as the
 * battleground in the middle. Each cell is colored by NET TILT — who wins that
 * zone — weighted by how often the pitcher throws there.
 *
 * FREE: sees the full-mix grid + The Read.
 * PRO:  unlocks the arsenal toggle — tap any pitch and watch the zone re-color
 *       and The Read rewrite. The toggle is the thing they pay for.
 *
 * Data comes from pitcher_zone_arsenal (via getPitcherZoneArsenal) and
 * batter_hot_zones (via getMostDangerousBat). Never fetches auth — isPro is a
 * required prop, defaults handled by the caller.
 *
 * Tailwind v4 + Turbopack note: responsive classes are unreliable here, so
 * layout uses an inline <style> block with plain @media queries.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  netTilt,
  type PitcherZoneArsenal,
  type ArsenalPitch,
} from '@/lib/pitcher-arsenal'
import { type BatterHotZones, ZONE_LABELS } from '@/lib/hot-zones'

const ZONES: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const SHORT_LABEL: Record<string, string> = {
  '1': 'high in', '2': 'high mid', '3': 'high out',
  '4': 'mid in', '5': 'middle', '6': 'mid out',
  '7': 'low in', '8': 'low mid', '9': 'low out',
}

type Props = {
  isPro: boolean
  pitcherName: string
  pitcherHand: string | null            // 'L' | 'R'
  arsenal: PitcherZoneArsenal | null    // the 'all' split (or handed split if passed)
  batterName: string | null
  batterHand: string | null             // 'L' | 'R' | 'S'
  batterZones: BatterHotZones | null    // the 'all' split for the danger bat
}

// ─── Tilt helpers ──────────────────────────────────────────────────────────────

function blendFullMix(arsenal: PitcherZoneArsenal, zone: string) {
  // Usage-weighted blend of every pitch's BA-against and usage in this zone.
  let baSum = 0
  let useSum = 0
  let lowSampleAll = true
  for (const pitch of Object.values(arsenal.arsenal) as ArsenalPitch[]) {
    const cell = pitch.zones[zone]
    if (!cell) continue
    const w = cell.pitches
    if (typeof cell.ba_against === 'number') baSum += cell.ba_against * w
    useSum += w
    if (!cell.low_sample) lowSampleAll = false
  }
  const ba = useSum > 0 ? baSum / useSum : null
  // Usage in this zone as a share of the pitcher's total pitches.
  const usagePct = arsenal.total_pitches > 0 ? (useSum / arsenal.total_pitches) * 100 : 0
  return { ba, usagePct, low_sample: lowSampleAll }
}

function cellRgb(net: number): string {
  const t = Math.max(-1, Math.min(1, net / 0.45))
  const base = [42, 42, 42]
  const target = t >= 0 ? [29, 158, 117] : [255, 87, 34]
  const a = Math.abs(t)
  const r = Math.round(base[0] + (target[0] - base[0]) * a)
  const g = Math.round(base[1] + (target[1] - base[1]) * a)
  const b = Math.round(base[2] + (target[2] - base[2]) * a)
  return `rgb(${r},${g},${b})`
}

export default function TaleOfTheTape(props: Props) {
  const { isPro, pitcherName, pitcherHand, arsenal, batterName, batterHand, batterZones } = props

  // 'all' = full mix; otherwise a pitch code (FF, SL, ...). Free is locked to 'all'.
  const [active, setActive] = useState<string>('all')

  const pitchList = useMemo(() => {
    if (!arsenal) return []
    return Object.entries(arsenal.arsenal)
      .map(([code, p]) => ({ code, ...p }))
      .sort((a, b) => (b.usage_pct ?? 0) - (a.usage_pct ?? 0))
  }, [arsenal])

  // No data → graceful empty state, matching HotZone's pattern.
  if (!arsenal || !batterZones || pitchList.length === 0) {
    return (
      <div className="tt-empty">
        <div className="tt-mark">⊕ Tale of the Tape</div>
        <p className="tt-emptytxt">
          Not enough zone data yet for this matchup. Check back closer to game time.
        </p>
        <style>{emptyStyle}</style>
      </div>
    )
  }

  const effectiveActive = isPro ? active : 'all'

  function tiltFor(zone: string): { net: number; lowSample: boolean; usage: number } {
    const hitterX = batterZones!.zones?.[zone]?.xwoba
    if (effectiveActive === 'all') {
      const { ba, usagePct, low_sample } = blendFullMix(arsenal!, zone)
      return { net: netTilt(hitterX, ba, usagePct), lowSample: low_sample, usage: usagePct }
    }
    const pitch = arsenal!.arsenal[effectiveActive]
    const cell = pitch?.zones?.[zone]
    return {
      net: netTilt(hitterX, cell?.ba_against, cell?.usage_pct),
      lowSample: cell?.low_sample ?? true,
      usage: cell?.usage_pct ?? 0,
    }
  }

  // The Read — computed from the same tilt math, in smart-friend voice.
  const read = useMemo(() => {
    let best = ZONES[0]
    let worst = ZONES[0]
    for (const z of ZONES) {
      if (tiltFor(z).net > tiltFor(best).net) best = z
      if (tiltFor(z).net < tiltFor(worst).net) worst = z
    }
    const firstName = (batterName ?? 'the hitter').split(' ').pop()
    const lastNameP = pitcherName.split(' ').pop()
    if (effectiveActive === 'all') {
      const bu = Math.round(tiltFor(best).usage)
      return `${lastNameP}'s edge lives <b>${SHORT_LABEL[best]}</b> — he goes there ${bu}% of the time and ${firstName} can't do much with it. The trap is <b>${SHORT_LABEL[worst]}</b>: leave one there and it's gone.`
    }
    const pitch = arsenal!.arsenal[effectiveActive]
    const verb = tiltFor(best).net > 0.15 ? 'owns' : 'leans on'
    return `The ${pitch.pitch_name.toLowerCase()} ${verb} <b>${SHORT_LABEL[best]}</b> against ${firstName}. Keep it off <b>${SHORT_LABEL[worst]}</b> — that's where this ${batterHand === 'L' ? 'lefty' : 'hitter'} does the damage.`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, arsenal, batterZones, batterName, pitcherName, batterHand])

  const activeCap =
    effectiveActive === 'all'
      ? 'full mix'
      : (arsenal.arsenal[effectiveActive]?.pitch_name ?? effectiveActive).toLowerCase()

  return (
    <div className="tt-stage">
      <div className="tt-head">
        <span className="tt-mark">⊕ Tale of the Tape</span>
        <span className="tt-vs">who wins each zone</span>
      </div>

      <div className="tt-body">
        {/* Pitcher + arsenal */}
        <div className="tt-fighter">
          <p className="tt-fname">{pitcherName}</p>
          <p className="tt-frole">{pitcherHand ? `${pitcherHand}HP` : 'P'} · on the mound</p>

          <div className="tt-arsenal">
            <button
              type="button"
              className={`tt-pitch${effectiveActive === 'all' ? ' on' : ''}${isPro ? '' : ' locked'}`}
              onClick={() => isPro && setActive('all')}
            >
              <span className="tt-dot" style={{ background: '#FAF8F3' }} />
              <span className="tt-pl"><b>Full mix</b><span>every pitch</span></span>
            </button>

            {pitchList.map((p) => (
              <button
                key={p.code}
                type="button"
                disabled={!isPro}
                className={`tt-pitch${effectiveActive === p.code ? ' on' : ''}${isPro ? '' : ' locked'}`}
                onClick={() => isPro && setActive(p.code)}
              >
                <span className="tt-dot" style={{ background: pitchColor(p.code) }} />
                <span className="tt-pl">
                  <b>{p.pitch_name}</b>
                  <span>
                    {p.avg_velo ? `${p.avg_velo}mph · ` : ''}{Math.round(p.usage_pct ?? 0)}%
                  </span>
                </span>
                {!isPro && <span className="tt-lock">Pro</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Zone battleground */}
        <div className="tt-zonewrap">
          <div className="tt-zonecap">{activeCap} · catcher&apos;s view</div>
          <div className="tt-zone">
            <div className="tt-grid">
              {ZONES.map((z) => {
                const { net, lowSample } = tiltFor(z)
                const bg = lowSample ? 'rgb(38,38,38)' : cellRgb(net)
                const strong = Math.abs(net) > 0.16 && !lowSample
                return (
                  <div key={z} className="tt-cell" style={{ background: bg }}>
                    <span className="tt-cnet" style={{ color: strong ? '#fff' : '#9a9a9a' }}>
                      {lowSample ? '·' : `${net > 0 ? '+' : ''}${net.toFixed(2)}`}
                    </span>
                    <span className="tt-clab">{SHORT_LABEL[z]}</span>
                  </div>
                )
              })}
            </div>
            <svg className="tt-plate" viewBox="0 0 60 15">
              <polygon points="3,1 57,1 57,8 30,14 3,8" fill="none" stroke="#FF5722" strokeWidth="1.3" />
            </svg>
          </div>
        </div>

        {/* Hitter profile */}
        <div className="tt-fighter">
          <p className="tt-fname">{batterName ?? 'Top bat'}</p>
          <p className="tt-frole">
            {batterHand === 'L' ? 'LHB' : batterHand === 'R' ? 'RHB' : 'SW'} · at the plate
          </p>
          <HitterProfile zones={batterZones} />
        </div>
      </div>

      <div className="tt-readbar">
        <div className="tt-readlab">— the read</div>
        <p className="tt-readtxt" dangerouslySetInnerHTML={{ __html: read }} />
      </div>

      <div className="tt-legend">
        <span><span className="tt-sw" style={{ background: '#1D9E75' }} />{pitcherName.split(' ').pop()}&apos;s zone</span>
        <span><span className="tt-sw" style={{ background: '#2A2A2A', border: '1px solid #444' }} />contested</span>
        <span><span className="tt-sw" style={{ background: '#FF5722' }} />hitter&apos;s zone</span>
      </div>

      {!isPro && (
        <div className="tt-prohint">
          <Link href="/pricing">
            <span className="tt-pmark">⊕ Pro</span> — tap a pitch to see his plan
          </Link>
        </div>
      )}

      <style>{stageStyle}</style>
    </div>
  )
}

// ─── Hitter profile (right column) ─────────────────────────────────────────────

function HitterProfile({ zones }: { zones: BatterHotZones }) {
  const cells = Object.entries(zones.zones ?? {})
    .map(([z, c]) => ({ z, x: typeof c.xwoba === 'number' ? c.xwoba : null }))
    .filter((c) => c.x !== null) as { z: string; x: number }[]

  if (cells.length === 0) return null

  const crush = cells.reduce((a, b) => (b.x > a.x ? b : a))
  const cold = cells.reduce((a, b) => (b.x < a.x ? b : a))

  return (
    <div className="tt-arsenal">
      <div className="tt-pitch static">
        <span className="tt-dot" style={{ background: '#FF5722' }} />
        <span className="tt-pl"><b>Crushes</b><span>{SHORT_LABEL[crush.z]} · {crush.x.toFixed(3)} xwOBA</span></span>
      </div>
      <div className="tt-pitch static">
        <span className="tt-dot" style={{ background: '#1D9E75' }} />
        <span className="tt-pl"><b>Whiffs</b><span>{SHORT_LABEL[cold.z]} · {cold.x.toFixed(3)} xwOBA</span></span>
      </div>
    </div>
  )
}

// ─── Pitch colors (consistent with arsenal chart) ──────────────────────────────

function pitchColor(code: string): string {
  const map: Record<string, string> = {
    FF: '#E24B4A', SI: '#EF6C4A', FC: '#D9803A',
    SL: '#FF8A4C', ST: '#F2A640', SV: '#E0A33A',
    CU: '#9B8CFF', KC: '#7F77DD', CS: '#6E66C8',
    CH: '#5DCAA5', FS: '#3FB089', FO: '#2E9E78',
    EP: '#888780', KN: '#A3A3A3', SC: '#B4B2A9',
  }
  return map[code] ?? '#A3A3A3'
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const emptyStyle = `
  .tt-empty { background:#1A1A1A; color:#FAF8F3; padding:20px 18px; position:relative; }
  .tt-empty::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:#FF5722; }
  .tt-mark { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; }
  .tt-emptytxt { font-family:var(--font-fraunces,serif); font-style:italic; font-size:14px; color:#A3A3A3; margin-top:10px; }
`

const stageStyle = `
  .tt-stage { background:#1A1A1A; color:#FAF8F3; padding:22px 18px 26px; position:relative; font-family:'JetBrains Mono',ui-monospace,monospace; }
  .tt-stage::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:#FF5722; }
  .tt-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:20px; }
  .tt-mark { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; }
  .tt-vs { font-family:'Bebas Neue',sans-serif; font-size:14px; letter-spacing:.2em; color:#A3A3A3; }
  .tt-body { display:grid; grid-template-columns:1fr; gap:18px; }
  .tt-fighter { text-align:center; }
  .tt-fname { font-family:var(--font-fraunces,serif); font-weight:600; font-size:20px; line-height:1.05; margin:0 0 2px; }
  .tt-frole { font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#A3A3A3; margin:0 0 12px; }
  .tt-arsenal { display:flex; flex-direction:column; gap:6px; }
  .tt-pitch { display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid #333; background:#1A1A1A; cursor:pointer; transition:border-color .15s,background .15s; text-align:left; width:100%; position:relative; }
  .tt-pitch:hover:not(.static):not(.locked) { border-color:#555; }
  .tt-pitch.on { border-color:#FF5722; background:#241612; }
  .tt-pitch.static { cursor:default; }
  .tt-pitch.locked { cursor:default; opacity:.65; }
  .tt-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .tt-pl { flex:1; line-height:1.25; }
  .tt-pl b { display:block; font-weight:500; font-size:11px; color:#FAF8F3; }
  .tt-pl span { font-size:9px; color:#888; }
  .tt-lock { font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:#FF5722; }
  .tt-zonewrap { position:relative; }
  .tt-zonecap { text-align:center; font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#666; margin-bottom:9px; }
  .tt-zone { position:relative; width:100%; max-width:280px; margin:0 auto; aspect-ratio:1; }
  .tt-grid { position:absolute; inset:0; display:grid; grid-template-columns:repeat(3,1fr); gap:3px; }
  .tt-cell { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:background .35s ease; overflow:hidden; }
  .tt-cnet { font-family:'Bebas Neue',sans-serif; font-size:24px; line-height:.9; transition:color .35s; }
  .tt-clab { font-size:8px; letter-spacing:.08em; text-transform:uppercase; margin-top:2px; opacity:.6; color:#999; }
  .tt-plate { position:absolute; left:50%; bottom:-20px; transform:translateX(-50%); width:60px; height:15px; }
  .tt-readbar { margin-top:22px; padding-top:18px; border-top:1px solid #333; }
  .tt-readlab { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; margin-bottom:8px; }
  .tt-readtxt { font-family:var(--font-fraunces,serif); font-size:16px; line-height:1.55; color:#FAF8F3; margin:0; min-height:50px; }
  .tt-readtxt b { color:#FDE047; font-weight:600; }
  .tt-legend { display:flex; justify-content:center; gap:16px; margin-top:15px; font-size:9px; color:#888; letter-spacing:.04em; flex-wrap:wrap; }
  .tt-sw { width:11px; height:11px; display:inline-block; vertical-align:-1px; margin-right:4px; }
  .tt-prohint { margin-top:14px; text-align:center; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:#555; }
  .tt-prohint a { color:#555; text-decoration:none; }
  .tt-prohint .tt-pmark { color:#FF5722; }
  @media (min-width:600px) {
    .tt-body { grid-template-columns:130px 1fr 130px; align-items:start; }
  }
`
