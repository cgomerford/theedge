// src/components/DeserveToWinWaterfall.tsx
//
// "Deserve-to-win waterfall" — walks from a real Pythagorean-expected win
// total to the real actual record, through two real "luck" components
// (see src/lib/deserve-to-win.ts). Click the close-game bar to see the
// actual games that make it up. Below the waterfall, a real league-wide
// sort: who's owed wins by their run differential, who's already banked
// them — this team highlighted.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import { teamLogoUrl } from '@/lib/mlb'
import type { MLBDivisionStandings } from '@/lib/mlb-homepage'
import { getTeamGameLog } from '@/lib/season-shape'
import { computeLeagueLuck, computeCloseGameSplit, type CloseGameSplit } from '@/lib/deserve-to-win'

const GOOD = '#059669'
const BAD = '#DC2626'
const ORANGE = '#FF5722'
const NEUTRAL = '#8A8577'
const SEASON = new Date().getFullYear()

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00Z')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fmtWins(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1)
}

type Segment = { label: string; from: number; to: number; color: string; clickable?: boolean; detail: string }

function WaterfallBar({ seg, maxScale, active, onClick }: { seg: Segment; maxScale: number; active: boolean; onClick?: () => void }) {
  const left = Math.min(seg.from, seg.to) / maxScale * 100
  const width = Math.abs(seg.to - seg.from) / maxScale * 100
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-bold text-[#1A1A1A]">{seg.label}</span>
        <span className="text-[9.5px] text-[#8A8577]">{seg.detail}</span>
      </div>
      <div
        onClick={onClick}
        style={{ position: 'relative', height: 20, background: '#F5F3EE', borderRadius: 5, cursor: onClick ? 'pointer' : 'default', border: active ? `1.5px solid ${seg.color}` : '1.5px solid transparent' }}
      >
        <div style={{ position: 'absolute', top: 2, bottom: 2, left: `${left}%`, width: `${Math.max(width, 0.5)}%`, background: seg.color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

export default function DeserveToWinWaterfall({ standings }: { standings: MLBDivisionStandings[] }) {
  const teamOptions = useMemo(() => [...MLB_TEAMS].sort((a, b) => a.short.localeCompare(b.short)), [])
  const [teamId, setTeamId] = useState<number>(teamOptions[0]?.id)
  const [gameLogCache, setGameLogCache] = useState<Record<number, Awaited<ReturnType<typeof getTeamGameLog>>>>({})
  const [showCloseGames, setShowCloseGames] = useState(false)

  const leagueLuck = useMemo(() => computeLeagueLuck(standings), [standings])
  const teamLuck = leagueLuck.find(t => t.teamId === teamId)

  useEffect(() => {
    if (gameLogCache[teamId] !== undefined) return
    getTeamGameLog(teamId, SEASON).then(games => setGameLogCache(prev => ({ ...prev, [teamId]: games })))
  }, [teamId, gameLogCache])

  const games = gameLogCache[teamId]
  const closeSplit: CloseGameSplit | undefined = games ? computeCloseGameSplit(games) : undefined

  const owed = useMemo(() => [...leagueLuck].sort((a, b) => a.luckWins - b.luckWins).slice(0, 5), [leagueLuck])
  const stolen = useMemo(() => [...leagueLuck].sort((a, b) => b.luckWins - a.luckWins).slice(0, 5), [leagueLuck])

  if (!teamLuck) return null

  const residual = closeSplit ? teamLuck.luckWins - closeSplit.luckWins : 0
  const afterResidual = teamLuck.pytWins + residual
  const actual = teamLuck.wins

  const segments: Segment[] = closeSplit ? [
    { label: 'Pythagorean-expected wins', from: 0, to: teamLuck.pytWins, color: NEUTRAL, detail: `${teamLuck.pytWins.toFixed(1)} wins from real run differential` },
    { label: 'Other sequencing luck', from: teamLuck.pytWins, to: afterResidual, color: residual >= 0 ? GOOD : BAD, detail: fmtWins(residual) },
    { label: `Close-game luck (${closeSplit.wins}-${closeSplit.losses} in 1-run/extra innings)`, from: afterResidual, to: actual, color: closeSplit.luckWins >= 0 ? GOOD : BAD, clickable: true, detail: fmtWins(closeSplit.luckWins) },
    { label: 'Actual record', from: 0, to: actual, color: ORANGE, detail: `${teamLuck.wins}-${teamLuck.losses}` },
  ] : []

  const maxScale = Math.max(teamLuck.pytWins, actual, afterResidual) * 1.15

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-[13px] font-serif font-bold text-[#1A1A1A]">Deserve-to-win waterfall</div>
          <div className="text-[10px] text-[#8A8577] mt-0.5 max-w-[460px]">
            Real Pythagorean-expected wins (from real run differential) walked to the real record, through real close-game luck. Click the close-game bar for the games.
          </div>
        </div>
        <select value={teamId} onChange={e => { setTeamId(Number(e.target.value)); setShowCloseGames(false) }} className="text-[11px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer">
          {teamOptions.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
      </div>

      {!closeSplit ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">Loading season log…</div>
      ) : (
        <>
          <div>
            {segments.map(seg => (
              <WaterfallBar
                key={seg.label}
                seg={seg}
                maxScale={maxScale}
                active={!!seg.clickable && showCloseGames}
                onClick={seg.clickable ? () => setShowCloseGames(s => !s) : undefined}
              />
            ))}
          </div>

          {showCloseGames && (
            <div style={{ background: '#FAF8F3', borderRadius: 8, padding: '8px 10px', marginBottom: 8, maxHeight: 220, overflowY: 'auto' }}>
              {closeSplit.games.slice().reverse().map(g => (
                <div key={g.gamePk} className="flex items-center gap-2 text-[10px] py-1 border-b border-[#F0EFEC] last:border-0">
                  <span className="text-[#8A8577] w-14 shrink-0">{fmtDate(g.date)}</span>
                  <span className="text-[#1A1A1A] flex-1 truncate">{g.home ? 'vs' : '@'} {g.opponentName}{g.innings > 9 ? ` (F/${g.innings})` : ''}</span>
                  <span className="font-bold shrink-0" style={{ color: g.win ? GOOD : BAD }}>{g.win ? 'W' : 'L'} {g.runsFor}-{g.runsAgainst}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#F0EFEC]">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: BAD }}>Wins still owed (league)</div>
              {owed.map(t => (
                <div key={t.teamId} className="flex items-center gap-1.5 py-0.5" style={{ fontWeight: t.teamId === teamId ? 700 : 400 }}>
                  <img src={teamLogoUrl(t.teamId)} alt="" width={13} height={13} style={{ width: 13, height: 13 }} />
                  <span className="text-[10px] flex-1 truncate">{t.teamName}</span>
                  <span className="text-[10px] tabular-nums" style={{ color: BAD }}>{fmtWins(t.luckWins)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: GOOD }}>Wins already stolen (league)</div>
              {stolen.map(t => (
                <div key={t.teamId} className="flex items-center gap-1.5 py-0.5" style={{ fontWeight: t.teamId === teamId ? 700 : 400 }}>
                  <img src={teamLogoUrl(t.teamId)} alt="" width={13} height={13} style={{ width: 13, height: 13 }} />
                  <span className="text-[10px] flex-1 truncate">{t.teamName}</span>
                  <span className="text-[10px] tabular-nums" style={{ color: GOOD }}>{fmtWins(t.luckWins)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
