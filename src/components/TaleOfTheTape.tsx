'use client'

/**
 * src/components/TaleOfTheTape.tsx
 *
 * The at-bat, staged as a confrontation. A pitcher's arsenal against a
 * batter's hot zones, with the strike zone as the battleground in the
 * middle. Each cell is colored by NET TILT — who wins that zone — weighted
 * by how often the pitcher throws there.
 *
 * ONE PANEL, side toggle. There is no "two simultaneous panels" — the user
 * picks which TEAM is pitching (Home or Away) with a single toggle, and the
 * panel reconfigures: pitcher dropdown becomes that team's full staff
 * (starter defaulted), batter dropdown automatically becomes the OTHER
 * team's lineup (leadoff defaulted). Switching the toggle swaps both sides
 * at once — it is never possible to have a pitcher facing his own team's
 * batters.
 *
 * Lives on the "Behind the Plate" tab.
 *
 * FREE: sees the full-mix grid + The Read, for the default matchup only,
 *       side toggle and selectors locked.
 * PRO:  unlocks the side toggle, the per-pitch arsenal toggle, AND the
 *       pitcher/batter selectors.
 *
 * Data: the two distinct matchups (home pitching vs away pitching) are both
 * passed in fully pre-fetched as props — defaultArsenal/defaultBatterZones
 * for whichever side is active is cheap (already fetched server-side
 * exactly as before). Any OTHER pitcher/batter the user selects beyond the
 * two defaults is fetched lazily client-side via /api/zone-arsenal and
 * /api/batter-zones — same pattern SprayChart and StrikeZoneHeatMap use.
 *
 * HOOKS ORDERING — every hook below runs unconditionally, on every render,
 * BEFORE any early return. The two early-return blocks (loading / no-data)
 * sit at the bottom, after all useState/useMemo/useEffect calls.
 *
 * Tailwind v4 + Turbopack note: responsive classes are unreliable here, so
 * layout uses an inline <style> block with plain @media queries.
 */

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  netTilt,
  type PitcherZoneArsenal,
  type ArsenalPitch,
} from '@/lib/pitcher-arsenal'
import { type BatterHotZones } from '@/lib/hot-zones'

const ZONES: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const SHORT_LABEL: Record<string, string> = {
  '1': 'high in', '2': 'high mid', '3': 'high out',
  '4': 'mid in', '5': 'middle', '6': 'mid out',
  '7': 'low in', '8': 'low mid', '9': 'low out',
}

// ─── Option types ────────────────────────────────────────────────────────────

export type PitcherOption = {
  player_id: number
  name: string
  hand: 'L' | 'R' | null
  role: string
  isDefault: boolean
}

export type BatterOption = {
  player_id: number
  name: string
  bat_side: 'L' | 'R' | 'S' | null
  battingOrder: number
  isDefault: boolean
}

export type Side = 'home' | 'away'

type SideData = {
  pitcherOptions: PitcherOption[]
  defaultArsenal: PitcherZoneArsenal | null
  batterOptions: BatterOption[]
  defaultBatterZones: Record<string, BatterHotZones> | null
  teamAbbr: string
}

type Props = {
  isPro: boolean
  home: SideData   // home team pitching, away team batting
  away: SideData   // away team pitching, home team batting
  defaultSide?: Side
}

// ─── Tilt helpers ──────────────────────────────────────────────────────────────

function blendFullMix(arsenal: PitcherZoneArsenal, zone: string) {
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

// ─── Lazy-fetch hooks ──────────────────────────────────────────────────────────

function usePitcherArsenal(
  playerId: number | null,
  defaultPlayerId: number | null,
  defaultArsenal: PitcherZoneArsenal | null,
): { data: PitcherZoneArsenal | null; loading: boolean } {
  const [fetched, setFetched] = useState<Record<number, PitcherZoneArsenal | null>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (playerId == null || playerId === defaultPlayerId) return
    if (fetched[playerId] !== undefined) return
    setLoading(true)
    fetch(`/api/zone-arsenal?playerId=${playerId}`)
      .then(r => r.json())
      .then(data => {
        const all = data?.arsenal?.['all'] ?? null
        setFetched(prev => ({ ...prev, [playerId]: all }))
      })
      .catch(() => setFetched(prev => ({ ...prev, [playerId]: null })))
      .finally(() => setLoading(false))
  }, [playerId, defaultPlayerId, fetched])

  if (playerId == null) return { data: null, loading: false }
  if (playerId === defaultPlayerId) return { data: defaultArsenal, loading: false }
  return { data: fetched[playerId] ?? null, loading: loading && fetched[playerId] === undefined }
}

function useBatterZones(
  playerId: number | null,
  defaultPlayerId: number | null,
  defaultZones: Record<string, BatterHotZones> | null,
): { data: BatterHotZones | null; loading: boolean } {
  const [fetched, setFetched] = useState<Record<number, BatterHotZones | null>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (playerId == null || playerId === defaultPlayerId) return
    if (fetched[playerId] !== undefined) return
    setLoading(true)
    fetch(`/api/batter-zones?playerId=${playerId}`)
      .then(r => r.json())
      .then(data => {
        const all = data?.zones?.['all'] ?? null
        setFetched(prev => ({ ...prev, [playerId]: all }))
      })
      .catch(() => setFetched(prev => ({ ...prev, [playerId]: null })))
      .finally(() => setLoading(false))
  }, [playerId, defaultPlayerId, fetched])

  if (playerId == null) return { data: null, loading: false }
  if (playerId === defaultPlayerId) return { data: defaultZones?.['all'] ?? null, loading: false }
  return { data: fetched[playerId] ?? null, loading: loading && fetched[playerId] === undefined }
}

// ─── Selector dropdown ──────────────────────────────────────────────────────

function Selector<T extends { player_id: number; name: string; isDefault: boolean }>({
  options,
  selectedId,
  onSelect,
  locked,
  roleLabel,
}: {
  options: T[]
  selectedId: number | null
  onSelect: (id: number) => void
  locked: boolean
  roleLabel: (opt: T) => string
}) {
  if (options.length <= 1) return null
  return (
    <select
      className="tt-select"
      value={selectedId ?? ''}
      disabled={locked}
      onChange={(e) => onSelect(Number(e.target.value))}
    >
      {options.map(opt => (
        <option key={opt.player_id} value={opt.player_id}>
          {opt.name}{opt.isDefault ? ' (default)' : ''} — {roleLabel(opt)}
        </option>
      ))}
    </select>
  )
}

// ─── Side toggle ─────────────────────────────────────────────────────────────

function SideToggle({
  side, onChange, locked, homeAbbr, awayAbbr,
}: {
  side: Side
  onChange: (s: Side) => void
  locked: boolean
  homeAbbr: string
  awayAbbr: string
}) {
  return (
    <div className="tt-sidetoggle">
      <button
        type="button"
        className={`tt-sidebtn${side === 'away' ? ' on' : ''}`}
        disabled={locked}
        onClick={() => onChange('away')}
      >
        {awayAbbr} pitching
      </button>
      <button
        type="button"
        className={`tt-sidebtn${side === 'home' ? ' on' : ''}`}
        disabled={locked}
        onClick={() => onChange('home')}
      >
        {homeAbbr} pitching
      </button>
    </div>
  )
}

export default function TaleOfTheTape(props: Props) {
  const { isPro, home, away, defaultSide = 'away' } = props

  // ── ALL HOOKS BELOW THIS LINE RUN UNCONDITIONALLY, EVERY RENDER ──────────

  const [side, setSide] = useState<Side>(defaultSide)

  const activeSideData = side === 'home' ? home : away

  const defaultPitcher = activeSideData.pitcherOptions.find(p => p.isDefault) ?? activeSideData.pitcherOptions[0] ?? null
  const defaultBatter = activeSideData.batterOptions.find(b => b.isDefault) ?? activeSideData.batterOptions[0] ?? null

  const [selectedPitcherId, setSelectedPitcherId] = useState<number | null>(defaultPitcher?.player_id ?? null)
  const [selectedBatterId, setSelectedBatterId] = useState<number | null>(defaultBatter?.player_id ?? null)
  const [active, setActive] = useState<string>('all')

  // When the side toggle flips, reset selections to the new side's defaults.
  useEffect(() => {
    const sd = side === 'home' ? home : away
    const dp = sd.pitcherOptions.find(p => p.isDefault) ?? sd.pitcherOptions[0] ?? null
    const db = sd.batterOptions.find(b => b.isDefault) ?? sd.batterOptions[0] ?? null
    setSelectedPitcherId(dp?.player_id ?? null)
    setSelectedBatterId(db?.player_id ?? null)
    setActive('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side])

  const { data: arsenal, loading: arsenalLoading } = usePitcherArsenal(
    selectedPitcherId, defaultPitcher?.player_id ?? null, activeSideData.defaultArsenal,
  )
  const { data: batterZones, loading: batterLoading } = useBatterZones(
    selectedBatterId, defaultBatter?.player_id ?? null, activeSideData.defaultBatterZones,
  )

  const selectedPitcherMeta = activeSideData.pitcherOptions.find(p => p.player_id === selectedPitcherId) ?? defaultPitcher
  const selectedBatterMeta = activeSideData.batterOptions.find(b => b.player_id === selectedBatterId) ?? defaultBatter

  const pitcherName = selectedPitcherMeta?.name ?? 'Pitcher TBD'
  const pitcherHand = selectedPitcherMeta?.hand ?? null
  const batterName = selectedBatterMeta?.name ?? null
  const batterHand = selectedBatterMeta?.bat_side ?? null

  useEffect(() => { setActive('all') }, [selectedPitcherId])

  const pitchList = useMemo(() => {
    if (!arsenal) return []
    return Object.entries(arsenal.arsenal)
      .map(([code, p]) => ({ code, ...p }))
      .sort((a, b) => (b.usage_pct ?? 0) - (a.usage_pct ?? 0))
  }, [arsenal])

  const isLoading = arsenalLoading || batterLoading
  const hasData = !!arsenal && !!batterZones && pitchList.length > 0

  const effectiveActive = isPro ? active : 'all'

  function tiltFor(zone: string): { net: number; lowSample: boolean; usage: number } {
    if (!arsenal || !batterZones) return { net: 0, lowSample: true, usage: 0 }
    const hitterX = batterZones.zones?.[zone]?.xwoba
    if (effectiveActive === 'all') {
      const { ba, usagePct, low_sample } = blendFullMix(arsenal, zone)
      return { net: netTilt(hitterX, ba, usagePct), lowSample: low_sample, usage: usagePct }
    }
    const pitch = arsenal.arsenal[effectiveActive]
    const cell = pitch?.zones?.[zone]
    return {
      net: netTilt(hitterX, cell?.ba_against, cell?.usage_pct),
      lowSample: cell?.low_sample ?? true,
      usage: cell?.usage_pct ?? 0,
    }
  }

  const read = useMemo(() => {
    if (!hasData || !arsenal) return ''
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
    const pitch = arsenal.arsenal[effectiveActive]
    const verb = tiltFor(best).net > 0.15 ? 'owns' : 'leans on'
    return `The ${pitch.pitch_name.toLowerCase()} ${verb} <b>${SHORT_LABEL[best]}</b> against ${firstName}. Keep it off <b>${SHORT_LABEL[worst]}</b> — that's where this ${batterHand === 'L' ? 'lefty' : 'hitter'} does the damage.`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, arsenal, batterZones, batterName, pitcherName, batterHand, hasData])

  // ── END OF HOOKS. Everything below is safe to gate behind early returns. ──

  if (!isLoading && !hasData) {
    return (
      <div className="tt-empty">
        <div className="tt-stadiumbg"><StadiumBackdrop /></div>
        <div className="tt-mark">⊕ Tale of the Tape</div>
        <SideToggle side={side} onChange={setSide} locked={!isPro} homeAbbr={home.teamAbbr} awayAbbr={away.teamAbbr} />
        <p className="tt-emptytxt">
          Not enough zone data yet for this matchup. Check back closer to game time.
        </p>
        <style>{emptyStyle}</style>
        <style>{selectStyle}</style>
        <style>{toggleStyle}</style>
        <style>{bgStyle}</style>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="tt-empty">
        <div className="tt-stadiumbg"><StadiumBackdrop /></div>
        <div className="tt-mark">⊕ Tale of the Tape</div>
        <p className="tt-emptytxt">Loading matchup…</p>
        <style>{emptyStyle}</style>
        <style>{bgStyle}</style>
      </div>
    )
  }

  const activeCap =
    effectiveActive === 'all'
      ? 'full mix'
      : (arsenal!.arsenal[effectiveActive]?.pitch_name ?? effectiveActive).toLowerCase()

  return (
    <div className="tt-stage">
      <div className="tt-stadiumbg"><StadiumBackdrop /></div>

      <div className="tt-content">
        <div className="tt-head">
          <span className="tt-mark">⊕ Tale of the Tape</span>
          <span className="tt-vs">who wins each zone</span>
        </div>

        <SideToggle side={side} onChange={setSide} locked={!isPro} homeAbbr={home.teamAbbr} awayAbbr={away.teamAbbr} />
        {!isPro && (
          <p className="tt-selectlock tt-sidelock">⊕ Pro — flip sides to see either pitching staff</p>
        )}

        <div className="tt-body">
          {/* Pitcher + arsenal */}
          <div className="tt-fighter">
            <p className="tt-fname">{pitcherName}</p>
            <p className="tt-frole">{pitcherHand ? `${pitcherHand}HP` : 'P'} · on the mound</p>

            {activeSideData.pitcherOptions.length > 1 && (
              <Selector
                options={activeSideData.pitcherOptions}
                selectedId={selectedPitcherId}
                onSelect={setSelectedPitcherId}
                locked={!isPro}
                roleLabel={(p) => p.role}
              />
            )}
            {!isPro && activeSideData.pitcherOptions.length > 1 && (
              <p className="tt-selectlock">⊕ Pro — pick any arm on the staff</p>
            )}

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
                const bg = lowSample ? '#E8E3DC' : cellRgb(net)
                const strong = Math.abs(net) > 0.16 && !lowSample
                return (
                  <div key={z} className={`tt-cell${lowSample ? ' tt-cell-empty' : ''}`} style={{ background: bg }}>
                    <span className="tt-cnet" style={{ color: lowSample ? '#A39B8E' : strong ? '#fff' : '#9a9a9a' }}>
                      {lowSample ? '–' : `${net > 0 ? '+' : ''}${net.toFixed(2)}`}
                    </span>
                    <span className="tt-clab" style={{ color: lowSample ? '#A39B8E' : undefined }}>{SHORT_LABEL[z]}</span>
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

            {activeSideData.batterOptions.length > 1 && (
              <Selector
                options={activeSideData.batterOptions}
                selectedId={selectedBatterId}
                onSelect={setSelectedBatterId}
                locked={!isPro}
                roleLabel={(b) => `#${b.battingOrder} in order`}
              />
            )}
            {!isPro && activeSideData.batterOptions.length > 1 && (
              <p className="tt-selectlock">⊕ Pro — pick anyone in the lineup</p>
            )}

            <HitterProfile zones={batterZones!} />
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
              <span className="tt-pmark">⊕ Pro</span> — tap a pitch, flip sides, or pick any matchup on the field
            </Link>
          </div>
        )}
      </div>

      <style>{stageStyle}</style>
      <style>{selectStyle}</style>
      <style>{toggleStyle}</style>
      <style>{bgStyle}</style>
    </div>
  )
}

// ─── Stadium backdrop ───────────────────────────────────────────────────────
//
// Flat-illustrated daytime ballpark: sky + sun glow, skyline silhouette,
// upper deck with light towers, a generic scoreboard panel, grass + infield
// dirt diamond. Brand colors only (Edge Orange accents, muted stadium
// greens/browns elsewhere) — deliberately not photographic so it sits
// naturally alongside the rest of the flat, zero-radius design system.
// Sits absolutely behind .tt-content; a vignette keeps grid/text readable.

function StadiumBackdrop() {
  return (
    <svg viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5B8FB0" />
          <stop offset="60%" stopColor="#8FB8C9" />
          <stop offset="100%" stopColor="#C9D9C2" />
        </linearGradient>
        <linearGradient id="tt-vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.30" />
          <stop offset="30%" stopColor="#000000" stopOpacity="0.04" />
          <stop offset="65%" stopColor="#000000" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="600" height="420" fill="url(#tt-sky)" />

      <g opacity="0.9">
        <circle cx="90" cy="60" r="22" fill="#FFFFFF" opacity="0.5" />
        <circle cx="115" cy="65" r="16" fill="#FFFFFF" opacity="0.5" />
        <circle cx="480" cy="45" r="18" fill="#FFFFFF" opacity="0.4" />
        <circle cx="505" cy="50" r="13" fill="#FFFFFF" opacity="0.4" />
      </g>

      <g fill="#7C92A8" opacity="0.55">
        <rect x="20" y="70" width="22" height="50" />
        <rect x="48" y="55" width="18" height="65" />
        <rect x="72" y="80" width="26" height="40" />
        <rect x="500" y="60" width="20" height="60" />
        <rect x="525" y="75" width="24" height="45" />
        <rect x="555" y="50" width="18" height="70" />
        <rect x="578" y="68" width="20" height="52" />
      </g>

      <g opacity="0.85">
        <rect x="0" y="0" width="600" height="105" fill="#141414" />
        <rect x="40" y="22" width="3" height="83" fill="#0a0a0a" />
        <rect x="160" y="17" width="3" height="88" fill="#0a0a0a" />
        <rect x="440" y="17" width="3" height="88" fill="#0a0a0a" />
        <rect x="555" y="22" width="3" height="83" fill="#0a0a0a" />
        <circle cx="41" cy="20" r="6" fill="#3a3a3a" />
        <circle cx="161" cy="15" r="6" fill="#3a3a3a" />
        <circle cx="441" cy="15" r="6" fill="#3a3a3a" />
        <circle cx="556" cy="20" r="6" fill="#3a3a3a" />
      </g>



      <rect x="0" y="112" width="600" height="58" fill="#22281b" />
      <g opacity="0.18">
        <rect x="0" y="116" width="600" height="4" fill="#000" />
        <rect x="0" y="128" width="600" height="4" fill="#000" />
        <rect x="0" y="140" width="600" height="4" fill="#000" />
        <rect x="0" y="152" width="600" height="4" fill="#000" />
        <rect x="0" y="164" width="600" height="4" fill="#000" />
      </g>

      <path d="M0,170 L0,420 L600,420 L600,170 Q300,138 0,170 Z" fill="#4C7A35" />
      <path d="M170,420 L300,250 L430,420 Z" fill="#5C8C42" opacity="0.75" />
      <path d="M230,420 Q300,300 370,420 Z" fill="#9C7B4E" />
      <path d="M260,420 L300,330 L340,420 Z" fill="#AD8C5C" />
      <circle cx="300" cy="330" r="9" fill="#BD9C68" />

      <g fill="#9C7B4E">
        <rect x="240" y="408" width="16" height="12" rx="2" />
        <rect x="344" y="408" width="16" height="12" rx="2" />
        <rect x="292" y="358" width="16" height="12" rx="2" transform="rotate(45 300 364)" />
      </g>

      <rect x="0" y="0" width="600" height="420" fill="url(#tt-vignette)" />
    </svg>
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

const bgStyle = `
  .tt-stadiumbg { position:absolute; inset:0; overflow:hidden; z-index:0; }
  .tt-stadiumbg svg { width:100%; height:100%; display:block; }
  .tt-content { position:relative; z-index:1; }
`

const emptyStyle = `
  .tt-empty { background:#1A1A1A; color:#FAF8F3; padding:20px 18px; position:relative; overflow:hidden; }
  .tt-empty::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:#FF5722; z-index:2; }
  .tt-mark { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; position:relative; z-index:1; }
  .tt-emptytxt { font-family:var(--font-fraunces,serif); font-style:italic; font-size:14px; color:#FAF8F3; margin-top:10px; position:relative; z-index:1; }
`

const selectStyle = `
  .tt-select {
    width:100%; margin:8px 0 12px; padding:6px 8px;
    background:rgba(0,0,0,0.55); color:#FAF8F3; border:1px solid #555;
    font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px;
  }
  .tt-select:disabled { opacity:.5; cursor:not-allowed; }
  .tt-selectlock { font-size:8px; letter-spacing:.1em; text-transform:uppercase; color:#FF5722; margin:-6px 0 10px; }
  .tt-sidelock { text-align:center; margin:6px 0 14px; }
`

const toggleStyle = `
  .tt-sidetoggle { display:flex; gap:6px; justify-content:center; margin-bottom:6px; }
  .tt-sidebtn {
    font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px;
    letter-spacing:.06em; text-transform:uppercase;
    padding:7px 16px; border:1px solid #555; background:rgba(0,0,0,0.4);
    color:#A3A3A3; cursor:pointer; transition:border-color .15s,background .15s,color .15s;
  }
  .tt-sidebtn.on { border-color:#FF5722; background:rgba(255,87,34,0.18); color:#FAF8F3; }
  .tt-sidebtn:disabled { cursor:not-allowed; opacity:.6; }
`

const stageStyle = `
  .tt-stage { position:relative; overflow:hidden; color:#FAF8F3; padding:22px 18px 26px; font-family:'JetBrains Mono',ui-monospace,monospace; }
  .tt-stage::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:#FF5722; z-index:2; }
  .tt-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px; }
  .tt-mark { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; }
  .tt-vs { font-family:'Bebas Neue',sans-serif; font-size:14px; letter-spacing:.2em; color:#D8D8D8; }
  .tt-body { display:grid; grid-template-columns:1fr; gap:18px; margin-top:14px; }
  .tt-fighter { text-align:center; }
  .tt-fname { font-family:var(--font-fraunces,serif); font-weight:600; font-size:20px; line-height:1.05; margin:0 0 2px; }
  .tt-frole { font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#D8D8D8; margin:0 0 12px; }
  .tt-arsenal { display:flex; flex-direction:column; gap:6px; }
  .tt-pitch { display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid #555; background:rgba(0,0,0,0.45); cursor:pointer; transition:border-color .15s,background .15s; text-align:left; width:100%; position:relative; }
  .tt-pitch:hover:not(.static):not(.locked) { border-color:#888; }
  .tt-pitch.on { border-color:#FF5722; background:rgba(255,87,34,0.22); }
  .tt-pitch.static { cursor:default; }
  .tt-pitch.locked { cursor:default; opacity:.65; }
  .tt-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .tt-pl { flex:1; line-height:1.25; }
  .tt-pl b { display:block; font-weight:500; font-size:11px; color:#FAF8F3; }
  .tt-pl span { font-size:9px; color:#CFCFCF; }
  .tt-lock { font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:#FF5722; }
  .tt-zonewrap { position:relative; }
  .tt-zonecap { text-align:center; font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:#D8D8D8; margin-bottom:9px; }
  .tt-zone { position:relative; width:100%; max-width:280px; margin:0 auto; aspect-ratio:1; }
  .tt-grid { position:absolute; inset:0; display:grid; grid-template-columns:repeat(3,1fr); gap:3px; }
  .tt-cell { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:background .35s ease; overflow:hidden; }
  .tt-cnet { font-family:'Bebas Neue',sans-serif; font-size:24px; line-height:.9; transition:color .35s; }
  .tt-clab { font-size:8px; letter-spacing:.08em; text-transform:uppercase; margin-top:2px; opacity:.85; color:#E2E2E2; }
  .tt-plate { position:absolute; left:50%; bottom:-20px; transform:translateX(-50%); width:60px; height:15px; }
  .tt-readbar { margin-top:22px; padding-top:18px; border-top:1px solid rgba(255,255,255,0.25); }
  .tt-readlab { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:#FF5722; margin-bottom:8px; }
  .tt-readtxt { font-family:var(--font-fraunces,serif); font-size:16px; line-height:1.55; color:#FAF8F3; margin:0; min-height:50px; }
  .tt-readtxt b { color:#FDE047; font-weight:600; }
  .tt-legend { display:flex; justify-content:center; gap:16px; margin-top:15px; font-size:9px; color:#D8D8D8; letter-spacing:.04em; flex-wrap:wrap; }
  .tt-sw { width:11px; height:11px; display:inline-block; vertical-align:-1px; margin-right:4px; }
  .tt-prohint { margin-top:14px; text-align:center; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:#CFCFCF; }
  .tt-prohint a { color:#CFCFCF; text-decoration:none; }
  .tt-prohint .tt-pmark { color:#FF5722; }
  @media (min-width:600px) {
    .tt-body { grid-template-columns:130px 1fr 130px; align-items:start; }
  }
`