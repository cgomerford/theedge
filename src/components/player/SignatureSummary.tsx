'use client'

import { useEffect, useState } from 'react'
import type { PlayerIdentity } from '@/lib/player-page'
import type { BatterStatcastFull, PitcherStatcastFull } from '@/lib/player-statcast-full'
import { buildBatterSignature, buildPitcherSignature, type SignatureDial } from '@/lib/player-signature'

export default function SignatureSummary({
  playerId, identity,
}: {
  playerId: number
  identity: PlayerIdentity
}) {
  const [loading, setLoading] = useState(true)
  const [dials, setDials] = useState<SignatureDial[]>([])
  const [oneLine, setOneLine] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const type = identity.isPitcher ? 'pitcher' : 'batter'
    fetch(`/api/player/statcast-full/${playerId}?type=${type}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: BatterStatcastFull | PitcherStatcastFull) => {
        if (cancelled) return
        if (identity.isPitcher) {
          const p = data as PitcherStatcastFull
          const sig = buildPitcherSignature({
            xera: p.xera,
            whiff_pct: p.whiff_pct,
            k_bb_pct: p.k_bb_pct,
            ranks: {
              xera: p.ranks.xera,
              whiff_pct: p.ranks.whiff_pct,
              // K-BB% doesn't have its own Savant rank; use k_pct as proxy signal
              k_bb_pct: p.ranks.k_pct,
            },
          })
          setDials(sig.dials)
          setOneLine(sig.oneLine)
        } else {
          const b = data as BatterStatcastFull
          const sig = buildBatterSignature({
            positionAbbr: identity.primaryPosition.abbreviation,
           statcast: {
  xba: b.xba, xslg: b.xslg, xwoba: b.xwoba,
  barrel_pct: b.barrel_pct, hard_hit_pct: b.hard_hit_pct,
  sweet_spot_pct: b.sweet_spot_pct,
  avg_exit_velocity: b.avg_exit_velocity,
  max_exit_velocity: b.max_exit_velocity,
  chase_pct: b.chase_pct,
},
            ranks: {
              xwoba: b.ranks.xwoba,
              barrel_pct: b.ranks.barrel_pct,
              chase_pct: b.ranks.chase_pct,
            },
            sprintSpeed: b.sprint_speed,
            sprintSpeedRank: b.ranks.sprint_speed,
          })
          setDials(sig.dials)
          setOneLine(sig.oneLine)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerId, identity.isPitcher, identity.primaryPosition.abbreviation])

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
        ⊕ Signature
      </div>

      {loading ? (
        <p className="text-xs font-serif italic text-stone-400 py-6">Loading Statcast…</p>
      ) : (
        <>
          {oneLine && (
            <p className="font-serif text-base sm:text-lg text-stone-800 leading-relaxed mb-5">
              {oneLine}
            </p>
          )}
          {dials.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 sm:gap-5">
              {dials.map((d, i) => (
                <Dial key={i} dial={d} />
              ))}
            </div>
          ) : (
            <p className="text-xs font-serif italic text-stone-400">
              Below qualifier threshold for Statcast rankings.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Dial({ dial }: { dial: SignatureDial }) {
  const pct = dial.percentile
  const color = pct == null ? '#a8a29e' : pct >= 75 ? '#059669' : pct >= 50 ? '#f59e0b' : pct >= 25 ? '#f97316' : '#dc2626'
  const width = pct == null ? 0 : pct

  return (
    <div className="bg-stone-50 border border-stone-100 rounded-lg p-3 sm:p-4">
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">
        {dial.label}
      </div>
      <div className="text-2xl sm:text-3xl font-mono font-bold text-stone-900 tabular-nums leading-none">
        {dial.value}
      </div>
      <div className="mt-3 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[9px] font-mono text-stone-400">{dial.reference}</span>
        <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color }}>
          {pct == null ? '—' : `${Math.round(pct)}`}
        </span>
      </div>
    </div>
  )
}