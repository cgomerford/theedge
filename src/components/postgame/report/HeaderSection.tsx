// src/components/postgame/report/HeaderSection.tsx
//
// §1 Final — the score band, the plain read, the win-probability low point, the series line,
// and a small linescore. Everything comes from the feed; the read is built from facts only
// (margin, walk-off, extras, comeback, how deep the winner's starter went).

import { getPostData } from '@/lib/postgame/data'
import { buildHeader, type Header } from '@/lib/postgame/recap'
import { teamLogoUrl } from '@/lib/mlb'
import type { PostgameContext } from './types'

function SideBlock({ h, s }: { h: Header; s: 'away' | 'home' }) {
  const t = h[s], won = h.winner === s
  return (
    <div className={`flex items-center gap-3 ${s === 'home' ? 'flex-row-reverse text-right' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogoUrl(t.id)} alt="" className="w-14 h-14 object-contain shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400">{s === 'away' ? 'Away' : 'Home'}</p>
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{t.name}</p>
      </div>
      <p className={`font-mono font-bold leading-none px-2 ${won ? 'text-stone-900' : 'text-stone-400'}`} style={{ fontSize: 56 }}>{t.runs}</p>
    </div>
  )
}

export default async function HeaderSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">The final box score isn&apos;t available right now.</p>
  const h = buildHeader(data)
  const cols = h.innings
  return (
    <div className="space-y-5">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <SideBlock h={h} s="away" />
        <div className="text-center">
          <span className="inline-block text-[11px] font-mono font-bold uppercase tracking-widest px-3 py-1 bg-stone-900 text-white">{h.finalText}</span>
          {h.series && <p className="mt-1.5 text-[10px] font-mono uppercase tracking-wider text-orange-600 font-semibold">{h.series}</p>}
        </div>
        <SideBlock h={h} s="home" />
      </div>

      <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
        <p className="text-[15px] font-serif text-stone-900 leading-snug">{h.read}</p>
        {h.wpNote && <p className="text-[12px] font-sans text-stone-600 mt-1">{h.wpNote}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="text-[11px] w-full min-w-[520px]">
          <thead>
            <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
              <th className="text-left font-semibold py-1 w-16" />
              {Array.from({ length: cols }, (_, i) => <th key={i} className="font-semibold w-7">{i + 1}</th>)}
              <th className="font-semibold w-9 text-stone-700">R</th><th className="font-semibold w-9">H</th><th className="font-semibold w-9">E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map((s) => (
              <tr key={s} className="text-right text-stone-700 border-b border-stone-100 last:border-0">
                <td className="text-left py-1 font-mono font-bold">{h[s].abbr}</td>
                {h.linescore[s].map((r, i) => <td key={i} className={`font-mono ${r == null ? 'text-stone-300' : r > 0 ? 'text-stone-900 font-semibold' : 'text-stone-300'}`}>{r == null ? 'x' : r}</td>)}
                <td className="font-mono font-bold text-stone-900">{h[s].runs}</td><td className="font-mono">{h[s].hits}</td><td className="font-mono">{h[s].errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11px] font-sans text-stone-600">
        {h.venue && <div><dt className="inline font-mono uppercase tracking-wider text-[9px] text-stone-400 mr-1.5">Venue</dt><dd className="inline">{h.venue}</dd></div>}
        {h.attendance != null && <div><dt className="inline font-mono uppercase tracking-wider text-[9px] text-stone-400 mr-1.5">Attendance</dt><dd className="inline">{h.attendance.toLocaleString()}</dd></div>}
        {h.duration && <div><dt className="inline font-mono uppercase tracking-wider text-[9px] text-stone-400 mr-1.5">Time</dt><dd className="inline">{h.duration}</dd></div>}
        {h.weather && <div><dt className="inline font-mono uppercase tracking-wider text-[9px] text-stone-400 mr-1.5">Weather</dt><dd className="inline">{h.weather}</dd></div>}
        {(h.decisions.w || h.decisions.l) && <div><dt className="inline font-mono uppercase tracking-wider text-[9px] text-stone-400 mr-1.5">Pitchers</dt><dd className="inline">{[h.decisions.w && `W ${h.decisions.w}`, h.decisions.l && `L ${h.decisions.l}`, h.decisions.s && `S ${h.decisions.s}`].filter(Boolean).join(' · ')}</dd></div>}
      </dl>
    </div>
  )
}
