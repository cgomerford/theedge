// src/components/LeverageBoard.tsx
//
// "Leverage Board" — the real biggest win-probability swings of a team's
// real season: the single at-bat in each candidate game where their real
// odds of winning moved the most. Not a modeled "clutch" score — every
// number here comes straight off MLB's own real per-at-bat win probability
// feed (src/lib/leverage-board.ts), the same endpoint already powering
// individual game pages in this app.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import { teamLogoUrl } from '@/lib/mlb'
import { getLeverageMoments, type LeverageMoment } from '@/lib/leverage-board'

const GOOD = '#059669'
const BAD = '#DC2626'
const SEASON = new Date().getFullYear()

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00Z')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function inningLabel(inning: number, half: 'top' | 'bottom') {
  return `${half === 'top' ? 'Top' : 'Bot'} ${inning}${inning === 1 ? 'st' : inning === 2 ? 'nd' : inning === 3 ? 'rd' : 'th'}`
}

function MomentRow({ m, teamId }: { m: LeverageMoment; teamId: number }) {
  const opponent = MLB_TEAMS.find(t => t.name === m.opponentName)
  const rose = m.winPctAfter > m.winPctBefore
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#F0EFEC] last:border-0">
      <div className="flex items-center gap-1.5 shrink-0" style={{ width: 96 }}>
        <img src={teamLogoUrl(teamId)} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />
        <span className="text-[9px] text-[#8A8577]">vs</span>
        {opponent && <img src={teamLogoUrl(opponent.id)} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-[#1A1A1A]">{fmtDate(m.date)}</span>
          <span className="text-[10px] text-[#8A8577]">{inningLabel(m.inning, m.halfInning)}{m.innings > 9 ? ` · F/${m.innings}` : ''}</span>
          <span className="text-[10px] font-bold" style={{ color: m.win ? GOOD : BAD }}>
            {m.win ? 'W' : 'L'} {m.runsFor}-{m.runsAgainst}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="text-[9px] font-mono text-[#B5B0A3] tabular-nums w-8 text-right">{m.winPctBefore.toFixed(0)}%</div>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: '#F0EFEC', position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.min(m.winPctBefore, m.winPctAfter)}%`,
                width: `${Math.abs(m.winPctAfter - m.winPctBefore)}%`,
                background: rose ? GOOD : BAD,
              }}
            />
          </div>
          <div className="text-[9px] font-mono text-[#1A1A1A] font-bold tabular-nums w-8">{m.winPctAfter.toFixed(0)}%</div>
        </div>
      </div>
      <div className="text-right shrink-0" style={{ width: 56 }}>
        <div className="text-[16px] font-black leading-none" style={{ color: rose ? GOOD : BAD }}>
          {rose ? '+' : '−'}{m.swingPct.toFixed(0)}
        </div>
        <div className="text-[8px] text-[#8A8577] uppercase tracking-wide">win% swing</div>
      </div>
    </div>
  )
}

export default function LeverageBoard() {
  const teamOptions = useMemo(() => [...MLB_TEAMS].sort((a, b) => a.short.localeCompare(b.short)), [])
  const [teamId, setTeamId] = useState<number>(teamOptions[0]?.id)
  const [cache, setCache] = useState<Record<number, LeverageMoment[]>>({})

  useEffect(() => {
    if (cache[teamId] !== undefined) return
    getLeverageMoments(teamId, SEASON).then(moments => setCache(prev => ({ ...prev, [teamId]: moments })))
  }, [teamId, cache])

  const moments = cache[teamId]
  const loading = moments === undefined

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-[13px] font-serif font-bold text-[#1A1A1A]">Leverage board</div>
          <div className="text-[10px] text-[#8A8577] mt-0.5 max-w-[440px]">
            The season&apos;s real biggest single-play win-probability swings — pulled from MLB&apos;s own per-at-bat odds, not a modeled clutch score. Drawn from real one-run and extra-inning games.
          </div>
        </div>
        <select value={teamId} onChange={e => setTeamId(Number(e.target.value))} className="text-[11px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer">
          {teamOptions.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">Scanning close games for the biggest swings…</div>
      ) : moments.length === 0 ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">No qualifying close games yet this season.</div>
      ) : (
        <div>
          {moments.slice(0, 6).map(m => <MomentRow key={m.gamePk} m={m} teamId={teamId} />)}
        </div>
      )}
    </div>
  )
}
