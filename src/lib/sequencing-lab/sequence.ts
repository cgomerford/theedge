// src/lib/sequencing-lab/sequence.ts
//
// Pure logic (no database, no browser): turns one pitcher's stored pitches (pitch_events rows) into an ordered sequence with the count before each pitch,
// the pitch thrown before and after it inside the same at-bat, and a result class. The Sequencing Lab filters this by pitch, zone and result.
//
// The count is rebuilt from the call on each pitch because pitch_events has no count column: a ball adds a ball; a called or swinging strike, a foul tip or a missed bunt
// adds a strike; a foul adds a strike only while there are fewer than two; a ball in play or a hit by pitch ends the at-bat. Counts are what the calls imply, not a stored field.

export type ResultCode = 'B' | 'C' | 'W' | 'F' | 'XH' | 'XO'
export const RESULTS: { code: ResultCode; label: string }[] = [
  { code: 'B', label: 'Ball' }, { code: 'C', label: 'Called strike' }, { code: 'W', label: 'Swinging strike' },
  { code: 'F', label: 'Foul' }, { code: 'XH', label: 'In play, a hit' }, { code: 'XO', label: 'In play, an out' },
]

export type EventRow = { game_pk: number | string; at_bat_number: number | string; pitch_number: number | string; pitch_type: string | null; description: string | null; events: string | null; zone: number | string | null }

/** One pitch. `p` and `n` are the pitch types thrown just before and after in the same at-bat ('' = none: first pitch / last pitch of the at-bat). */
export type SeqPitch = { t: string; z: number; r: ResultCode; b: number; s: number; p: string; n: string; nr: ResultCode | '' }

const BALLS = new Set(['ball', 'blocked_ball', 'pitchout', 'automatic_ball', 'intent_ball', 'hit_by_pitch'])
const STRIKES = new Set(['called_strike', 'swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt', 'automatic_strike'])
const FOULS = new Set(['foul', 'foul_bunt', 'bunt_foul_tip'])
const HITS = new Set(['single', 'double', 'triple', 'home_run'])

export function resultOf(description: string | null, events: string | null): ResultCode | null {
  const d = description ?? ''
  if (BALLS.has(d)) return 'B'
  if (d === 'called_strike' || d === 'automatic_strike') return 'C'
  if (STRIKES.has(d)) return 'W'
  if (FOULS.has(d)) return 'F'
  if (d.startsWith('hit_into_play')) return HITS.has(events ?? '') ? 'XH' : 'XO'
  return null
}

export function buildSequence(rows: EventRow[]): SeqPitch[] {
  const sorted = [...rows].filter(r => r.pitch_type).sort((a, b) => Number(a.game_pk) - Number(b.game_pk) || Number(a.at_bat_number) - Number(b.at_bat_number) || Number(a.pitch_number) - Number(b.pitch_number))
  const out: SeqPitch[] = []
  let key = '', balls = 0, strikes = 0, prev = ''
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i], k = `${r.game_pk}|${r.at_bat_number}`
    if (k !== key) { key = k; balls = 0; strikes = 0; prev = '' }
    const res = resultOf(r.description, r.events)
    const next = sorted[i + 1] && `${sorted[i + 1].game_pk}|${sorted[i + 1].at_bat_number}` === k ? sorted[i + 1] : null
    if (res) {
      out.push({ t: r.pitch_type as string, z: Number(r.zone) || 0, r: res, b: balls, s: strikes, p: prev, n: next ? (next.pitch_type as string) : '', nr: next ? resultOf(next.description, next.events) ?? '' : '' })
    }
    if (res === 'B') balls += 1
    else if (res === 'C' || res === 'W') strikes += 1
    else if (res === 'F' && strikes < 2) strikes += 1
    prev = r.pitch_type as string
  }
  return out
}
