'use client'

/**
 * src/components/FantasyBullpenWatch.tsx
 *
 * Bullpen availability matrix for the Fantasy tab.
 * Shows Green/Yellow/Red status for both teams' bullpens.
 * Data comes from components_raw — no new DB fields needed.
 */

type BullpenData = {
  era: number | null
  ip_yesterday: number | null
  closer_available: boolean | null
}

type BullpenWatchProps = {
  homeAbbr: string
  awayAbbr: string
  homeBullpen: BullpenData
  awayBullpen: BullpenData
}

// ─── Fatigue logic ─────────────────────────────────────────────────────────────

type FatigueLevel = 'fresh' | 'used' | 'taxed' | 'gassed'

function fmtIP(ip: number | null): string {
  if (ip === null) return '—'
  const whole = Math.floor(ip)
  const outs = Math.round((ip - whole) * 3)
  return `${whole}.${outs}`
}
function getFatigue(ipYesterday: number | null): FatigueLevel {
  if (ipYesterday === null) return 'used' // default to caution
  if (ipYesterday >= 5) return 'gassed'
  if (ipYesterday >= 3) return 'taxed'
  if (ipYesterday >= 1) return 'used'
  return 'fresh'
}

const FATIGUE_CONFIG: Record<FatigueLevel, { dot: string; label: string; text: string; bg: string }> = {
  fresh:  { dot: 'bg-emerald-500', label: 'Fresh',  text: 'text-emerald-700', bg: 'bg-emerald-50' },
  used:   { dot: 'bg-yellow-400',  label: 'Used',   text: 'text-yellow-700',  bg: 'bg-yellow-50'  },
  taxed:  { dot: 'bg-orange-500',  label: 'Taxed',  text: 'text-orange-700',  bg: 'bg-orange-50'  },
  gassed: { dot: 'bg-red-500',     label: 'Gassed', text: 'text-red-700',     bg: 'bg-red-50'     },
}

function fantasyImpact(fatigue: FatigueLevel, closerAvailable: boolean | null): string {
  if (fatigue === 'fresh' && closerAvailable !== false) return 'Full save/hold upside — ideal for streamers.'
  if (fatigue === 'gassed') return 'Depleted pen. Manager may lean on SP longer — or blow leads.'
  if (fatigue === 'taxed' && closerAvailable === false) return 'Closer unavailable. Thin save opportunities.'
  if (closerAvailable === false) return 'Closer unavailable. Save chance redistributed or lost.'
  if (fatigue === 'used') return 'Some usage yesterday. Monitor lineup and pitch counts.'
  return 'Moderate freshness. Standard save/hold outlook.'
}

// ─── Single team bullpen panel ────────────────────────────────────────────────

function BullpenPanel({
  abbr,
  data,
}: {
  abbr: string
  data: BullpenData
}) {
  const fatigue = getFatigue(data.ip_yesterday)
  const config  = FATIGUE_CONFIG[fatigue]

  return (
    <div className={`rounded-xl border border-stone-200 overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          § {abbr} Bullpen
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${config.dot}`} />
          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider text-white`}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-stone-100 bg-white">
        <div className="px-3 py-2.5 text-center">
          <div className="text-base font-mono font-bold text-[#1A1A1A]">
            {data.era !== null ? data.era.toFixed(2) : '—'}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mt-0.5">ERA</div>
        </div>
        <div className="px-3 py-2.5 text-center">
         <div className="text-base font-mono font-bold text-[#1A1A1A]">
  {fmtIP(data.ip_yesterday)}
</div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mt-0.5">IP Yest.</div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className={`text-base font-mono font-bold ${
            data.closer_available === true  ? 'text-emerald-600' :
            data.closer_available === false ? 'text-red-600'     : 'text-stone-400'
          }`}>
            {data.closer_available === true  ? 'YES' :
             data.closer_available === false ? 'NO'  : '?'}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mt-0.5">Closer</div>
        </div>
      </div>

      {/* Fantasy impact note */}
      <div className={`px-4 py-2.5 ${config.bg} border-t border-stone-100`}>
        <p className="text-[11px] font-mono text-stone-600 leading-snug">
          {fantasyImpact(fatigue, data.closer_available)}
        </p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FantasyBullpenWatch({
  homeAbbr,
  awayAbbr,
  homeBullpen,
  awayBullpen,
}: BullpenWatchProps) {
  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-[#FF5722] font-bold mb-4">
        § Bullpen Watch
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BullpenPanel abbr={awayAbbr} data={awayBullpen} />
        <BullpenPanel abbr={homeAbbr} data={homeBullpen} />
      </div>
    </section>
  )
}
