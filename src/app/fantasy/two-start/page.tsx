import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getTwoStartPitchers, type TwoStartPitcher } from '@/lib/fantasy-two-start'
import { getCurrentSubscriber } from '@/lib/auth'

export const revalidate = 3600
export const metadata = {
  title: 'Two-Start Pitchers · The Fantasy Desk · The Edge',
  description: 'Every pitcher scheduled for two starts this week, ranked by matchup difficulty. Critical for weekly H2H fantasy leagues.',
}

const TIER_META = {
  strong:  { label: 'Strong',  color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-500', desc: 'Quality arm + favourable matchups' },
  viable:  { label: 'Viable',  color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-500',   desc: 'Solid play with some risk' },
  mixed:   { label: 'Mixed',   color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-500',  desc: 'One great start, one tough' },
  avoid:   { label: 'Avoid',   color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-500',     desc: 'Quality dip + difficult slate' },
} as const

export default async function TwoStartPage() {
  const [pitchers, subscriber] = await Promise.all([
    getTwoStartPitchers(),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const tierCounts = {
    strong: pitchers.filter(p => p.tier === 'strong').length,
    viable: pitchers.filter(p => p.tier === 'viable').length,
    mixed:  pitchers.filter(p => p.tier === 'mixed').length,
    avoid:  pitchers.filter(p => p.tier === 'avoid').length,
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* MASTHEAD */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-stone-400">
          <div className="flex items-center gap-4">
            <Link href="/fantasy" className="text-orange-600 hover:text-orange-700 transition">← Fantasy Desk</Link>
            <span>Two-Start Pitchers</span>
          </div>
          <span className="text-stone-300">7-Day Window</span>
        </div>
      </div>

      {/* TITLE BLOCK */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 mb-2">
            § Two-Start Pitchers
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Twice the volume<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Every pitcher scheduled for two starts this week — ranked by matchup difficulty.
          </p>
        </div>
      </div>

      {/* TIER COUNTS */}
      <div className="border-b border-stone-200">
        <div className="max-w-5xl mx-auto grid grid-cols-4">
          <TierCell label="Strong" count={tierCounts.strong} color="text-emerald-600" />
          <TierCell label="Viable" count={tierCounts.viable} color="text-amber-600"   />
          <TierCell label="Mixed"  count={tierCounts.mixed}  color="text-orange-600"  />
          <TierCell label="Avoid"  count={tierCounts.avoid}  color="text-red-600"     />
        </div>
      </div>

      {/* EXPLAINER */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-lg border border-stone-200 p-5 sm:p-6 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            § Why two-start weeks matter
          </div>
          <p className="text-sm text-stone-600 leading-relaxed">
            In weekly H2H fantasy leagues, every two-start pitcher is potentially worth twice the points
            of a one-start arm. <span className="text-stone-900 font-semibold">But not all two-start weeks are equal.</span>
            {' '}A &quot;strong&quot; tier pitcher gets quality matchups in both outings. A &quot;mixed&quot; tier might dominate
            one game and get rocked the next. We score each start individually and combine them.
          </p>
        </div>
      </div>

      {/* PITCHERS LIST */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 space-y-3">
        {pitchers.length === 0 ? (
          <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
            No two-start pitchers in the upcoming 7 days. Schedule confirms 24-48 hrs out.
          </div>
        ) : (
          pitchers.map(p => <PitcherRow key={p.playerId} pitcher={p} />)
        )}
      </div>

      {/* PRO UPSELL */}
      {!isPro && pitchers.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">
          <section className="bg-stone-900 rounded-lg p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  ⊕ Pro Tier · £4/mo · Founding 100
                </div>
                <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                  Get next week&apos;s 2-start preview.
                </h3>
                <p className="text-sm text-stone-400 font-serif">
                  Pro members see two-week projections plus bullpen-fatigue context per start.
                </p>
              </div>
              <Link href="/pricing" className="shrink-0 text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-6 py-3 hover:bg-yellow-200 transition whitespace-nowrap rounded">
                See Pro →
              </Link>
            </div>
          </section>
        </div>
      )}

      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/fantasy" className="hover:text-stone-600 transition">Fantasy Desk</Link>
            <Link href="/fantasy/streamers" className="hover:text-stone-600 transition">Streamers</Link>
            <Link href="/fantasy/platforms" className="hover:text-stone-600 transition">Platforms</Link>
            <Link href="/tonight" className="hover:text-stone-600 transition">Tonight</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}

function TierCell({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="py-4 text-center border-r border-stone-200 last:border-r-0">
      <div className={`font-serif text-3xl font-semibold leading-none ${color}`}>{count}</div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">{label}</div>
    </div>
  )
}

function PitcherRow({ pitcher }: { pitcher: TwoStartPitcher }) {
  const meta = TIER_META[pitcher.tier]
  return (
    <div className={`bg-white rounded-lg shadow-sm border ${meta.border} border-l-[3px] overflow-hidden`}>
      <div className="px-4 sm:px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif font-semibold text-base text-stone-900 leading-tight">{pitcher.playerName}</span>
            <span className="font-mono text-[10px] text-stone-500 tracking-wide">{pitcher.teamName}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 flex-wrap font-mono text-[11px]">
            {pitcher.era != null && <span><span className="text-stone-400">ERA</span> <span className="font-bold text-stone-700">{pitcher.era.toFixed(2)}</span></span>}
            {pitcher.fip != null && <span><span className="text-stone-400">FIP</span> <span className="font-bold text-stone-700">{pitcher.fip.toFixed(2)}</span></span>}
            {pitcher.k9  != null && <span><span className="text-stone-400">K/9</span> <span className="font-bold text-stone-700">{pitcher.k9.toFixed(1)}</span></span>}
            {pitcher.whip!= null && <span><span className="text-stone-400">WHIP</span> <span className="font-bold text-stone-700">{pitcher.whip.toFixed(2)}</span></span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono text-[10px] tracking-widest uppercase font-bold ${meta.color}`}>{meta.label}</div>
          <div className={`font-['Bebas_Neue',sans-serif] text-3xl leading-none ${meta.color}`}>{pitcher.combinedScore}</div>
        </div>
      </div>

      <div className={`px-4 sm:px-5 py-3 ${meta.bg} border-t ${meta.border} border-opacity-30`}>
        <div className="font-mono text-[8px] tracking-widest uppercase text-stone-500 mb-2">
          The Two Starts · {meta.desc}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {pitcher.starts.map((start, i) => (
            <div key={i} className="bg-white rounded p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-stone-500">
                  {start.displayDate} · {start.gameTime}
                </span>
                <span className={`font-mono text-[10px] font-bold ${
                  start.matchupScore >= 65 ? 'text-emerald-600' :
                  start.matchupScore >= 50 ? 'text-amber-600' :
                  start.matchupScore >= 40 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {start.matchupScore}
                </span>
              </div>
              <div className="font-serif text-sm text-stone-900">
                {start.isHome ? 'vs' : '@'} {start.opponent}
              </div>
              <div className="font-mono text-[10px] text-stone-500 mt-1">
                {start.oppWrcPlus != null && <span>wRC+ {start.oppWrcPlus} · </span>}
                {start.oppRpgL30 != null && <span>{start.oppRpgL30.toFixed(1)} R/G</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}