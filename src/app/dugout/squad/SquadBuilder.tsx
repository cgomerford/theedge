'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PoolPlayer, SquadLineup, SquadSlot } from '@/lib/ultimate-team-types'
import { ALL_SLOTS, HITTER_POSITIONS, PITCHER_SLOTS, positionsForSlot, gradeColor, gradeBg } from '@/lib/ultimate-team-types'

type Props = {
  initialLineup: SquadLineup
  initialPlayers: Record<number, PoolPlayer>
  initialGrade: string | null
  initialPercentile: number | null
}

// ============================================================
// Diamond position coordinates (percentage-based, responsive)
// ============================================================
const FIELD_POSITIONS: Record<string, { top: string; left: string }> = {
  CF:  { top: '8%',  left: '50%' },
  LF:  { top: '22%', left: '18%' },
  RF:  { top: '22%', left: '82%' },
  SS:  { top: '42%', left: '35%' },
  '2B': { top: '38%', left: '65%' },
  '3B': { top: '55%', left: '22%' },
  '1B': { top: '52%', left: '78%' },
  C:   { top: '78%', left: '50%' },
  DH:  { top: '68%', left: '10%' },
}

// ============================================================
// Player Card Component
// ============================================================
function PlayerCard({
  player,
  slot,
  onClick,
}: {
  player: PoolPlayer | null
  slot: SquadSlot
  onClick: () => void
}) {
  if (!player) {
    // Empty slot
    return (
      <button
        onClick={onClick}
        className="group flex flex-col items-center justify-center w-[100px] h-[130px] rounded-lg border-2 border-dashed border-white/20 bg-black/30 backdrop-blur-sm cursor-pointer transition-all hover:border-lime-400/60 hover:bg-black/50 hover:scale-105"
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">
          {slot.replace(/\d+$/, '')}
        </span>
        <span className="text-2xl text-white/20 group-hover:text-lime-400/60 transition">+</span>
      </button>
    )
  }

  const grade = player.grade ?? 'C'
  const color = gradeColor(grade)
  const bg = gradeBg(grade)

  // Key stat for display
  const keyStat = player.player_type === 'hitter'
    ? { label: 'OPS', value: player.ops?.toFixed(3) ?? '—' }
    : { label: 'ERA', value: player.era?.toFixed(2) ?? '—' }

  const secondaryStat = player.player_type === 'hitter'
    ? { label: 'HR', value: String(player.home_runs ?? 0) }
    : { label: 'K/9', value: player.k_per_9?.toFixed(1) ?? '—' }

  return (
    <button
      onClick={onClick}
      className="group flex flex-col w-[100px] h-[130px] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 hover:shadow-xl hover:shadow-black/40"
      style={{ background: '#1a1a1a' }}
    >
      {/* Grade header */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ background: bg }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/60">
          {player.primary_position}
        </span>
        <span
          className="text-sm font-black font-mono"
          style={{ color }}
        >
          {grade}
        </span>
      </div>

{/* Player info with headshot */}
      <div className="flex-grow flex flex-col items-center justify-center px-2 py-1 relative overflow-hidden">
        {/* Headshot watermark behind text */}
        <div
         className="absolute inset-0 opacity-[0.35] bg-center bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(https://img.mlb.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current)`,
          }}
        />
        <span className="text-[11px] font-bold text-white text-center leading-tight truncate w-full relative z-10">
          {player.full_name.split(' ').pop()}
        </span>
        <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider mt-0.5 relative z-10">
          {player.team_short}
        </span>
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-white/5 border-t border-white/10">
        <div className="text-center flex-1">
          <div className="text-[9px] font-mono text-white/40 uppercase">{keyStat.label}</div>
          <div className="text-[11px] font-mono font-bold text-white">{keyStat.value}</div>
        </div>
        <div className="w-px h-5 bg-white/10" />
        <div className="text-center flex-1">
          <div className="text-[9px] font-mono text-white/40 uppercase">{secondaryStat.label}</div>
          <div className="text-[11px] font-mono font-bold text-white">{secondaryStat.value}</div>
        </div>
      </div>

      {/* Percentile bar at very bottom */}
      <div className="h-1 w-full bg-white/10">
        <div
          className="h-full transition-all"
          style={{
            width: `${player.position_percentile ?? 0}%`,
            background: color,
          }}
        />
      </div>
    </button>
  )
}

// ============================================================
// Player Picker Modal
// ============================================================
function PlayerPicker({
  slot,
  onSelect,
  onClose,
  currentPlayerIds,
}: {
  slot: SquadSlot
  onSelect: (player: PoolPlayer) => void
  onClose: () => void
  currentPlayerIds: number[]
}) {
  const [players, setPlayers] = useState<PoolPlayer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const positions = positionsForSlot(slot)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('position', positions[0])
    if (search.trim()) params.set('search', search.trim())

    fetch(`/api/squad/players?${params}`)
      .then(r => r.json())
      .then(data => {
        setPlayers(data.players ?? [])
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [search, positions[0]])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-white font-serif text-xl">
              Select {slot.replace(/\d+$/, '')}
            </h3>
            <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mt-1">
              {positions.join(' / ')} · sorted by percentile
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-xl px-2"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/10">
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/30 font-mono focus:outline-none focus:border-lime-400/40"
            autoFocus
          />
        </div>

        {/* Player list */}
        <div className="flex-grow overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-white/40 font-mono text-sm">Loading...</div>
          ) : players.length === 0 ? (
            <div className="p-8 text-center text-white/40 font-mono text-sm">No players found</div>
          ) : (
            players.map(player => {
              const isAlreadyPicked = currentPlayerIds.includes(player.player_id)
              const grade = player.grade ?? 'C'
              const color = gradeColor(grade)
              const keyStat = player.player_type === 'hitter'
                ? `${player.ops?.toFixed(3) ?? '—'} OPS`
                : `${player.era?.toFixed(2) ?? '—'} ERA`

              return (
                <button
                  key={player.player_id}
                  onClick={() => { if (!isAlreadyPicked) onSelect(player) }}
                  disabled={isAlreadyPicked}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 transition ${
                    isAlreadyPicked
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-white/5 cursor-pointer'
                  }`}
                >
                  {/* Grade badge */}
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-sm flex-shrink-0"
                    style={{ background: gradeBg(grade), color }}
                  >
                    {grade}
                  </span>

                  {/* Name + team */}
                  <div className="flex-grow text-left min-w-0">
                    <div className="text-white text-sm font-bold truncate">{player.full_name}</div>
                    <div className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                      {player.team_short} · {player.primary_position} · {keyStat}
                    </div>
                  </div>

                  {/* Percentile */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-white/60 text-xs font-mono">
                      {Math.round(player.position_percentile ?? 0)}th
                    </div>
                    <div className="text-white/30 text-[10px] font-mono uppercase">pctl</div>
                  </div>

                  {isAlreadyPicked && (
                    <span className="text-[10px] font-mono text-white/30 uppercase">In squad</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main Squad Builder
// ============================================================
export default function SquadBuilder({
  initialLineup,
  initialPlayers,
  initialGrade,
  initialPercentile,
}: Props) {
  const [lineup, setLineup] = useState<SquadLineup>(initialLineup)
  const [players, setPlayers] = useState<Record<number, PoolPlayer>>(initialPlayers)
  const [squadGrade, setSquadGrade] = useState(initialGrade)
  const [saving, setSaving] = useState(false)
  const [activeSlot, setActiveSlot] = useState<SquadSlot | null>(null)

  // All currently assigned player IDs (for deduplication in picker)
  const currentPlayerIds = Object.values(lineup).filter((id): id is number => id != null)

  // Filled count
  const filledCount = currentPlayerIds.length
  const totalSlots = ALL_SLOTS.length // 14

  // Save to backend
  const save = useCallback(async (newLineup: SquadLineup) => {
    setSaving(true)
    try {
      const res = await fetch('/api/squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineup: newLineup }),
      })
      const data = await res.json()
      if (data.squad_grade) setSquadGrade(data.squad_grade)
    } catch (err) {
      console.error('Save failed:', err)
    }
    setSaving(false)
  }, [])

  // Handle player selection from picker
  function handleSelect(player: PoolPlayer) {
    if (!activeSlot) return

    const newLineup = { ...lineup, [activeSlot]: player.player_id }
    const newPlayers = { ...players, [player.player_id]: player }

    setLineup(newLineup)
    setPlayers(newPlayers)
    setActiveSlot(null)

    // Auto-save
    save(newLineup)
  }

  // Handle removing a player from a slot
  function handleRemove(slot: SquadSlot) {
    const newLineup = { ...lineup }
    delete newLineup[slot]

    setLineup(newLineup)

    // Auto-save
    save(newLineup)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-lime-400/80 mb-1">
            ⊕ Ultimate Team · Pro
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-light text-white tracking-tight">
            My Squad<span className="text-lime-400">.</span>
          </h1>
        </div>

        <div className="text-right">
          {squadGrade && (
            <div
              className="text-5xl font-black font-mono leading-none"
              style={{ color: gradeColor(squadGrade) }}
            >
              {squadGrade}
            </div>
          )}
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 mt-1">
            {filledCount}/{totalSlots} filled
            {saving && <span className="ml-2 text-lime-400">saving...</span>}
          </div>
        </div>
      </div>

      {/* ═══ DIAMOND FIELD ═══ */}
      <div
        className="relative w-full rounded-2xl overflow-hidden mb-8"
        style={{
          aspectRatio: '16/10',
          background: 'radial-gradient(ellipse 120% 100% at 50% 100%, #2d5016 0%, #1a3a0a 40%, #0d1f05 70%, #0a0f0d 100%)',
        }}
      >
        {/* Diamond lines (decorative) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1000 625"
          preserveAspectRatio="none"
          style={{ opacity: 0.15 }}
        >
          {/* Infield diamond */}
          <polygon
            points="500,520 350,400 500,280 650,400"
            fill="none"
            stroke="white"
            strokeWidth="2"
          />
          {/* Outfield arc */}
          <path
            d="M 150,400 Q 500,50 850,400"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
          />
          {/* Base paths */}
          <line x1="500" y1="520" x2="350" y2="400" stroke="white" strokeWidth="1" />
          <line x1="350" y1="400" x2="500" y2="280" stroke="white" strokeWidth="1" />
          <line x1="500" y1="280" x2="650" y2="400" stroke="white" strokeWidth="1" />
          <line x1="650" y1="400" x2="500" y2="520" stroke="white" strokeWidth="1" />
          {/* Bases */}
          <rect x="345" y="395" width="10" height="10" fill="white" transform="rotate(45 350 400)" />
          <rect x="495" y="275" width="10" height="10" fill="white" transform="rotate(45 500 280)" />
          <rect x="645" y="395" width="10" height="10" fill="white" transform="rotate(45 650 400)" />
          {/* Home plate */}
          <polygon points="500,520 494,514 494,508 506,508 506,514" fill="white" />
        </svg>

        {/* Position cards — absolutely positioned on the field */}
        {(Object.entries(FIELD_POSITIONS) as [string, { top: string; left: string }][]).map(
          ([pos, coords]) => {
            const slot = pos as SquadSlot
            const playerId = lineup[slot]
            const player = playerId ? players[playerId] ?? null : null

            return (
              <div
                key={slot}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ top: coords.top, left: coords.left }}
              >
                <PlayerCard
                  player={player}
                  slot={slot}
                  onClick={() => setActiveSlot(slot)}
                />
              </div>
            )
          }
        )}
      </div>

      {/* ═══ PITCHING ROTATION ═══ */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6 mb-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-4">
          ⊕ Pitching staff
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {PITCHER_SLOTS.map(slot => {
            const playerId = lineup[slot]
            const player = playerId ? players[playerId] ?? null : null

            return (
              <div key={slot} className="flex flex-col items-center gap-1">
                <PlayerCard
                  player={player}
                  slot={slot}
                  onClick={() => setActiveSlot(slot)}
                />
                <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">
                  {slot}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ ROSTER TABLE (quick reference) ═══ */}
      {filledCount > 0 && (
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">
              ⊕ Roster overview
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left p-3 text-[10px] font-mono uppercase tracking-widest text-white/40">Pos</th>
                <th className="text-left p-3 text-[10px] font-mono uppercase tracking-widest text-white/40">Player</th>
                <th className="text-center p-3 text-[10px] font-mono uppercase tracking-widest text-white/40">Grade</th>
                <th className="text-right p-3 text-[10px] font-mono uppercase tracking-widest text-white/40">Key stat</th>
                <th className="text-right p-3 text-[10px] font-mono uppercase tracking-widest text-white/40"></th>
              </tr>
            </thead>
            <tbody>
              {ALL_SLOTS.map(slot => {
                const playerId = lineup[slot]
                if (!playerId) return null
                const player = players[playerId]
                if (!player) return null

                const grade = player.grade ?? 'C'
                const keyStat = player.player_type === 'hitter'
                  ? `${player.ops?.toFixed(3) ?? '—'} OPS`
                  : `${player.era?.toFixed(2) ?? '—'} ERA`

                return (
                  <tr key={slot} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white/60 font-mono text-xs">{slot}</td>
                    <td className="p-3 text-white font-bold">{player.full_name}</td>
                    <td className="p-3 text-center">
                      <span
                        className="px-2 py-0.5 rounded font-mono font-bold text-xs"
                        style={{ background: gradeBg(grade), color: gradeColor(grade) }}
                      >
                        {grade}
                      </span>
                    </td>
                    <td className="p-3 text-right text-white/60 font-mono text-xs">{keyStat}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemove(slot)}
                        className="text-white/20 hover:text-red-500 text-xs font-mono transition"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ PICKER MODAL ═══ */}
      {activeSlot && (
        <PlayerPicker
          slot={activeSlot}
          onSelect={handleSelect}
          onClose={() => setActiveSlot(null)}
          currentPlayerIds={currentPlayerIds}
        />
      )}
    </div>
  )
}