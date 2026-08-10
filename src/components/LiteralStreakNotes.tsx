'use client'

// src/components/LiteralStreakNotes.tsx
//
// Literal consecutive-game streak notes — "Stott hit in 6 straight",
// "Marsh on base in 12 straight", "Ranger Suárez going for 10 straight
// scoreless innings." Deliberately separate from BatterStreakBoard, which
// shows validated statistical peak/trough detection (rolling OPS/AVG/SLG
// vs a real backtested method — see fetch_player_form.py). This card is
// the other, simpler kind of "notable": a plain factual counting streak,
// true right now, no statistical modeling involved.
//
// Data source: src/lib/streaks.ts's getTopBatterStreaks()/getPitcherTrend()
// — a live MLB API fetch at render time, not a stored/cron table. Reuses
// on_base_streak/hit_streak/current_scoreless_innings exactly as computed
// there; this component only decides which counts are worth a note and
// how to word them.

type BatterStreakInput = {
  player_id: number
  player_name: string
  on_base_streak: number
  hit_streak: number
  is_hot: boolean
  is_cold: boolean
}

type PitcherTrendInput = {
  player_id: number
  player_name: string
  current_scoreless_innings: number
} | null

type Note = { id: string; text: string; tone: 'hot' | 'cold' | 'neutral' }

// Thresholds chosen to be genuinely notable without being so strict the
// card sits empty most nights — adjust here if real usage says otherwise.
const MIN_HIT_STREAK = 4
const MIN_ON_BASE_STREAK = 6
const MIN_SCORELESS_INNINGS = 6 // roughly one full quality start

function buildBatterNotes(batters: BatterStreakInput[]): Note[] {
  const notes: Note[] = []
  for (const b of batters) {
    // On-base streak takes priority over hit streak when both qualify —
    // it's the stronger, more inclusive claim (a hit streak is a subset
    // of ways to reach base), so don't double-note the same player.
    if (b.on_base_streak >= MIN_ON_BASE_STREAK) {
      notes.push({
        id: `${b.player_id}-onbase`,
        text: `${lastName(b.player_name)} on base in ${b.on_base_streak} straight`,
        tone: 'hot',
      })
    } else if (b.hit_streak >= MIN_HIT_STREAK) {
      notes.push({
        id: `${b.player_id}-hit`,
        text: `${lastName(b.player_name)} hit in ${b.hit_streak} straight`,
        tone: 'hot',
      })
    }
  }
  return notes
}

function buildPitcherNote(pitcher: PitcherTrendInput): Note | null {
  if (!pitcher || pitcher.current_scoreless_innings < MIN_SCORELESS_INNINGS) return null
  const innings = Number.isInteger(pitcher.current_scoreless_innings)
    ? pitcher.current_scoreless_innings
    : pitcher.current_scoreless_innings.toFixed(1)
  return {
    id: `${pitcher.player_id}-scoreless`,
    text: `${lastName(pitcher.player_name)} carrying a ${innings}-inning scoreless streak`,
    tone: 'hot',
  }
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : fullName
}

export default function LiteralStreakNotes({
  teamAbbr, color, batters, pitcher,
}: {
  teamAbbr: string
  color: string
  batters: BatterStreakInput[]
  pitcher: PitcherTrendInput
}) {
  const notes = [...buildBatterNotes(batters)]
  const pitcherNote = buildPitcherNote(pitcher)
  if (pitcherNote) notes.push(pitcherNote)

  if (notes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-center" style={{ borderLeft: `3px solid ${color}` }}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{teamAbbr} · Streak Watch</p>
        <p className="text-xs font-serif italic text-stone-400 mt-1">No active streaks tonight.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="px-3 py-2 border-b border-stone-100" style={{ background: `linear-gradient(135deg, ${color}12, transparent 70%)` }}>
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamAbbr} · Streak Watch</span>
      </div>
      <div>
        {notes.map(n => (
          <div key={n.id} className="px-3 py-2 flex items-start gap-2 border-b border-stone-50 last:border-0">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
              style={{ background: n.tone === 'hot' ? '#16a34a' : n.tone === 'cold' ? '#dc2626' : color }}
            />
            <p className="text-[12px] text-stone-700 leading-snug">{n.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
