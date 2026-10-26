// src/app/api/lab/swing-pitches/route.ts
//
// The pitches behind one cell of the Swing Lab decision grid (up to 50, most recent first, with the outcome of each).
// PRO ONLY (requirePro). Runs when a viewer taps a cell — never during page render. It reads the same per-batter
// Savant pitch log the Location Lab uses (getBatterPitchLog: cached in savant_fetch_cache for 6 h) and files each pitch
// with classifyPitch, the same rules scripts/build_swing_decisions.py used to build the grid, so the list always
// matches the cell's count.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchLog } from '@/lib/batter-pitch-log'
import { COUNT_GROUPS, FAMILIES, SEASON, classifyPitch, type CountGroup, type Family, type HandFilter } from '@/lib/swing-decisions/model'
import { requireAnyDeepLook } from '@/lib/deep-look'

const LIMIT = 50

function outcome(description: string | null, result: string | null): string {
  switch (description) {
    case 'swinging_strike': case 'swinging_strike_blocked': return 'Swinging strike'
    case 'foul': case 'foul_tip': return 'Foul'
    case 'ball': return 'Ball'
    case 'blocked_ball': return 'Ball in the dirt'
    case 'called_strike': return 'Called strike'
    case 'hit_into_play': {
      const r = (result ?? '').replace(/_/g, ' ')
      return r ? `In play · ${r}` : 'In play'
    }
    default: return description ?? ''
  }
}

export async function GET(req: NextRequest) {
  // Guard: Pro, or today's free deep look for this player (lib/deep-look.ts). The UI lock is not the gate.
  const denied = await requireAnyDeepLook([['batting_lab', new URL(req.url).searchParams.get('batterId')]])
  if (denied) return denied
  const sp = new URL(req.url).searchParams
  const batterId = Number(sp.get('batterId'))
  const count = sp.get('count') as CountGroup | null
  const family = sp.get('family') as Family | null
  const hand = (sp.get('hand') ?? 'all') as HandFilter
  const r = Number(sp.get('r')), c = Number(sp.get('c'))
  if (!batterId || !count || !family || !COUNT_GROUPS.some(g => g.key === count) || !FAMILIES.some(f => f.key === family)
    || !['all', 'R', 'L'].includes(hand) || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 4 || c < 0 || c > 4) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 })
  }

  const log = await getBatterPitchLog(batterId, SEASON)
  if (!log) return NextResponse.json({ total: 0, pitches: [], unavailable: true })

  const hits = []
  for (const p of log.pitches) {
    const k = classifyPitch(p)
    if (!k || k.group !== count || k.family !== family || k.r !== r || k.c !== c || (hand !== 'all' && k.hand !== hand)) continue
    hits.push({ p, k })
  }
  hits.sort((a, b) => (b.p.date.localeCompare(a.p.date)) || ((b.p.gamePk ?? 0) - (a.p.gamePk ?? 0)) || ((b.p.atBatNumber ?? 0) - (a.p.atBatNumber ?? 0)) || ((b.p.pitchNumber ?? 0) - (a.p.pitchNumber ?? 0)))

  return NextResponse.json({
    total: hits.length,
    pitches: hits.slice(0, LIMIT).map(({ p, k }) => ({
      date: p.date,
      count: `${p.balls}-${p.strikes}`,
      pitch: log.pitchNames[p.pitchType] ?? p.pitchType,
      pitcher: p.pitcherId != null ? (log.pitcherNames[p.pitcherId] ?? null) : null,
      hand: `${k.hand}HP`,
      x: p.plateX, z: p.plateZ,
      swing: k.swing,
      outcome: outcome(p.description, p.result),
    })),
  })
}
