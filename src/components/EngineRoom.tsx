// src/components/EngineRoom.tsx
//
// "Engine Room" — a ranked strip of every player who's appeared for a team
// this real season, by a real runs-above-average value score (see
// src/lib/engine-room.ts for why this isn't called WAR), tagged by how
// they actually joined the roster this year. The header number — top 7
// players' share of total real positive value created — is the actual
// "how concentrated is this team" read: high share means fragile, low
// share means the radar's "rounded" claim has teeth.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import { getEngineRoom, type EngineRoomPlayer, type PlayerRole } from '@/lib/engine-room'

const GOOD = '#059669'
const BAD = '#DC2626'
const ORANGE = '#FF5722'
const BLUE = '#185FA5'
const SIGN = '#8B5CF6'
const NEUTRAL = '#8A8577'
const SEASON = new Date().getFullYear()

const ROLE_COLOR: Record<PlayerRole, string> = { regular: NEUTRAL, callup: BLUE, trade: ORANGE, signing: SIGN }
const ROLE_LABEL: Record<PlayerRole, string> = { regular: 'Opening Day / organic roster', callup: 'Call-up', trade: 'Trade acquisition', signing: 'Signing' }

function ValueBar({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 50 : 0
  const positive = value >= 0
  return (
    <div style={{ position: 'relative', height: 6, width: 120, background: '#F0EFEC', borderRadius: 3 }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(26,26,26,0.2)' }} />
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0,
          left: positive ? '50%' : `${50 - pct}%`,
          width: `${pct}%`,
          background: positive ? GOOD : BAD,
          borderRadius: 3,
        }}
      />
    </div>
  )
}

function PlayerRow({ p, maxAbs }: { p: EngineRoomPlayer; maxAbs: number }) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-[#F0EFEC] last:border-0">
      <img src={p.headshot} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      <div className="min-w-0" style={{ width: 118 }}>
        <div className="text-[10.5px] font-bold text-[#1A1A1A] truncate">{p.name}</div>
        <div className="text-[8.5px] text-[#8A8577] truncate">{p.line}</div>
      </div>
      <span
        className="text-[7.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
        style={{ color: '#fff', background: ROLE_COLOR[p.role] }}
      >
        {p.group === 'Pitching' ? 'P' : 'B'} · {p.role === 'regular' ? 'Reg' : p.role === 'callup' ? 'Call-up' : p.role === 'trade' ? 'Trade' : 'Sign'}
      </span>
      <ValueBar value={p.value} maxAbs={maxAbs} />
      <div className="text-[11px] font-bold tabular-nums w-10 text-right shrink-0" style={{ color: p.value >= 0 ? GOOD : BAD }}>
        {p.value >= 0 ? '+' : ''}{p.value.toFixed(0)}
      </div>
    </div>
  )
}

export default function EngineRoom() {
  const teamOptions = useMemo(() => [...MLB_TEAMS].sort((a, b) => a.short.localeCompare(b.short)), [])
  const [teamId, setTeamId] = useState<number>(teamOptions[0]?.id)
  const [cache, setCache] = useState<Record<number, EngineRoomPlayer[]>>({})

  useEffect(() => {
    if (cache[teamId] !== undefined) return
    getEngineRoom(teamId, SEASON).then(players => setCache(prev => ({ ...prev, [teamId]: players })))
  }, [teamId, cache])

  const players = cache[teamId]
  const loading = players === undefined

  const { top7Share, maxAbs } = useMemo(() => {
    if (!players || players.length === 0) return { top7Share: 0, maxAbs: 1 }
    const positive = players.filter(p => p.value > 0)
    const totalPositive = positive.reduce((s, p) => s + p.value, 0)
    const top7 = [...players].sort((a, b) => b.value - a.value).slice(0, 7).reduce((s, p) => s + Math.max(0, p.value), 0)
    const maxAbs = Math.max(1, ...players.map(p => Math.abs(p.value)))
    return { top7Share: totalPositive > 0 ? Math.round((top7 / totalPositive) * 100) : 0, maxAbs }
  }, [players])

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-[13px] font-serif font-bold text-[#1A1A1A]">Engine room</div>
          <div className="text-[10px] text-[#8A8577] mt-0.5 max-w-[460px]">
            Real runs above a real league-average hitter/pitcher, for everyone who&apos;s appeared — not WAR, see why in the code comments. Tagged by how they actually joined the roster.
          </div>
        </div>
        <select value={teamId} onChange={e => setTeamId(Number(e.target.value))} className="text-[11px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer">
          {teamOptions.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">Building the roster value line…</div>
      ) : players.length === 0 ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">No qualifying players yet this season.</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3 pb-3 border-b border-[#F0EFEC]">
            <span className="text-[28px] font-black leading-none" style={{ color: ORANGE }}>{top7Share}%</span>
            <span className="text-[10.5px] text-[#8A8577] max-w-[360px]">
              of the team&apos;s real total positive value comes from the top 7 players — high is fragile, low says the radar&apos;s &quot;rounded&quot; claim has teeth.
            </span>
          </div>
          <div>
            {players.slice(0, 12).map(p => <PlayerRow key={p.personId} p={p} maxAbs={maxAbs} />)}
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-3 text-[9px] text-[#8A8577]">
            {(Object.keys(ROLE_LABEL) as PlayerRole[]).map(role => (
              <span key={role} className="flex items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: ROLE_COLOR[role], display: 'inline-block' }} />
                {ROLE_LABEL[role]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
